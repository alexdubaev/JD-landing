import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function statusPath(port, directory) {
  return path.join(directory, `port-${port}.json`);
}

function nonSecretReceipt(receipt) {
  return {
    workspace: receipt.workspace,
    branch: receipt.branch,
    commit: receipt.commit,
    environmentFile: receipt.environmentFile,
    directusUrl: receipt.directusUrl,
    url: receipt.url,
  };
}

export async function writeRuntimeStatus(receipt, { directory = path.join(os.tmpdir(), "jd-landing-runtime"), pid, startedAt = new Date().toISOString() }) {
  const port = Number(new URL(receipt.url).port);
  if (!Number.isInteger(port)) {
    throw new Error("runtime receipt URL must include an explicit port");
  }
  await mkdir(directory, { recursive: true });
  await writeFile(statusPath(port, directory), `${JSON.stringify({ ...nonSecretReceipt(receipt), pid, startedAt }, null, 2)}\n`, "utf8");
}

function defaultProcessProbe(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function defaultPortOwner(port, pid) {
  try {
    const output = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
    return output.split(/\r?\n/u).some((line) => {
      const fields = line.trim().split(/\s+/u);
      return fields[0] === "TCP" && fields[1]?.endsWith(`:${port}`) && fields.at(-1) === String(pid) && fields.includes("LISTENING");
    });
  } catch {
    return false;
  }
}

export async function readRuntimeStatus(port, { directory = path.join(os.tmpdir(), "jd-landing-runtime"), isProcessAlive = defaultProcessProbe, isPortOwnedByPid = defaultPortOwner } = {}) {
  let record;
  try {
    record = JSON.parse(await readFile(statusPath(port, directory), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`no guarded runtime receipt exists for port ${port}`);
    }
    throw error;
  }
  const processAlive = isProcessAlive(record.pid);
  return {
    ...nonSecretReceipt(record),
    pid: record.pid,
    startedAt: record.startedAt,
    state: !processAlive ? "stopped" : isPortOwnedByPid(port, record.pid) ? "running" : "pid_alive_port_unverified",
  };
}
