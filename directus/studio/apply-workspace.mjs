import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import { workspaceBlueprint } from "./workspace-blueprint.mjs";

const PROJECT_KEY_PREFIX = "deere-shop:";

const sameConfiguredValues = (current = {}, desired = {}) =>
  Object.entries(desired).every(([key, value]) => {
    const currentValue =
      key === "dashboard" && current?.[key] && typeof current[key] === "object"
        ? current[key].id
        : current?.[key];
    return JSON.stringify(currentValue ?? null) === JSON.stringify(value ?? null);
  });

const assertProjectKey = (key, type) => {
  if (typeof key !== "string" || !key.startsWith(PROJECT_KEY_PREFIX)) {
    throw new Error(`${type} must use a project-owned key`);
  }
};

const assertUnique = (values, label) => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label}`);
  }
};

export function validateWorkspaceBlueprint(blueprint) {
  const presetKeys = blueprint.presets.map(({ key }) => key);
  const panelKeys = blueprint.panels.map(({ key }) => key);
  const panelIds = blueprint.panels.map(({ id }) => id);
  assertProjectKey(blueprint.dashboard.key, "Dashboard");
  for (const preset of blueprint.presets) {
    assertProjectKey(preset.key, "Preset");
    if (preset.layoutOptions?.deereShopKey !== preset.key) {
      throw new Error(`Preset ${preset.key} is missing its stable project key`);
    }
    if ("user" in preset || "role" in preset) {
      throw new Error(`Preset ${preset.key} must not target users or roles`);
    }
  }
  for (const panel of blueprint.panels) {
    assertProjectKey(panel.key, "Panel");
    if (panel.note !== panel.key) {
      throw new Error(`Panel ${panel.key} is missing its stable project marker`);
    }
    if (panel.dashboard !== blueprint.dashboard.id) {
      throw new Error(`Panel ${panel.key} targets an unmanaged dashboard`);
    }
    if (!["metric", "list"].includes(panel.type)) {
      throw new Error(`Panel ${panel.key} must use a native operational type`);
    }
  }
  assertUnique(presetKeys, "preset key");
  assertUnique(panelKeys, "panel key");
  assertUnique(panelIds, "panel id");
}

const presetPayload = (preset) => ({
  bookmark: preset.bookmark,
  collection: preset.collection,
  layout: preset.layout,
  layout_query: preset.layoutQuery,
  layout_options: preset.layoutOptions,
});

const dashboardPayload = (dashboard) => ({
  id: dashboard.id,
  name: dashboard.name,
  icon: dashboard.icon,
  note: `${dashboard.key}\n${dashboard.note}`,
});

const panelPayload = (panel) => ({
  id: panel.id,
  dashboard: panel.dashboard,
  name: panel.name,
  icon: panel.icon,
  show_header: panel.showHeader,
  note: panel.note ?? null,
  type: panel.type,
  position_x: panel.positionX,
  position_y: panel.positionY,
  width: panel.width,
  height: panel.height,
  options: panel.options,
});

const markerFromNote = (note) =>
  typeof note === "string" ? note.split("\n", 1)[0] : null;

const operation = (action, path, method, body) => ({
  action,
  path,
  options: { method, body: JSON.stringify(body) },
});

export async function applyWorkspace(
  client,
  blueprint = workspaceBlueprint,
  { dryRun = false } = {},
) {
  validateWorkspaceBlueprint(blueprint);

  const presetQuery = new URLSearchParams({
    limit: "-1",
    fields: "id,bookmark,collection,layout,layout_query,layout_options",
  });
  const dashboardQuery = new URLSearchParams({
    limit: "-1",
    fields: "id,name,icon,note",
  });
  const panelQuery = new URLSearchParams({
    limit: "-1",
    fields:
      "id,dashboard,name,icon,show_header,note,type,position_x,position_y,width,height,options",
  });

  const currentPresets = await client.request(`/presets?${presetQuery.toString()}`);
  const currentDashboards = await client.request(
    `/dashboards?${dashboardQuery.toString()}`,
  );
  const currentPanels = await client.request(`/panels?${panelQuery.toString()}`);
  const operations = [];

  const presetsByKey = new Map();
  for (const preset of currentPresets) {
    const key = preset.layout_options?.deereShopKey;
    if (!key?.startsWith(PROJECT_KEY_PREFIX)) continue;
    if (presetsByKey.has(key)) throw new Error(`Duplicate existing preset key ${key}`);
    presetsByKey.set(key, preset);
  }

  for (const preset of blueprint.presets) {
    const desired = presetPayload(preset);
    const current = presetsByKey.get(preset.key);
    if (!current) {
      const collision = currentPresets.some(
        (item) =>
          item.bookmark === preset.bookmark && item.collection === preset.collection,
      );
      if (collision) throw new Error(`Refusing bookmark collision for ${preset.key}`);
      operations.push(
        operation(`create preset ${preset.key}`, "/presets", "POST", desired),
      );
      continue;
    }
    if (sameConfiguredValues(current, desired)) continue;
    operations.push(
      operation(
        `update preset ${preset.key}`,
        `/presets/${encodeURIComponent(current.id)}`,
        "PATCH",
        desired,
      ),
    );
  }

  const desiredDashboard = dashboardPayload(blueprint.dashboard);
  const currentDashboard = currentDashboards.find(
    ({ id }) => id === blueprint.dashboard.id,
  );
  const dashboardByMarker = currentDashboards.find(
    ({ note }) => markerFromNote(note) === blueprint.dashboard.key,
  );
  if (currentDashboard && markerFromNote(currentDashboard.note) !== blueprint.dashboard.key) {
    throw new Error(`Dashboard ownership collision for ${blueprint.dashboard.id}`);
  }
  if (dashboardByMarker && dashboardByMarker.id !== blueprint.dashboard.id) {
    throw new Error(`Dashboard ownership collision for ${blueprint.dashboard.key}`);
  }
  if (
    !currentDashboard &&
    currentDashboards.some(({ name }) => name === blueprint.dashboard.name)
  ) {
    throw new Error(`Dashboard name collision for ${blueprint.dashboard.name}`);
  }
  if (!currentDashboard) {
    operations.push(
      operation(
        `create dashboard ${blueprint.dashboard.id}`,
        "/dashboards",
        "POST",
        desiredDashboard,
      ),
    );
  } else if (!sameConfiguredValues(currentDashboard, desiredDashboard)) {
    operations.push(
      operation(
        `update dashboard ${blueprint.dashboard.id}`,
        `/dashboards/${encodeURIComponent(blueprint.dashboard.id)}`,
        "PATCH",
        desiredDashboard,
      ),
    );
  }

  const panelsById = new Map(currentPanels.map((panel) => [panel.id, panel]));
  for (const panel of blueprint.panels) {
    const desired = panelPayload(panel);
    const current = panelsById.get(panel.id);
    const panelByMarker = currentPanels.find(
      ({ note }) => markerFromNote(note) === panel.key,
    );
    const currentDashboardId =
      current?.dashboard && typeof current.dashboard === "object"
        ? current.dashboard.id
        : current?.dashboard;
    if (
      current &&
      (markerFromNote(current.note) !== panel.key ||
        currentDashboardId !== blueprint.dashboard.id)
    ) {
      throw new Error(`Panel ownership collision for ${panel.id}`);
    }
    if (panelByMarker && panelByMarker.id !== panel.id) {
      throw new Error(`Panel ownership collision for ${panel.key}`);
    }
    if (
      !current &&
      currentPanels.some((item) => {
        const dashboardId =
          item.dashboard && typeof item.dashboard === "object"
            ? item.dashboard.id
            : item.dashboard;
        return dashboardId === blueprint.dashboard.id && item.name === panel.name;
      })
    ) {
      throw new Error(`Panel name collision for ${panel.name}`);
    }
    if (!current) {
      operations.push(
        operation(`create panel ${panel.key}`, "/panels", "POST", desired),
      );
      continue;
    }
    if (sameConfiguredValues(current, desired)) continue;
    operations.push(
      operation(
        `update panel ${panel.key}`,
        `/panels/${encodeURIComponent(panel.id)}`,
        "PATCH",
        desired,
      ),
    );
  }

  if (!dryRun) {
    for (const item of operations) {
      await client.request(item.path, item.options);
    }
  }

  return operations.map(({ action }) => action);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyWorkspace(client, workspaceBlueprint, { dryRun });
  console.log(`${dryRun ? "Planned" : "Applied"} ${actions.length} workspace actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
