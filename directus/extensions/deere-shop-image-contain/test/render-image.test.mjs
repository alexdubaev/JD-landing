import test from "node:test";
import assert from "node:assert/strict";

import { createContainImageVNode } from "../src/render-image.mjs";
import { displayDefinition } from "../src/definition.mjs";

const h = (tag, props = {}, children = []) => ({ tag, props, children });

test("renders the complete Directus image with contain instead of cover", () => {
  const vnode = createContainImageVNode(h, {
    id: "50df118e-561e-4b23-bc93-5baa14d4d54c",
    title: "R130753 — вид сбоку",
    filename_download: "R130753_2.jpg",
    modified_on: "2026-08-19T12:34:56.000Z",
  });

  assert.equal(vnode.tag, "figure");
  const image = vnode.children[0];
  assert.equal(image.tag, "img");
  assert.match(image.props.src, /^\/assets\/50df118e-/);
  assert.match(image.props.src, /fit=contain/);
  assert.doesNotMatch(image.props.src, /cover/);
  assert.equal(image.props.style.objectFit, "contain");
  assert.equal(image.props.style.height, "32px");
  assert.equal(image.props.style.width, "56px");
  assert.equal(vnode.props.style.flexDirection, "row");
  assert.equal(image.props.alt, "R130753 — вид сбоку");
  assert.equal(vnode.children[1].children, "R130753_2.jpg");
});

test("renders a stable empty state without an invalid asset request", () => {
  const vnode = createContainImageVNode(h, null);

  assert.equal(vnode.tag, "span");
  assert.equal(vnode.children, "Изображение не выбрано");
});

test("requests the complete related file value needed by the renderer", () => {
  assert.equal(displayDefinition.id, "deere-shop-image-contain");
  assert.deepEqual(displayDefinition.types, ["uuid"]);
  assert.deepEqual(displayDefinition.localTypes, ["file"]);
  assert.deepEqual(displayDefinition.fields, [
    "id",
    "type",
    "title",
    "filename_download",
    "modified_on",
  ]);
});
