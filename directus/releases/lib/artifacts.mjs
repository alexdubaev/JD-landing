import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  mkdir,
  open,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

const normalizeKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, "");

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "token",
  "secret",
  "password",
  "email",
  "phone",
  "message",
  "manager_comment",
  "authorization",
  "api_key",
  "apikey",
  "address",
  "contact",
  "mobile",
  "customer_name",
  "full_name",
  "first_name",
  "last_name",
].map(normalizeKey));

const PRODUCT_ROW_KEYS = new Set([
  "sku",
  "mpn",
  "price",
  "full_description",
  "short_description",
  "main_image",
  "gallery",
].map(normalizeKey));

const compareValues = (left, right) => {
  const leftKey = left?.id ?? JSON.stringify(left) ?? "";
  const rightKey = right?.id ?? JSON.stringify(right) ?? "";
  return String(leftKey).localeCompare(String(rightKey), "en");
};

const canonicalize = (value, { sortRowsBy } = {}) => {
  if (Array.isArray(value)) {
    const rows = value.map((item) => canonicalize(item, { sortRowsBy }));
    if (
      sortRowsBy &&
      rows.every((item) => item && typeof item === "object" && !Array.isArray(item))
    ) {
      return rows.toSorted((left, right) => {
        const leftValue = left[sortRowsBy];
        const rightValue = right[sortRowsBy];
        return compareValues(
          leftValue === undefined ? left : leftValue,
          rightValue === undefined ? right : rightValue,
        );
      });
    }
    return rows;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, canonicalize(value[key], { sortRowsBy })]),
    );
  }

  return value;
};

export const serializeArtifact = (value, options = {}) =>
  `${JSON.stringify(canonicalize(value, options), null, 2)}\n`;

export const hashRows = (rows) =>
  createHash("sha256")
    .update(serializeArtifact(rows, { sortRowsBy: "id" }))
    .digest("hex");

const isInside = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const findSensitiveKey = (value, trail = []) => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findSensitiveKey(value[index], [...trail, String(index)]);
      if (match) return match;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const keys = Object.keys(value).map(normalizeKey);
  const context = new Set(trail.map(normalizeKey));
  const productIdentityCount = ["id", "title", "slug", "category", "status"]
    .filter((key) => keys.includes(key)).length;
  if (
    keys.some((key) => PRODUCT_ROW_KEYS.has(key)) &&
    keys.some((key) => ["id", "title", "slug", "category"].includes(key))
  ) {
    return `${trail.join(".") || "root"} (product row)`;
  }
  if (context.has("products") && productIdentityCount > 0) {
    return `${trail.join(".") || "root"} (product row)`;
  }
  if (productIdentityCount >= 3) {
    return `${trail.join(".") || "root"} (product row)`;
  }
  if (
    ["leads", "orders", "customers", "contacts", "users"].some((name) => context.has(name)) &&
    keys.some((key) => ["id", "name", "title"].includes(key))
  ) {
    return `${trail.join(".") || "root"} (PII row)`;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) return [...trail, key].join(".");
    const match = findSensitiveKey(child, [...trail, key]);
    if (match) return match;
  }
  return null;
};

const scanJsonFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanJsonFiles(filename);
      continue;
    }
    if (!entry.isFile() || !/\.(?:json|ndjson)$/i.test(entry.name)) continue;
    const content = await readFile(filename, "utf8");
    const records = entry.name.toLowerCase().endsWith(".ndjson")
      ? content.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            throw new Error(`Artifact ${entry.name} contains invalid JSON`);
          }
        })
      : (() => {
          try {
            return [JSON.parse(content)];
          } catch {
            throw new Error(`Artifact ${entry.name} contains invalid JSON`);
          }
        })();

    for (const value of records) {
      const sensitiveKey = findSensitiveKey(value);
      if (sensitiveKey) {
        throw new Error(
          `Artifact ${entry.name} contains sensitive or product field ${sensitiveKey}`,
        );
      }
    }
  }
};

export async function assertArtifactDirectory(
  directory,
  { repositoryRoot = process.cwd(), scanExistingFiles = false } = {},
) {
  if (!path.isAbsolute(directory)) {
    throw new Error("Artifact directory must be absolute");
  }

  let absoluteDirectory;
  try {
    const details = await stat(directory);
    if (!details.isDirectory()) throw new Error("not-directory");
    absoluteDirectory = await realpath(directory);
  } catch (error) {
    if (error?.message === "not-directory") {
      throw new Error("Artifact directory path is not a directory");
    }
    throw new Error("Artifact directory does not exist");
  }
  const absoluteRepository = await realpath(repositoryRoot);
  if (isInside(absoluteRepository, absoluteDirectory)) {
    throw new Error("Artifact directory must be outside the repository");
  }

  if (scanExistingFiles) await scanJsonFiles(absoluteDirectory);
  return absoluteDirectory;
}

export async function assertArtifactFile(
  filename,
  { repositoryRoot = process.cwd() } = {},
) {
  if (!path.isAbsolute(filename)) {
    throw new Error("Artifact file path must be absolute");
  }
  let absoluteFile;
  try {
    const details = await stat(filename);
    if (!details.isFile()) throw new Error("not-file");
    absoluteFile = await realpath(filename);
  } catch (error) {
    if (error?.message === "not-file") {
      throw new Error("Artifact file path is not a file");
    }
    throw new Error("Artifact file does not exist");
  }
  const absoluteRepository = await realpath(repositoryRoot);
  if (isInside(absoluteRepository, absoluteFile)) {
    throw new Error("Artifact file must be outside the repository");
  }
  return absoluteFile;
}

export async function createReleasePacket(
  parentDirectory,
  { releaseId, repositoryRoot = process.cwd() },
) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(releaseId ?? "")) {
    throw new Error("Release id must contain only letters, numbers, dots, dashes, or underscores");
  }
  const parent = await assertArtifactDirectory(parentDirectory, { repositoryRoot });
  const packet = path.join(parent, releaseId);
  try {
    await mkdir(packet);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Release id ${releaseId} already exists`);
    }
    throw error;
  }
  return packet;
}

export function assertSafeArtifact(value) {
  const sensitiveKey = findSensitiveKey(value);
  if (sensitiveKey) {
    throw new Error(`Artifact contains sensitive field ${sensitiveKey}`);
  }
  return value;
}

export async function writeArtifactsExclusive(directory, artifacts) {
  const opened = [];
  try {
    for (const [name, value] of Object.entries(artifacts)) {
      if (path.basename(name) !== name || !name.endsWith(".json")) {
        throw new Error(`Invalid artifact filename ${name}`);
      }
      assertSafeArtifact(value);
      const filename = path.join(directory, name);
      let handle;
      try {
        handle = await open(filename, "wx");
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error(`Artifact ${name} already exists`);
        }
        throw error;
      }
      opened.push({ filename, handle, value });
    }

    for (const item of opened) {
      await item.handle.writeFile(serializeArtifact(item.value), "utf8");
    }
    return opened.map(({ filename }) => filename);
  } catch (error) {
    await Promise.allSettled(opened.map(({ handle }) => handle.close()));
    await Promise.allSettled(opened.map(({ filename }) => rm(filename, { force: true })));
    throw error;
  } finally {
    await Promise.allSettled(opened.map(({ handle }) => handle.close()));
  }
}
