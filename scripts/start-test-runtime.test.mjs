import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import net from "node:net";
import test from "node:test";

import { assertLauncherOwnsWorkspace, assertPortAvailable, parseStartOptions, sanitizeChildEnvironment } from "./start-test-runtime.mjs";

test("requires every runtime identity field instead of defaulting to the current directory", () => {
  assert.throws(
    () => parseStartOptions(["--workspace", "D:/worktrees/ui-fix"]),
    /--branch is required/u,
  );
});

test("parses an explicit local-only test request", () => {
  assert.deepEqual(
    parseStartOptions([
      "--workspace", "D:/worktrees/ui-fix",
      "--branch", "codex/ui-fix",
      "--env-file", "D:/worktrees/ui-fix/frontend/.env.local",
      "--port", "3101",
      "--dry-run",
    ]),
    {
      workspace: "D:/worktrees/ui-fix",
      branch: "codex/ui-fix",
      environmentFile: "D:/worktrees/ui-fix/frontend/.env.local",
      port: 3101,
      dryRun: true,
    },
  );
});

test("refuses a caller-supplied Directus label because identity comes from the environment file", () => {
  assert.throws(
    () => parseStartOptions([
      "--workspace", "D:/worktrees/ui-fix",
      "--branch", "codex/ui-fix",
      "--env-file", "D:/worktrees/ui-fix/frontend/.env.local",
      "--directus-label", "not-evidence",
      "--port", "3101",
    ]),
    /unsupported option --directus-label/u,
  );
});

test("refuses to use an occupied local port before starting Next", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await assert.rejects(
      () => assertPortAvailable(address.port),
      /already in use/u,
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("removes inherited Directus variables regardless of Windows casing", () => {
  const environment = sanitizeChildEnvironment({
    DIRECTUS_URL: "https://cms.example.test",
    directus_token: "must-not-survive",
    Next_Public_Directus_Url: "https://also-must-not-survive",
    PATH: "safe",
  });

  assert.deepEqual(environment, { PATH: "safe" });
});

test("refuses to launch a worktree owned by another copy of the guard", () => {
  assert.doesNotThrow(() => assertLauncherOwnsWorkspace(process.cwd()));
  assert.throws(
    () => assertLauncherOwnsWorkspace("D:/codex/JD_landing"),
    /launcher belongs to/u,
  );
});

test("starts an immutable production build instead of a hot-reloading dev server", async () => {
  const script = await readFile(new URL("./start-test-runtime.mjs", import.meta.url), "utf8");

  assert.match(script, /\[next, "build", "--webpack"\]/u);
  assert.match(script, /\[next, "start", "--hostname"/u);
  assert.doesNotMatch(script, /\[next, "dev", "--webpack"/u);
  assert.match(script, /process\.execPath/u);
  assert.match(script, /node_modules", "next", "dist", "bin", "next"/u);
});
