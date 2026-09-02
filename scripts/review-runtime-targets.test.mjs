import assert from "node:assert/strict";
import test from "node:test";

import { assertOriginMainCurrent, assertReviewDirectusOrigin, loadApprovedReviewRuntimeTargets, parseReviewRuntimeTargets } from "./review-runtime-targets.mjs";

test("accepts only repository-approved review Directus origins", () => {
  const targets = parseReviewRuntimeTargets(JSON.stringify({
    allowed_directus_origins: ["http://127.0.0.1:8057"],
  }));

  assert.doesNotThrow(() => assertReviewDirectusOrigin("http://127.0.0.1:8057", targets));
  assert.throws(
    () => assertReviewDirectusOrigin("https://cms.deere-shop.ru", targets),
    /not an approved review Directus origin/u,
  );
});

test("rejects an empty allowlist instead of silently allowing every CMS", () => {
  const targets = parseReviewRuntimeTargets(JSON.stringify({ allowed_directus_origins: [] }));

  assert.throws(
    () => assertReviewDirectusOrigin("http://127.0.0.1:8057", targets),
    /not an approved review Directus origin/u,
  );
});

test("loads approval from origin/main rather than an altered test branch file", () => {
  const targets = loadApprovedReviewRuntimeTargets({
    readOriginMain: (path) => {
      assert.equal(path, "config/review-runtime-targets.json");
      return JSON.stringify({ allowed_directus_origins: ["http://127.0.0.1:8057"] });
    },
  });

  assert.doesNotThrow(() => assertReviewDirectusOrigin("http://127.0.0.1:8057", targets));
  assert.throws(
    () => assertReviewDirectusOrigin("https://cms.deere-shop.ru", targets),
    /not an approved review Directus origin/u,
  );
});

test("refuses a stale local origin/main before trusting its review allowlist", () => {
  assert.throws(
    () => assertOriginMainCurrent({ trackingHead: "old", remoteHead: "current" }),
    /origin\/main is stale/u,
  );
  assert.doesNotThrow(() => assertOriginMainCurrent({ trackingHead: "current", remoteHead: "current" }));
});
