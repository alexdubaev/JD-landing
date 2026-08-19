import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGalleryRequest,
  createGalleryPreviewVNode,
} from "../src/gallery-preview.mjs";
import { interfaceDefinition } from "../src/definition.mjs";

const h = (tag, props = {}, children = []) => ({ tag, props, children });

test("queries only the current product canonical gallery in manual order", () => {
  assert.deepEqual(buildGalleryRequest("product-123"), {
    params: {
      filter: { product: { _eq: "product-123" } },
      fields: [
        "id",
        "sort_order",
        "alt_text",
        "image.id",
        "image.title",
        "image.filename_download",
        "image.modified_on",
      ],
      sort: ["sort_order"],
      limit: -1,
    },
  });
});

test("renders every canonical image as an uncropped preview card", () => {
  const vnode = createGalleryPreviewVNode(h, [
    {
      id: "row-1",
      alt_text: "Вид сбоку",
      image: {
        id: "file-1",
        filename_download: "R130753_2.jpg",
        modified_on: "2026-08-20T10:00:00.000Z",
      },
    },
    {
      id: "row-2",
      image: { id: "file-2", filename_download: "R130753_3.jpg" },
    },
  ]);

  assert.equal(vnode.props.class, "deere-shop-gallery-preview");
  assert.equal(vnode.children.length, 2);
  for (const card of vnode.children) {
    const image = card.children[0];
    assert.equal(image.tag, "img");
    assert.match(image.props.src, /fit=contain/);
    assert.equal(image.props.style.objectFit, "contain");
    assert.equal(image.props.style.width, "100%");
    assert.equal(image.props.style.height, "180px");
  }
  assert.equal(vnode.children[0].children[0].props.alt, "Вид сбоку");
  assert.equal(vnode.children[0].children[1].children, "R130753_2.jpg");
});

test("renders stable loading, empty and error states", () => {
  assert.match(createGalleryPreviewVNode(h, [], { loading: true }).children, /Загружаем/);
  assert.match(createGalleryPreviewVNode(h, []).children, /нет изображений/);
  assert.match(createGalleryPreviewVNode(h, [], { error: "boom" }).children, /Не удалось/);
});

test("registers a read-only JSON interface for the existing gallery field", () => {
  assert.equal(interfaceDefinition.id, "deere-shop-product-gallery-preview");
  assert.deepEqual(interfaceDefinition.types, ["json"]);
});
