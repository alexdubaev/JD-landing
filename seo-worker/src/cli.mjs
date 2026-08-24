// seo-worker/src/cli.mjs
//
// CLI entry point for the SEO content-factory worker.
//
// Safety posture:
//   - The worker is disabled/shadow by default. With no env flags it does
//     nothing and exits 0.
//   - `--dry-run` is the default. Even with SEO_WORKER_ENABLED=true the worker
//     stays in shadow unless SEO_WORKER_DRY_RUN=false AND --apply is passed.
//   - The CLI never touches production in this track; real runs require wiring
//     by Agent RC and explicit owner approval.
//
// Usage:
//   node src/cli.mjs                       # shadow: plan only, write nothing
//   node src/cli.mjs --dry-run             # explicit dry-run
//   node src/cli.mjs --apply               # still shadow unless env enables it
//
// Env (read at runtime, never hardcoded):
//   SEO_WORKER_ENABLED   must be "true" to enable
//   SEO_WORKER_DRY_RUN   must be "false" to allow writes
//   DIRECTUS_URL         Directus base URL
//   SEO_WORKER_TOKEN     Directus token (runtime only)
//   SEO_WORKER_RUN_ID    optional run id

import { loadConfig, isShadow } from './config.mjs';
import { createDirectusClient } from './directus-client.mjs';
import { auditProducts, createDirectusProductPageReader } from './qa-audit.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const flags = { dryRun: true, explicitDryRun: false, apply: false, help: false, limit: undefined };
  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--apply') {
      flags.apply = true;
      flags.dryRun = false;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
      flags.explicitDryRun = true;
    } else if (arg.startsWith('--limit=')) {
      const limit = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(limit) || limit < 0) flags.unknown = arg;
      else flags.limit = limit;
    } else if (arg.startsWith('--')) {
      flags.unknown = arg;
    }
  }
  return flags;
}

const HELP = `SEO content-factory worker (Deere-Shop)

Shadow by default. Writes nothing unless BOTH enabled and taken out of dry-run.

  --dry-run   run the read-only product QA audit and print its JSON report
  --limit=N   scan at most N products during --dry-run
  --apply     attempt real writes (still blocked unless env enables the worker)

Env:
  SEO_WORKER_ENABLED=true    enable the worker
  SEO_WORKER_DRY_RUN=false   allow writes
  DIRECTUS_URL               Directus base URL
  SEO_WORKER_TOKEN           Directus token (runtime only)
`;

export async function main({
  argv = process.argv,
  env = process.env,
  stdout = process.stdout,
  pageReader,
  client,
} = {}) {
  const flags = parseArgs(argv);

  if (flags.help) {
    stdout.write(HELP);
    return { exitCode: 0, action: 'help' };
  }

  if (flags.unknown) {
    stdout.write(`Unknown flag: ${flags.unknown}\n${HELP}`);
    return { exitCode: 2, action: 'unknown_flag' };
  }

  const config = loadConfig(env);

  // An explicit dry run is a read-only product QA audit. It intentionally does
  // not use the worker's write gates and never calls createItem/updateItem.
  if (flags.explicitDryRun) {
    let reader = pageReader;
    if (!reader) {
      if (!client) {
        if (!config.directusUrl || !config.directusToken) {
          const report = { scanned: 0, tasks: [], error: 'DIRECTUS_URL and SEO_WORKER_TOKEN are required for QA dry-run' };
          stdout.write(`${JSON.stringify(report, null, 2)}\n`);
          return { exitCode: 2, action: 'qa_dry_run', written: false, report };
        }
        client = createDirectusClient(config);
      }
      reader = createDirectusProductPageReader(client);
    }
    try {
      const report = await auditProducts({ pageReader: reader, limit: flags.limit });
      stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return { exitCode: 0, action: 'qa_dry_run', written: false, report };
    } catch {
      const report = { scanned: 0, tasks: [], error: 'QA dry-run failed' };
      stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return { exitCode: 1, action: 'qa_dry_run', written: false, report };
    }
  }

  if (isShadow(config)) {
    const reasons = [];
    if (!config.enabled) reasons.push('SEO_WORKER_ENABLED is not "true"');
    if (config.dryRun) reasons.push('dry-run is on (SEO_WORKER_DRY_RUN !== "false")');
    stdout.write(`seo-worker: shadow mode, writing nothing (${reasons.join('; ')}).\n`);
    return { exitCode: 0, action: 'shadow', reasons };
  }

  if (flags.dryRun && !flags.apply) {
    stdout.write('seo-worker: --apply not passed, writing nothing.\n');
    return { exitCode: 0, action: 'shadow', reasons: ['--apply not passed'] };
  }

  // At this point the worker is enabled, out of dry-run, and --apply was passed.
  // The actual production run is wired by Agent RC and requires owner approval;
  // this CLI deliberately does not run an unattended batch here.
  stdout.write(
    `seo-worker: ready (run ${config.runId}). No autonomous batch is executed by this CLI; ` +
      'integration runs are performed only after wiring and owner approval.\n',
  );
  return { exitCode: 0, action: 'ready', runId: config.runId };
}

// When invoked directly (not imported), run main and surface the exit code.
// Cross-platform: resolve argv[1] the same way Node normalises file:// URLs.
const isDirect =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().then((result) => {
    process.exitCode = result.exitCode || 0;
  });
}
