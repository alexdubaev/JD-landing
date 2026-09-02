import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("frontend/package.json", root), "utf8"));
const agents = await readFile(new URL("AGENTS.md", root), "utf8");
const hosting = JSON.parse(await readFile(new URL(".openai/hosting.json", root), "utf8"));

test("the frontend dev script enters through the runtime identity guard", () => {
  assert.match(packageJson.scripts.dev, /start-test-runtime\.mjs/u);
  assert.doesNotMatch(packageJson.scripts.dev, /^next dev$/u);
});

test("project instructions prohibit unguarded local test launches and raw-port publishing", () => {
  assert.match(agents, /start-test-runtime\.mjs/u);
  assert.match(agents, /raw VPS IP or port/u);
});

test("the repository records its exact @Sites project identity", () => {
  assert.deepEqual(hosting, {
    project_id: "appgprj_6a986fcb2fd88191b43032da5dcb12bb",
  });
});

test("the isolated @Sites review deployment uses an OpenNext Worker artifact", async () => {
  const openNextConfig = await readFile(new URL("frontend/open-next.config.ts", root), "utf8");
  const wranglerConfig = await readFile(new URL("frontend/wrangler.jsonc", root), "utf8");

  assert.match(packageJson.scripts["sites:build"], /opennextjs-cloudflare build/u);
  assert.match(packageJson.scripts["sites:package"], /sites-review-package\.mjs/u);
  assert.match(openNextConfig, /defineCloudflareConfig/u);
  assert.match(wranglerConfig, /\.open-next\/worker\.js/u);
  assert.match(wranglerConfig, /\.open-next\/assets/u);
});
