import assert from "node:assert/strict";
import test from "node:test";

import { copyWorkerOutputOptions, resolveSourceCommit, validateReviewArtifact } from "./sites-review-package.mjs";

test("review artifact must contain the Sites identity and the OpenNext Worker entrypoint", () => {
  assert.deepEqual(
    validateReviewArtifact([
      ".openai/hosting.json",
      ".open-next/worker.js",
      ".open-next/assets/_next/static/chunks/app.js",
    ]),
    {
      workerEntrypoint: ".open-next/worker.js",
      assetsDirectory: ".open-next/assets",
    },
  );
});

test("review artifact rejects source-only packages and missing Sites identity", () => {
  assert.throws(
    () => validateReviewArtifact(["frontend/package.json", "frontend/src/app/page.tsx"]),
    /hosting\.json/u,
  );
});

test("a container package may use only an explicitly verified source SHA", () => {
  const commit = "a".repeat(40);
  assert.equal(resolveSourceCommit(() => { throw new Error("no git metadata"); }, commit), commit);
  assert.throws(
    () => resolveSourceCommit(() => { throw new Error("no git metadata"); }, "not-a-commit"),
    /SITES_REVIEW_SOURCE_COMMIT/u,
  );
});

test("review packaging resolves OpenNext symlinks before handing the archive to Sites", () => {
  assert.deepEqual(copyWorkerOutputOptions(), {
    recursive: true,
    dereference: true,
  });
});
