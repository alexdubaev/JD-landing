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

test("deploy refreshes Caddy after the release checkout changes", () => {
  assert.match(deployScript, /up -d frontend/u);
  assert.match(deployScript, /up -d --force-recreate caddy/u);
  assert.doesNotMatch(deployScript, /caddy reload/u);
});

test("public preview framing strips the frontend X-Frame-Options response header", () => {
  assert.match(
    caddyfile,
    /deere-shop\.ru\s*\{[\s\S]*reverse_proxy frontend:3000\s*\{[\s\S]*header_down -X-Frame-Options[\s\S]*\}/u,
  );
});
