import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "frontend");
const workerDirectory = path.join(frontend, ".open-next");
const hostingFile = path.join(root, ".openai", "hosting.json");
const defaultOutput = path.join(root, "outputs", "jd-landing-uiux-review.tgz");

export function validateReviewArtifact(files) {
  if (!files.includes(".openai/hosting.json")) {
    throw new Error("review artifact is missing .openai/hosting.json");
  }
  if (!files.includes(".open-next/worker.js")) {
    throw new Error("review artifact is missing the OpenNext Worker entrypoint");
  }
  if (!files.some((file) => file.startsWith(".open-next/assets/"))) {
    throw new Error("review artifact is missing OpenNext static assets");
  }
  return {
    workerEntrypoint: ".open-next/worker.js",
    assetsDirectory: ".open-next/assets",
  };
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(target, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

export function resolveSourceCommit(readGitHead, supplied) {
  try {
    return readGitHead();
  } catch {
    if (/^[a-f\d]{40}$/iu.test(supplied ?? "")) return supplied;
    throw new Error("source commit is unavailable; provide a verified SITES_REVIEW_SOURCE_COMMIT");
  }
}

function gitHead() {
  return resolveSourceCommit(
    () => execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    process.env.SITES_REVIEW_SOURCE_COMMIT,
  );
}

async function main() {
  const output = path.resolve(process.argv[2] ?? defaultOutput);
  const staging = path.join(root, ".codex-tmp", `sites-review-${gitHead()}`);
  const workerEntrypoint = path.join(workerDirectory, "worker.js");

  try {
    await stat(workerEntrypoint);
  } catch {
    throw new Error("OpenNext output is absent; run npm run sites:build from frontend first");
  }

  await rm(staging, { recursive: true, force: true });
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(staging, { recursive: true });
  await cp(workerDirectory, path.join(staging, ".open-next"), { recursive: true });
  await mkdir(path.join(staging, ".openai"), { recursive: true });
  await cp(hostingFile, path.join(staging, ".openai", "hosting.json"));
  await cp(path.join(frontend, "wrangler.jsonc"), path.join(staging, "wrangler.jsonc"));

  const files = await listFiles(staging);
  const contract = validateReviewArtifact(files);
  await writeFile(
    path.join(staging, "artifact-manifest.json"),
    `${JSON.stringify({ sourceCommit: gitHead(), ...contract, fileCount: files.length }, null, 2)}\n`,
  );
  await rm(output, { force: true });
  execFileSync("tar", ["-czf", output, "-C", staging, "."], { stdio: "inherit" });
  console.log(JSON.stringify({ archive: output, sourceCommit: gitHead(), ...contract }, null, 2));
}

if (process.argv[1] && require.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
