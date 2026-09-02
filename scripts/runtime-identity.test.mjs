import assert from "node:assert/strict";
import test from "node:test";

import { readDirectusOrigin, validateRuntimeTarget } from "./runtime-identity.mjs";

const safeTarget = {
  workspace: "D:/worktrees/ui-fix",
  branch: "codex/ui-fix",
  head: "abc123",
  remoteHead: "abc123",
  status: "",
  environmentFile: "D:/worktrees/ui-fix/frontend/.env.test",
  environmentFileIsInsideWorkspace: true,
  directusUrl: "http://127.0.0.1:8057",
  url: "http://127.0.0.1:3101",
};

test("accepts an exact pushed clean test branch and produces a non-secret receipt", () => {
  const receipt = validateRuntimeTarget(safeTarget);

  assert.deepEqual(receipt, {
    workspace: safeTarget.workspace,
    branch: safeTarget.branch,
    commit: safeTarget.head,
    environmentFile: safeTarget.environmentFile,
    directusUrl: safeTarget.directusUrl,
    url: safeTarget.url,
  });
  assert.doesNotMatch(JSON.stringify(receipt), /TOKEN|PASSWORD|SECRET/u);
});

test("derives a safe Directus origin from the branch-local environment without reading a token", () => {
  const origin = readDirectusOrigin([
    "DIRECTUS_URL=http://127.0.0.1:8057/",
    "DIRECTUS_TOKEN=must-not-be-returned",
  ].join("\n"));

  assert.equal(origin, "http://127.0.0.1:8057");
  assert.doesNotMatch(origin, /must-not-be-returned/u);
});

test("refuses a Directus URL containing credentials or query data", () => {
  assert.throws(
    () => readDirectusOrigin("DIRECTUS_URL=https://user:password@cms.example.test/?token=no"),
    /must not contain credentials, query data, or a fragment/u,
  );
});

test("refuses duplicate or expanded Directus URLs instead of guessing Next's final value", () => {
  assert.throws(
    () => readDirectusOrigin("DIRECTUS_URL=http://127.0.0.1:8057\nDIRECTUS_URL=https://cms.example.test"),
    /exactly one DIRECTUS_URL/u,
  );
  assert.throws(
    () => readDirectusOrigin("DIRECTUS_URL=$CMS_ENDPOINT"),
    /must not use environment expansion/u,
  );
});

test("rejects main even when its remote SHA matches", () => {
  assert.throws(
    () => validateRuntimeTarget({ ...safeTarget, branch: "main" }),
    /refusing to start a test runtime from main/u,
  );
});

test("rejects a local-only commit which is not the declared remote branch head", () => {
  assert.throws(
    () => validateRuntimeTarget({ ...safeTarget, head: "local-only", remoteHead: "pushed" }),
    /does not exactly match origin\/codex\/ui-fix/u,
  );
});

test("rejects a dirty worktree", () => {
  assert.throws(
    () => validateRuntimeTarget({ ...safeTarget, status: " M frontend/next-env.d.ts" }),
    /worktree is dirty/u,
  );
});

test("rejects configuration inherited from another worktree", () => {
  assert.throws(
    () => validateRuntimeTarget({ ...safeTarget, environmentFileIsInsideWorkspace: false }),
    /must be inside the selected worktree/u,
  );
});
