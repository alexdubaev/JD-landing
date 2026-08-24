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
    /\(security_headers_public\)\s*\{[\s\S]*Content-Security-Policy "frame-ancestors 'self' https:\/\/cms\.deere-shop\.ru"[\s\S]*\}/u,
  );
  assert.doesNotMatch(
    caddyfile.match(/deere-shop\.ru\s*\{[\s\S]*?\n\}/u)?.[0] ?? "",
    /import security_headers\b/u,
  );
  assert.match(
    caddyfile,
    /deere-shop\.ru\s*\{[\s\S]*import security_headers_public[\s\S]*reverse_proxy frontend:3000\s*\{[\s\S]*header_down -X-Frame-Options[\s\S]*\}/u,
  );
});

test("Directus preview bridge alone may post its signed form to the public site", () => {
  assert.match(
    caddyfile,
    /\(security_headers_preview_bridge\)\s*\{[\s\S]*form-action https:\/\/deere-shop\.ru[\s\S]*frame-ancestors 'self'[\s\S]*\}/u,
  );
  assert.match(
    caddyfile,
    /cms\.deere-shop\.ru\s*\{[\s\S]*@preview_bridge path \/deere-shop\/preview\/\*[\s\S]*handle @preview_bridge\s*\{[\s\S]*import security_headers_preview_bridge[\s\S]*reverse_proxy directus:8055[\s\S]*\}[\s\S]*handle\s*\{[\s\S]*import security_headers[\s\S]*reverse_proxy directus:8055[\s\S]*\}/u,
  );
});

test("reverse proxies overwrite client-supplied forwarded chains", () => {
  const removals = caddyfile.match(/header_up -X-Forwarded-For/g) ?? [];
  const assignments = caddyfile.match(/header_up X-Forwarded-For \{http\.request\.remote\.host\}/g) ?? [];

  assert.ok(removals.length >= 3, "frontend and both Directus handlers clear the incoming header");
  assert.equal(removals.length, assignments.length);
});
