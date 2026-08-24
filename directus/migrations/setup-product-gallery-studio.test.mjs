import test from "node:test";
import assert from "node:assert/strict";

import {
  GALLERY_DISPLAY_ID,
  PRODUCT_GALLERY_PATCHES,
  runProductGalleryStudioSetup,
} from "./setup-product-gallery-studio.mjs";

const currentFields = ({ ready = false } = {}) => ({
  products: [
    {
      field: "main_image",
      meta: {
        interface: "file-image",
        options: ready ? { crop: false } : null,
        hidden: false,
        readonly: false,
      },
    },
    {
      field: "gallery",
      meta: ready
        ? PRODUCT_GALLERY_PATCHES["products.gallery"]
        : {
            interface: "list",
            options: { template: "{{alt_text}}", fields: [] },
            hidden: false,
            readonly: false,
          },
    },
    {
      field: "image_items",
      meta: ready
        ? PRODUCT_GALLERY_PATCHES["products.image_items"]
        : {
            interface: "select-dropdown-m2o",
            options: null,
            hidden: true,
            readonly: false,
            display: null,
          },
    },
  ],
  product_images: [
    {
      field: "image",
      meta: ready
        ? PRODUCT_GALLERY_PATCHES["product_images.image"]
        : {
            interface: "select-dropdown-m2o",
            options: null,
            hidden: false,
            readonly: false,
            display: null,
          },
    },
  ],
});

const canonicalRelation = {
  collection: "product_images",
  field: "product",
  related_collection: "products",
  meta: {
    many_collection: "product_images",
    many_field: "product",
    one_collection: "products",
    one_field: "image_items",
    junction_field: null,
    sort_field: "sort_order",
  },
};

const fakeClient = ({ fields = currentFields(), relation = canonicalRelation } = {}) => {
  const requests = [];
  return {
    requests,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method !== "GET") return null;
      if (path === "/fields/products") return fields.products;
      if (path === "/fields/product_images") return fields.product_images;
      if (path.startsWith("/relations")) return relation ? [relation] : [];
      throw new Error(`unexpected request ${method} ${path}`);
    },
  };
};

const writes = (client) => client.requests.filter(({ method }) => method !== "GET");

test("declares only the four product-media presentation patches", () => {
  assert.equal(GALLERY_DISPLAY_ID, "deere-shop-image-contain");
  assert.deepEqual(Object.keys(PRODUCT_GALLERY_PATCHES), [
    "products.main_image",
    "products.gallery",
    "products.image_items",
    "product_images.image",
  ]);

  assert.deepEqual(PRODUCT_GALLERY_PATCHES["products.main_image"], {
    interface: "file-image",
    options: { crop: false },
  });
  assert.equal(
    PRODUCT_GALLERY_PATCHES["products.gallery"].interface,
    "deere-shop-product-gallery-preview",
  );
  assert.equal(PRODUCT_GALLERY_PATCHES["products.gallery"].hidden, false);
  assert.equal(PRODUCT_GALLERY_PATCHES["products.gallery"].readonly, true);
  assert.deepEqual(PRODUCT_GALLERY_PATCHES["products.image_items"].options, {
    layout: "list",
    template: "{{image}} {{alt_text}}",
    enableCreate: true,
    enableSelect: false,
    limit: 15,
  });
  assert.equal(PRODUCT_GALLERY_PATCHES["products.image_items"].hidden, false);
  assert.equal(PRODUCT_GALLERY_PATCHES["product_images.image"].display, GALLERY_DISPLAY_ID);
  assert.deepEqual(PRODUCT_GALLERY_PATCHES["product_images.image"].options, { crop: false });
});

test("dry run plans the cutover without writing", async () => {
  const client = fakeClient();
  const result = await runProductGalleryStudioSetup(client);

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.noop, false);
  assert.deepEqual(result.actions.map(({ field }) => field), [
    "products.main_image",
    "products.gallery",
    "products.image_items",
    "product_images.image",
  ]);
  assert.equal(writes(client).length, 0);
});

test("apply requires a release id and patches only the declared field metadata", async () => {
  const blocked = fakeClient();
  await assert.rejects(
    () => runProductGalleryStudioSetup(blocked, { apply: true }),
    /release-id/i,
  );
  assert.equal(writes(blocked).length, 0);

  const client = fakeClient();
  const result = await runProductGalleryStudioSetup(client, {
    apply: true,
    releaseId: "product-gallery-studio-2026-08-20",
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.deepEqual(
    writes(client).map(({ path, method, body }) => ({
      path,
      method,
      meta: JSON.parse(body).meta,
    })),
    Object.entries(PRODUCT_GALLERY_PATCHES).map(([key, meta]) => {
      const [collection, field] = key.split(".");
      return {
        path: `/fields/${collection}/${field}`,
        method: "PATCH",
        meta,
      };
    }),
  );
});

test("refuses to write unless the existing canonical O2M relation is intact", async () => {
  const client = fakeClient({
    relation: {
      ...canonicalRelation,
      meta: { ...canonicalRelation.meta, one_field: "gallery_files" },
    },
  });

  const result = await runProductGalleryStudioSetup(client, {
    apply: true,
    releaseId: "product-gallery-studio-2026-08-20",
  });

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.match(result.blockers[0], /image_items/);
  assert.equal(writes(client).length, 0);
});

test("an already configured Studio is an idempotent no-op", async () => {
  const client = fakeClient({ fields: currentFields({ ready: true }) });
  const result = await runProductGalleryStudioSetup(client, {
    apply: true,
    releaseId: "product-gallery-studio-2026-08-20",
  });

  assert.equal(result.ok, true);
  assert.equal(result.noop, true);
  assert.equal(writes(client).length, 0);
});
