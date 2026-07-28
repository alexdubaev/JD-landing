import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DirectusAdminClient,
  isMainModule,
} from "./apply-schema.mjs";

export const serializeSnapshot = (snapshot) =>
  `${JSON.stringify(snapshot, null, 2)}\n`;

async function main() {
  const output = resolve(
    process.cwd(),
    process.argv[2] ?? "schema/snapshot.json",
  );
  const client = await DirectusAdminClient.connectFromEnvironment();
  const snapshot = await client.request("/schema/snapshot");
  await writeFile(output, serializeSnapshot(snapshot), "utf8");
  console.log(`Wrote Directus schema snapshot to ${output}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
