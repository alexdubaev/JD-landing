import { DirectusAdminClient, isMainModule } from "./apply-schema.mjs";
import {
  buildTranslations,
  collectionTranslations,
  fieldTranslations,
  getChoiceTranslations,
} from "./ui-translations.mjs";

const collectionPath = (name) => `/collections/${encodeURIComponent(name)}`;
const fieldPath = (collection, field) =>
  `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(field)}`;

export async function applyUiTranslations(client, { dryRun = false } = {}) {
  const actions = [];
  const collections = await client.request("/collections");
  const known = new Map(collections.map((item) => [item.collection, item]));

  for (const [collection, collectionLabel] of Object.entries(
    collectionTranslations,
  )) {
    const currentCollection = known.get(collection);
    if (!currentCollection) {
      actions.push(`skip missing collection ${collection}`);
      continue;
    }

    const nextTranslations = buildTranslations(collectionLabel);
    if (
      JSON.stringify(currentCollection.meta?.translations ?? null) !==
      JSON.stringify(nextTranslations)
    ) {
      actions.push(`translate collection ${collection} -> ${collectionLabel}`);
      if (!dryRun) {
        await client.request(collectionPath(collection), {
          method: "PATCH",
          body: JSON.stringify({
            meta: { translations: nextTranslations },
          }),
        });
      }
    }

    const fields = await client.request(`/fields/${encodeURIComponent(collection)}`);
    const fieldsByName = new Map(fields.map((item) => [item.field, item]));
    for (const field of fieldsByName.keys()) {
      const label = fieldTranslations[field];
      if (!label) continue;
      const current = fieldsByName.get(field);
      const currentOptions = current.meta?.options ?? null;
      const choices = currentOptions?.choices;
      const nextOptions = choices
        ? { ...currentOptions, choices: getChoiceTranslations(field, choices) }
        : currentOptions;
      const nextMeta = {
        translations: buildTranslations(label),
        ...(nextOptions ? { options: nextOptions } : {}),
      };
      const sameTranslations =
        JSON.stringify(current.meta?.translations ?? null) ===
        JSON.stringify(nextMeta.translations);
      const sameOptions =
        JSON.stringify(currentOptions) === JSON.stringify(nextOptions);
      if (sameTranslations && sameOptions) continue;

      actions.push(`translate field ${collection}.${field} -> ${label}`);
      if (!dryRun) {
        await client.request(fieldPath(collection, field), {
          method: "PATCH",
          body: JSON.stringify({ meta: nextMeta }),
        });
      }
    }
  }

  return actions;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyUiTranslations(client, { dryRun });
  console.log(`${dryRun ? "Planned" : "Applied"} ${actions.length} UI translation actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

