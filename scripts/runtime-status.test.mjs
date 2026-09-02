import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readRuntimeStatus, writeRuntimeStatus } from "./runtime-status.mjs";

test("records a non-secret receipt and reports its process state", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jd-runtime-status-"));
  const receipt = {
    workspace: "D:/worktrees/ui-fix",
    branch: "codex/ui-fix",
    commit: "abc123",
    environmentFile: "D:/worktrees/ui-fix/frontend/.env.local",
    directusUrl: "http://127.0.0.1:8057",
    url: "http://127.0.0.1:3101",
  };

  try {
    await writeRuntimeStatus(receipt, { directory, pid: 4242, startedAt: "2026-09-02T10:00:00.000Z" });
    const status = await readRuntimeStatus(3101, {
      directory,
      isProcessAlive: (pid) => pid === 4242,
      isPortOwnedByPid: (port, pid) => port === 3101 && pid === 4242,
    });

    assert.deepEqual(status, {
      ...receipt,
      pid: 4242,
      startedAt: "2026-09-02T10:00:00.000Z",
      state: "running",
    });
    assert.doesNotMatch(JSON.stringify(status), /TOKEN|PASSWORD|SECRET/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not call a receipt running when its live PID no longer owns the recorded port", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jd-runtime-status-"));
  const receipt = {
    workspace: "D:/worktrees/ui-fix",
    branch: "codex/ui-fix",
    commit: "abc123",
    environmentFile: "D:/worktrees/ui-fix/frontend/.env.local",
    directusUrl: "http://127.0.0.1:8057",
    url: "http://127.0.0.1:3101",
  };

  try {
    await writeRuntimeStatus(receipt, { directory, pid: 4242, startedAt: "2026-09-02T10:00:00.000Z" });
    const status = await readRuntimeStatus(3101, {
      directory,
      isProcessAlive: () => true,
      isPortOwnedByPid: () => false,
    });

    assert.equal(status.state, "pid_alive_port_unverified");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports an old receipt as stopped instead of claiming a reused port is current", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jd-runtime-status-"));
  const receipt = {
    workspace: "D:/worktrees/ui-fix",
    branch: "codex/ui-fix",
    commit: "abc123",
    environmentFile: "D:/worktrees/ui-fix/frontend/.env.local",
    directusUrl: "http://127.0.0.1:8057",
    url: "http://127.0.0.1:3101",
  };

  try {
    await writeRuntimeStatus(receipt, { directory, pid: 4242, startedAt: "2026-09-02T10:00:00.000Z" });
    const status = await readRuntimeStatus(3101, { directory, isProcessAlive: () => false });

    assert.equal(status.state, "stopped");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
