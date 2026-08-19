import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

export const GALLERY_DISPLAY_ID = "deere-shop-image-contain";

export const PRODUCT_GALLERY_PATCHES = {
  "products.main_image": {
    interface: "file-image",
    options: { crop: false },
  },
  "products.gallery": {
    interface: "deere-shop-product-gallery-preview",
    hidden: false,
    readonly: true,
    width: "full",
    translations: [{ language: "ru-RU", translation: "Предпросмотр галереи" }],
    note: "Автоматический предпросмотр всех изображений из канонической связи product_images. Изменения выполняются в поле «Управление галереей» ниже.",
  },
  "products.image_items": {
    interface: "list-o2m",
    options: {
      layout: "list",
      template: "{{image}} {{alt_text}}",
      enableCreate: true,
      enableSelect: false,
      limit: 15,
    },
    hidden: false,
    width: "full",
    translations: [{ language: "ru-RU", translation: "Управление галереей" }],
    note: "Все изображения галереи из канонической связи product_images. Нажмите изображение, чтобы изменить файл, alt-текст или порядок.",
  },
  "product_images.image": {
    interface: "file-image",
    options: { crop: false },
    display: GALLERY_DISPLAY_ID,
  },
};

const sameConfiguredValues = (current = {}, desired = {}) =>
  Object.entries(desired).every(
    ([key, value]) =>
      JSON.stringify(current?.[key] ?? null) === JSON.stringify(value ?? null),
  );

const relationBlocker = (relations) => {
  const relation = relations.find((item) => {
    const meta = item?.meta ?? item;
    return (
      meta?.many_collection === "product_images" &&
      meta?.many_field === "product"
    );
  });
  const meta = relation?.meta ?? relation;
  if (!meta) {
    return "Missing canonical relation product_images.product → products.image_items";
  }
  if (
    meta.one_collection !== "products" ||
    meta.one_field !== "image_items" ||
    meta.junction_field != null ||
    meta.sort_field !== "sort_order"
  ) {
    return (
      "Canonical gallery relation must be product_images.product → " +
      "products.image_items with junction_field=null and sort_field=sort_order"
    );
  }
  return null;
};

export async function runProductGalleryStudioSetup(
  client,
  { apply = false, releaseId = null } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const relations = await client.request(
    "/relations?filter[many_collection][_eq]=product_images&filter[many_field][_eq]=product",
  );
  const blocker = relationBlocker(Array.isArray(relations) ? relations : []);
  if (blocker) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      blockers: [blocker],
      actions: [],
    };
  }

  const fieldsByCollection = new Map();
  for (const collection of ["products", "product_images"]) {
    const fields = await client.request(`/fields/${collection}`);
    fieldsByCollection.set(
      collection,
      new Map((Array.isArray(fields) ? fields : []).map((field) => [field.field, field])),
    );
  }

  const blockers = [];
  const actions = [];
  for (const [key, meta] of Object.entries(PRODUCT_GALLERY_PATCHES)) {
    const [collection, field] = key.split(".");
    const current = fieldsByCollection.get(collection)?.get(field);
    if (!current) {
      blockers.push(`Missing required field ${key}`);
      continue;
    }
    if (sameConfiguredValues(current.meta, meta)) continue;
    actions.push({ collection, field: key, fieldName: field, meta });
  }

  if (blockers.length > 0) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      blockers,
      actions: [],
    };
  }

  if (apply) {
    for (const action of actions) {
      await client.request(`/fields/${action.collection}/${action.fieldName}`, {
        method: "PATCH",
        body: JSON.stringify({ meta: action.meta }),
      });
    }
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop: actions.length === 0,
    releaseId,
    blockers: [],
    actions,
  };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const apply = process.argv.includes("--apply");
  const releaseId = argumentValue("release-id") ?? null;
  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await runProductGalleryStudioSetup(client, { apply, releaseId });

  if (!result.ok) {
    console.error(`STOP: ${result.blockers.length} blocker(s):`);
    for (const blocker of result.blockers) console.error(`- ${blocker}`);
    process.exitCode = 1;
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  console.log(`${verb} ${result.actions.length} product gallery Studio patch(es).`);
  for (const action of result.actions) {
    console.log(`- ${action.field}`);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
