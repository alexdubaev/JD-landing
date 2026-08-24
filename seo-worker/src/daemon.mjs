import { createSeoFactoryConfig } from "./config.mjs";
import { createDirectusClient } from "./directus-client.mjs";
import { createNonOverlappingScheduler, runShadowBatch } from "./worker.mjs";

const factoryConfig = createSeoFactoryConfig(process.env);

console.log(JSON.stringify({ service: "seo-worker", enabled: factoryConfig.enabled, shadow: true, schedule: factoryConfig.productionSchedule }));

const task = async () => {
  if (!factoryConfig.enabled || !factoryConfig.productionSchedule) return;
  if (!factoryConfig.directusUrl || !factoryConfig.directusToken) return;
  const client = createDirectusClient(factoryConfig);
  await runShadowBatch({ client, config: factoryConfig });
};

const scheduler = createNonOverlappingScheduler(task);
if (factoryConfig.enabled && factoryConfig.productionSchedule) scheduler.tick();
setInterval(() => scheduler.tick(), Number(process.env.SEO_FACTORY_INTERVAL_MS || 900000));
