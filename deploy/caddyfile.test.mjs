import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const caddyfile = await readFile(new URL("./Caddyfile", import.meta.url), "utf8");
const deployScript = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");

test("Caddy redirects www and legacy index paths to the canonical homepage", () => {
  assert.match(caddyfile, /www\.deere-shop\.ru\s*\{[\s\S]*redir https:\/\/deere-shop\.ru\{uri\} permanent/u);
  assert.match(caddyfile, /redir \/index\.html \/ permanent/u);
  assert.match(caddyfile, /redir \/index\.php \/ permanent/u);
  assert.match(caddyfile, /redir \/index \/ permanent/u);
});

test("Caddy requires an extra authentication layer for the Directus host", () => {
  assert.match(caddyfile, /cms\.deere-shop\.ru\s*\{[\s\S]*basic_auth\s*\{[\s\S]*\{\$DIRECTUS_CMS_AUTH_USER\}\s+\{\$DIRECTUS_CMS_AUTH_HASH\}/u);
});

test("deploy refreshes Caddy after the release checkout changes", () => {
  assert.match(deployScript, /up -d frontend/u);
  assert.match(deployScript, /up -d --force-recreate caddy/u);
  assert.doesNotMatch(deployScript, /caddy reload/u);
});
