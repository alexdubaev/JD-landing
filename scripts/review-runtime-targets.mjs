import { execFileSync } from "node:child_process";

export function parseReviewRuntimeTargets(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("review runtime target file must be valid JSON");
  }
  if (!Array.isArray(parsed.allowed_directus_origins) || !parsed.allowed_directus_origins.every((origin) => typeof origin === "string")) {
    throw new Error("review runtime targets must declare allowed_directus_origins as a string array");
  }
  return parsed;
}

function readOriginMain(path, workspace) {
  return execFileSync("git", ["-C", workspace, "show", `origin/main:${path}`], { encoding: "utf8" });
}

function git(workspace, args) {
  return execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" }).trim();
}

export function assertOriginMainCurrent({ trackingHead, remoteHead }) {
  if (!remoteHead || trackingHead !== remoteHead) {
    throw new Error("origin/main is stale; fetch and verify the remote main before trusting review targets");
  }
}

export function loadApprovedReviewRuntimeTargets({ workspace = process.cwd(), readOriginMain = readOriginMain } = {}) {
  assertOriginMainCurrent({
    trackingHead: git(workspace, ["rev-parse", "origin/main"]),
    remoteHead: git(workspace, ["ls-remote", "--heads", "origin", "refs/heads/main"]).split(/\s+/u)[0],
  });
  return parseReviewRuntimeTargets(readOriginMain("config/review-runtime-targets.json", workspace));
}

export function assertReviewDirectusOrigin(origin, targets) {
  if (!targets.allowed_directus_origins.includes(origin)) {
    throw new Error(`Directus origin ${origin} is not an approved review Directus origin`);
  }
}
