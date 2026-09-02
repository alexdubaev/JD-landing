import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

function required(value, label) {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

export function validateRuntimeTarget(target) {
  const branch = required(target.branch, "branch");
  const head = required(target.head, "HEAD");
  const remoteHead = required(target.remoteHead, `origin/${branch}`);
  const workspace = required(target.workspace, "workspace");
  const environmentFile = required(target.environmentFile, "environment file");

  if (target.expectedBranch && branch !== target.expectedBranch) {
    throw new Error(`selected branch ${branch} does not match declared branch ${target.expectedBranch}`);
  }
  if (branch === "main") {
    throw new Error("refusing to start a test runtime from main");
  }
  if (target.status.trim()) {
    throw new Error("worktree is dirty; commit or preserve changes before starting a test runtime");
  }
  if (head !== remoteHead) {
    throw new Error(`HEAD ${head} does not exactly match origin/${branch} (${remoteHead})`);
  }
  if (!target.environmentFileIsInsideWorkspace) {
    throw new Error("environment file must be inside the selected worktree");
  }

  return {
    workspace,
    branch,
    commit: head,
    environmentFile,
    directusUrl: required(target.directusUrl, "Directus URL"),
    url: required(target.url, "test URL"),
  };
}

export function readDirectusOrigin(environmentText) {
  const declarations = environmentText.split(/\r?\n/u).filter((entry) => /^DIRECTUS_URL=/iu.test(entry));
  if (declarations.length !== 1) {
    throw new Error("branch-local environment file must declare exactly one DIRECTUS_URL");
  }
  const [line] = declarations;
  const value = line.slice("DIRECTUS_URL=".length).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  if (value.includes("$")) {
    throw new Error("DIRECTUS_URL must not use environment expansion");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DIRECTUS_URL must be a valid absolute URL");
  }
  if (!/^https?:$/u.test(parsed.protocol)) {
    throw new Error("DIRECTUS_URL must use http or https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("DIRECTUS_URL must not contain credentials, query data, or a fragment");
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/u, "")}`;
}

function git(workspace, args) {
  return execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" }).trim();
}

export function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function inspectRuntimeTarget({ workspace, branch, environmentFile, url }) {
  const resolvedWorkspace = realpathSync(required(workspace, "workspace"));
  const resolvedEnvironmentFile = realpathSync(required(environmentFile, "environment file"));
  const remoteOutput = git(resolvedWorkspace, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  const remoteHead = remoteOutput.split(/\s+/u)[0];

  return validateRuntimeTarget({
    workspace: resolvedWorkspace,
    branch: git(resolvedWorkspace, ["branch", "--show-current"]),
    expectedBranch: branch,
    head: git(resolvedWorkspace, ["rev-parse", "HEAD"]),
    remoteHead,
    status: git(resolvedWorkspace, ["status", "--porcelain"]),
    environmentFile: resolvedEnvironmentFile,
    environmentFileIsInsideWorkspace: existsSync(resolvedEnvironmentFile) && isPathInside(resolvedWorkspace, resolvedEnvironmentFile),
    directusUrl: readDirectusOrigin(readFileSync(resolvedEnvironmentFile, "utf8")),
    url,
  });
}

export function formatRuntimeReceipt(receipt) {
  return [
    "Runtime identity verified:",
    `  workspace: ${receipt.workspace}`,
    `  branch: ${receipt.branch}`,
    `  commit: ${receipt.commit}`,
    `  environment file: ${receipt.environmentFile}`,
    `  Directus: ${receipt.directusUrl}`,
    `  URL: ${receipt.url}`,
  ].join("\n");
}
