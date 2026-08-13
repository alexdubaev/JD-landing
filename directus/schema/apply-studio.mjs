import { DirectusAdminClient, isMainModule } from "./apply-schema.mjs";
import { studioBlueprint } from "./studio-blueprint.mjs";

const translations = (translation) => [{ language: "ru-RU", translation }];

const sameConfiguredValues = (current = {}, desired = {}) =>
  Object.entries(desired).every(([key, value]) =>
    JSON.stringify(current?.[key] ?? null) === JSON.stringify(value ?? null),
  );

const collectionMeta = (config) => ({
  translations: translations(config.label),
  ...(config.group !== undefined ? { group: config.group } : {}),
  ...(config.sort !== undefined ? { sort: config.sort } : {}),
  ...(config.displayTemplate !== undefined
    ? { display_template: config.displayTemplate }
    : {}),
  ...(config.note !== undefined ? { note: config.note } : {}),
});

const fieldMeta = (config) => ({
  translations: translations(config.label),
  ...(config.display !== undefined ? { display: config.display } : {}),
  ...(config.displayOptions !== undefined
    ? { display_options: config.displayOptions }
    : {}),
  ...(config.note !== undefined ? { note: config.note } : {}),
  ...(config.width !== undefined ? { width: config.width } : {}),
  ...(config.sort !== undefined ? { sort: config.sort } : {}),
  ...(config.group !== undefined ? { group: config.group } : {}),
});

const groupFieldPayload = (field, config) => ({
  field,
  type: "alias",
  schema: null,
  meta: {
    ...fieldMeta({ ...config, width: "full" }),
    ...(config.interface !== undefined ? { interface: config.interface } : {}),
    ...(config.options !== undefined ? { options: config.options } : {}),
    special: ["alias", "no-data", "group"],
  },
});

export async function applyStudioBlueprint(
  client,
  blueprint = studioBlueprint,
  { dryRun = false, includeLocaleChanges = false } = {},
) {
  const actions = [];
  const collectionRows = await client.request("/collections");
  const collectionsByName = new Map(
    collectionRows.map((item) => [item.collection, item]),
  );

  const collectionConfigs = {
    ...blueprint.folders,
    ...blueprint.collections,
  };
  for (const [name, config] of Object.entries(collectionConfigs)) {
    const current = collectionsByName.get(name);
    if (!current) {
      actions.push(`skip missing collection ${name}`);
      continue;
    }
    const desiredMeta = collectionMeta(config);
    if (sameConfiguredValues(current.meta, desiredMeta)) continue;
    actions.push(`update collection ${name}`);
    if (!dryRun) {
      await client.request(`/collections/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ meta: desiredMeta }),
      });
    }
  }

  for (const [collection, layout] of Object.entries(blueprint.fields)) {
    if (!collectionsByName.has(collection)) {
      actions.push(`skip missing fields ${collection}`);
      continue;
    }
    const rows = await client.request(`/fields/${encodeURIComponent(collection)}`);
    const fieldsByName = new Map(rows.map((item) => [item.field, item]));

    for (const [name, config] of Object.entries(layout.groups ?? {})) {
      const desiredPayload = groupFieldPayload(name, config);
      const current = fieldsByName.get(name);
      if (!current) {
        actions.push(`create group ${collection}.${name}`);
        if (!dryRun) {
          await client.request(`/fields/${encodeURIComponent(collection)}`, {
            method: "POST",
            body: JSON.stringify(desiredPayload),
          });
        }
        continue;
      }
      if (sameConfiguredValues(current.meta, desiredPayload.meta)) continue;
      actions.push(`update group ${collection}.${name}`);
      if (!dryRun) {
        await client.request(
          `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(name)}`,
          { method: "PATCH", body: JSON.stringify({ meta: desiredPayload.meta }) },
        );
      }
    }

    for (const [name, config] of Object.entries(layout.fields ?? {})) {
      const current = fieldsByName.get(name);
      if (!current) {
        actions.push(`skip missing field ${collection}.${name}`);
        continue;
      }
      const desiredMeta = fieldMeta(config);
      if (sameConfiguredValues(current.meta, desiredMeta)) continue;
      actions.push(`update field ${collection}.${name}`);
      if (!dryRun) {
        await client.request(
          `/fields/${encodeURIComponent(collection)}/${encodeURIComponent(name)}`,
          { method: "PATCH", body: JSON.stringify({ meta: desiredMeta }) },
        );
      }
    }
  }

  if (includeLocaleChanges) {
    const settings = await client.request("/settings");
    if (settings.default_language !== blueprint.defaultLanguage) {
      actions.push(`set default language ${blueprint.defaultLanguage}`);
      if (!dryRun) {
        await client.request("/settings", {
          method: "PATCH",
          body: JSON.stringify({ default_language: blueprint.defaultLanguage }),
        });
      }
    }

    const userQuery = new URLSearchParams({
      "filter[status][_neq]": "archived",
      fields: "id,language",
      limit: "-1",
    });
    const users = await client.request(`/users?${userQuery.toString()}`);
    for (const user of users) {
      if (user.language === blueprint.defaultLanguage) continue;
      actions.push(`set user ${user.id} language ${blueprint.defaultLanguage}`);
      if (!dryRun) {
        await client.request(`/users/${encodeURIComponent(user.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ language: blueprint.defaultLanguage }),
        });
      }
    }
  }

  return actions;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyStudioBlueprint(client, studioBlueprint, { dryRun });
  console.log(`${dryRun ? "Planned" : "Applied"} ${actions.length} Studio actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
