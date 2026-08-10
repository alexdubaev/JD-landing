import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assetMimeType,
  HOME_HERO_ASSET_TITLE,
} from "./sync-editorial-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../seed-assets");
const manifest = JSON.parse(
  await readFile(resolve(root, "manifest.json"), "utf8"),
);

test("home hero manifest points to the supplied WebP asset", async () => {
  assert.equal(manifest.homeHero.file, "home-hero.webp");
  assert.equal(assetMimeType(manifest.homeHero.file), "image/webp");
  assert.equal(HOME_HERO_ASSET_TITLE, "home-hero:deere-shop-v7");
  assert.ok(manifest.homeHero.alt.length > 10);
  await access(resolve(root, manifest.homeHero.file));
});

test("category icon manifest contains one unique asset per category", async () => {
  assert.equal(manifest.categoryIcons.length, 19);
  assert.equal(
    new Set(manifest.categoryIcons.map(({ slug }) => slug)).size,
    19,
  );
  for (const item of manifest.categoryIcons) {
    assert.match(item.file, /^category-icons\/.+\.webp$/u);
    assert.ok(item.alt.length > 10);
    await access(resolve(root, item.file));
  }
});

test("article cover manifest contains three unique editorial covers", async () => {
  assert.equal(manifest.articleCovers.length, 3);
  assert.equal(
    new Set(manifest.articleCovers.map(({ slug }) => slug)).size,
    3,
  );
  for (const item of manifest.articleCovers) {
    assert.match(item.file, /^article-covers\/.+\.webp$/u);
    await access(resolve(root, item.file));
  }
});
