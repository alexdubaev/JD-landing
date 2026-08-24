import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

// Тема оформления Data Studio (расширение deere-shop-theme в ./extensions).
// Применяет тему как светлую по умолчанию; тёмная остаётся стандартной,
// пока не появится отдельная тёмная версия темы.
const DESIRED_SETTINGS = {
  default_theme_light: "deere-shop",
  default_appearance: "light",
};

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function applyTheme(client, { dryRun = false } = {}) {
  const current = await client.request("/settings");
  const actions = [];

  for (const [key, value] of Object.entries(DESIRED_SETTINGS)) {
    if (sameValue(current[key], value)) continue;
    actions.push(`set ${key} = ${JSON.stringify(value)}`);
  }

  if (!dryRun && actions.length > 0) {
    await client.request("/settings", {
      method: "PATCH",
      body: JSON.stringify(DESIRED_SETTINGS),
    });
  }

  return actions;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyTheme(client, { dryRun });

  if (actions.length === 0) {
    console.log("Theme is already up to date.");
    return;
  }
  console.log(`${dryRun ? "Planned" : "Applied"} ${actions.length} theme actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
