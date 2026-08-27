import { createSeoFactoryConfig } from "./config.mjs";
import { createDirectusClient } from "./directus-client.mjs";
import { createDaemon, runShadowBatch } from "./worker.mjs";

const factoryConfig = createSeoFactoryConfig(process.env);

console.log(JSON.stringify({ service: "seo-worker", enabled: factoryConfig.enabled, shadow: true, schedule: factoryConfig.productionSchedule }));

const task = async () => {
  if (!factoryConfig.enabled || !factoryConfig.productionSchedule) return;
  if (!factoryConfig.directusUrl || !factoryConfig.directusToken) return;
  const client = createDirectusClient(factoryConfig);
  await runShadowBatch({ client, config: factoryConfig });
};

createDaemon({
  task,
  intervalMs: Number(process.env.SEO_FACTORY_INTERVAL_MS || 900000),
  // Match the previous entry point: tick at once only when the production
  // schedule is armed; the interval itself always runs and no-ops when
  // disabled.
  runOnStart: factoryConfig.enabled && factoryConfig.productionSchedule,
}).start();
