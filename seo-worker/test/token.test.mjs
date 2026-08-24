import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { provisionWorkerToken } from "../scripts/create-token.mjs";

test("provisions reproducibly and writes the static token only to a 0600 file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "seo-worker-"));
  const tokenFile = join(dir, "token");
  let calls = 0;
  const result = await provisionWorkerToken({
    baseUrl: "https://cms.example.test",
    adminToken: "admin-only",
    roleId: "role-worker",
    tokenFile,
    randomToken: () => "worker-secret",
    fetchImpl: async (_url, init) => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(JSON.stringify({ data: { id: "user-1" } }), { status: 200 });
    },
  });
  assert.equal(result.id, "user-1");
  assert.equal(await readFile(tokenFile, "utf8"), "worker-secret\n");
  if (process.platform !== "win32") assert.equal((await stat(tokenFile)).mode & 0o777, 0o600);
});
