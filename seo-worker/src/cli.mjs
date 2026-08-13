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
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const flags = { dryRun: true, apply: false, help: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--apply') {
      flags.apply = true;
      flags.dryRun = false;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg.startsWith('--')) {
      flags.unknown = arg;
    }
  }
  return flags;
}

const HELP = `SEO content-factory worker (Deere-Shop)

Shadow by default. Writes nothing unless BOTH enabled and taken out of dry-run.

  --dry-run   plan only, write nothing (default)
  --apply     attempt real writes (still blocked unless env enables the worker)

Env:
  SEO_WORKER_ENABLED=true    enable the worker
  SEO_WORKER_DRY_RUN=false   allow writes
  DIRECTUS_URL               Directus base URL
  SEO_WORKER_TOKEN           Directus token (runtime only)
`;

export async function main({ argv = process.argv, env = process.env, stdout = process.stdout } = {}) {
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
