import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

import { formatRuntimeReceipt, inspectRuntimeTarget } from "./runtime-identity.mjs";
import { assertReviewDirectusOrigin, loadApprovedReviewRuntimeTargets } from "./review-runtime-targets.mjs";
import { writeRuntimeStatus } from "./runtime-status.mjs";

const REQUIRED_OPTIONS = ["workspace", "branch", "environmentFile", "port"];

function optionName(flag) {
  if (flag === "--env-file") {
    return "environmentFile";
  }
  return flag.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

export function parseStartOptions(args) {
  const options = { dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    const key = optionName(argument);
    if (!REQUIRED_OPTIONS.includes(key)) {
      throw new Error(`unsupported option ${argument}`);
    }
    options[key] = value;
    index += 1;
  }

  for (const key of REQUIRED_OPTIONS) {
    if (!options[key]) {
      throw new Error(`--${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} is required`);
    }
  }

  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("--port must be an integer from 1024 to 65535");
  }

  return { ...options, port };
}

export function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`port ${port} is already in use`));
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
}

export function assertLauncherOwnsWorkspace(workspace) {
  const launcherRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
  if (path.resolve(workspace) !== launcherRoot) {
    throw new Error(`launcher belongs to ${launcherRoot}, not selected workspace ${path.resolve(workspace)}`);
  }
}

function branchLocalEnvironment(receipt) {
  const expected = path.join(receipt.workspace, "frontend", ".env.local");
  if (receipt.environmentFile !== expected) {
    throw new Error(`test environment must be ${expected}; alternative or shared environment files are refused`);
  }
}

export function sanitizeChildEnvironment(source) {
  const environment = { ...source };
  for (const key of Object.keys(environment)) {
    if (/^(DIRECTUS_|NEXT_PUBLIC_DIRECTUS_)/iu.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function runNext(next, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(next, args, options);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`next ${args[0]} exited with code ${code ?? "unknown"}`)));
  });
}

function assertReceiptUnchanged(before, after) {
  for (const field of ["workspace", "branch", "commit", "environmentFile", "directusUrl", "url"]) {
    if (before[field] !== after[field]) {
      throw new Error(`runtime identity changed during build (${field})`);
    }
  }
}

export async function startTestRuntime(options) {
  assertLauncherOwnsWorkspace(options.workspace);
  const receipt = inspectRuntimeTarget({
    workspace: options.workspace,
    branch: options.branch,
    environmentFile: options.environmentFile,
    url: `http://127.0.0.1:${options.port}`,
  });
  branchLocalEnvironment(receipt);
  assertReviewDirectusOrigin(receipt.directusUrl, loadApprovedReviewRuntimeTargets({ workspace: receipt.workspace }));
  console.log(formatRuntimeReceipt(receipt));

  if (options.dryRun) {
    return receipt;
  }

  const next = path.join(receipt.workspace, "frontend", "node_modules", "next", "dist", "bin", "next");
  const nextOptions = {
    cwd: path.join(receipt.workspace, "frontend"),
    env: sanitizeChildEnvironment(process.env),
    stdio: "inherit",
  };
  await runNext(process.execPath, [next, "build", "--webpack"], nextOptions);
  const rebuiltReceipt = inspectRuntimeTarget({
    workspace: options.workspace,
    branch: options.branch,
    environmentFile: options.environmentFile,
    url: `http://127.0.0.1:${options.port}`,
  });
  assertReceiptUnchanged(receipt, rebuiltReceipt);
  await assertPortAvailable(options.port);
  const child = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(options.port)], nextOptions);
  try {
    await writeRuntimeStatus(receipt, { pid: child.pid });
  } catch (error) {
    child.kill();
    throw error;
  }
  console.log(`Runtime status: node scripts/show-test-runtime.mjs --port ${options.port}`);
  child.on("error", (error) => {
    console.error(`TEST RUNTIME FAILED: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code) => process.exitCode = code ?? 1);
  return receipt;
}

async function main() {
  try {
    await startTestRuntime(parseStartOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(`TEST RUNTIME REFUSED: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
