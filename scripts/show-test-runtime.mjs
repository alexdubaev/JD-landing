import { fileURLToPath } from "node:url";
import path from "node:path";

import { readRuntimeStatus } from "./runtime-status.mjs";

function parsePort(args) {
  if (args.length !== 2 || args[0] !== "--port") {
    throw new Error("usage: node scripts/show-test-runtime.mjs --port <1024-65535>");
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("port must be an integer from 1024 to 65535");
  }
  return port;
}

async function main() {
  try {
    console.log(JSON.stringify(await readRuntimeStatus(parsePort(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(`TEST RUNTIME STATUS UNAVAILABLE: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
