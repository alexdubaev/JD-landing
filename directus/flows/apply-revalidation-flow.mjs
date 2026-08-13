import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

export const REVALIDATION_COLLECTIONS = [
  "home_page",
  "page_sections",
  "site_settings",
  "navigation_items",
  "categories",
  "products",
  "articles",
  "faq_items",
  "recent_supplies",
];

const FLOW_NAME = "Ревалидация сайта";
const OPERATION_NAME = "Обновить сайт";
const OPERATION_KEY = "revalidate_site";

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

const containsDesired = (current, desired) => {
  if (Array.isArray(desired)) {
    return Array.isArray(current) &&
      current.length === desired.length &&
      desired.every((value, index) => containsDesired(current[index], value));
  }
  if (desired && typeof desired === "object") {
    return current && typeof current === "object" &&
      Object.entries(desired).every(([key, value]) => containsDesired(current[key], value));
  }
  return current === desired;
};

const validateConfig = ({ url, secret }) => {
  if (!url?.trim() || !secret?.trim()) {
    throw new Error("NEXT_REVALIDATE_URL and REVALIDATE_SECRET are required");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_REVALIDATE_URL must be an absolute HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("NEXT_REVALIDATE_URL must be an absolute HTTP(S) URL");
  }
};

export function buildRevalidationBlueprint(config) {
  validateConfig(config);
  return {
    flow: {
      name: FLOW_NAME,
      icon: "published_with_changes",
      color: "#2E7D32",
      description: "Автоматически обновляет сайт после сохранения контента в админке.",
      status: "active",
      trigger: "event",
      accountability: "$full",
      options: {
        type: "action",
        scope: ["items.create", "items.update", "items.delete"],
        collections: REVALIDATION_COLLECTIONS,
      },
    },
    operation: {
      name: OPERATION_NAME,
      key: OPERATION_KEY,
      type: "request",
      position_x: 19,
      position_y: 1,
      options: {
        method: "POST",
        url: config.url.trim(),
        headers: [{
          header: "x-revalidate-secret",
          value: config.secret.trim(),
        }],
        body: { collection: "{{$trigger.collection}}" },
      },
      resolve: null,
      reject: null,
    },
  };
}

export async function applyRevalidationFlow(
  client,
  config,
  { dryRun = false } = {},
) {
  const blueprint = buildRevalidationBlueprint(config);
  const actions = [];
  const flowQuery = new URLSearchParams({
    "filter[name][_eq]": FLOW_NAME,
    fields: "id,name,icon,color,description,status,trigger,accountability,options,operation",
    limit: "2",
  });
  const flows = await client.request(`/flows?${flowQuery.toString()}`);
  if (flows.length > 1) throw new Error(`Multiple managed flows named ${FLOW_NAME}`);

  let flow = flows[0] ?? null;
  if (!flow) {
    actions.push(`create flow ${FLOW_NAME}`);
    if (!dryRun) {
      flow = await client.request("/flows", {
        method: "POST",
        body: JSON.stringify(blueprint.flow),
      });
    }
  } else if (!containsDesired(flow, blueprint.flow)) {
    actions.push(`update flow ${FLOW_NAME}`);
    if (!dryRun) {
      await client.request(`/flows/${encodeURIComponent(flow.id)}`, {
        method: "PATCH",
        body: JSON.stringify(blueprint.flow),
      });
      flow = { ...flow, ...blueprint.flow };
    }
  }

  let operation = null;
  if (flow?.id) {
    const operationQuery = new URLSearchParams({
      "filter[flow][_eq]": flow.id,
      "filter[key][_eq]": OPERATION_KEY,
      fields: "id,name,key,type,position_x,position_y,options,resolve,reject,flow",
      limit: "2",
    });
    const operations = await client.request(`/operations?${operationQuery.toString()}`);
    if (operations.length > 1) {
      throw new Error(`Multiple managed operations with key ${OPERATION_KEY}`);
    }
    operation = operations[0] ?? null;
  }

  if (!operation) {
    actions.push(`create operation ${OPERATION_NAME}`);
    if (!dryRun) {
      operation = await client.request("/operations", {
        method: "POST",
        body: JSON.stringify({ ...blueprint.operation, flow: flow.id }),
      });
    }
  } else if (!containsDesired(operation, blueprint.operation)) {
    actions.push(`update operation ${OPERATION_NAME}`);
    if (!dryRun) {
      await client.request(`/operations/${encodeURIComponent(operation.id)}`, {
        method: "PATCH",
        body: JSON.stringify(blueprint.operation),
      });
      operation = { ...operation, ...blueprint.operation };
    }
  }

  if (relationId(flow?.operation) !== operation?.id) {
    actions.push("connect flow operation");
    if (!dryRun) {
      await client.request(`/flows/${encodeURIComponent(flow.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ operation: operation.id }),
      });
    }
  }

  return actions;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyRevalidationFlow(
    client,
    {
      url: process.env.NEXT_REVALIDATE_URL,
      secret: process.env.REVALIDATE_SECRET,
    },
    { dryRun },
  );
  if (actions.length === 0) {
    console.log("Revalidation flow is already up to date.");
    return;
  }
  console.log(`${dryRun ? "Planned" : "Applied"} ${actions.length} actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
