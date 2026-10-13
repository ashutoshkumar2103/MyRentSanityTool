import { writeFile } from 'node:fs/promises';
import { SANITY_SUITES } from './suiteDefinitions.mts';
import { runSuites, attemptPassed } from './playwrightRunner.mts';
import { toConsoleSummary, toJsonSummary } from './report.mts';
import type { Role } from '../utils/env.ts';
import { DEFAULT_INSTANCE_ID, loadInstances, suiteAvailableOn, type InstanceSummary } from './instanceRegistry.mts';

interface CliOptions {
  suiteIds: string[];
  maxSilentRetries: number;
  headed: boolean;
  role: Role;
  instance: string;
  jsonOutPath?: string;
}

function printHelp(): void {
  const suiteIds = SANITY_SUITES.map((suite) => suite.id).join(' | ');
  const instanceIds = loadInstances().map((instance) => instance.id).join(' | ');
  console.log(`
Usage: npm run sanity:auto -- [options]

Runs MyRent's creation-flow sanity suites (${suiteIds}) as separate
Playwright invocations and prints one combined, readable report.

Options:
  --suite <id>     Run only this suite. Repeatable. One of: ${suiteIds}
                   (default: all)
  --retries <n>    Max reruns for a suite whose failures all carry no diagnosed
                   cause (see README "Transient server-side flakiness").
                   (default: 1)
  --role <r>       Which account to run as: administrator | operator (default: administrator).
  --instance <id>  Which MyRent instance to run against: ${instanceIds}
                   (default: ${DEFAULT_INSTANCE_ID}). Suites an instance excludes are skipped
                   — see config/instances.json.
  --headed         Run Playwright with a visible browser.
  --json <path>    Also write the full structured result set as JSON.
  --help, -h       Show this help.
`);
}

/** Returns 'help' when the caller should just print help and stop — never exits the process itself. */
function parseArgs(argv: string[]): CliOptions | 'help' {
  const options: CliOptions = { suiteIds: [], maxSilentRetries: 1, headed: false, role: 'administrator', instance: DEFAULT_INSTANCE_ID };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--suite':
        options.suiteIds.push(argv[++i]);
        break;
      case '--retries':
        options.maxSilentRetries = Number(argv[++i]);
        break;
      case '--role': {
        const value = argv[++i];
        if (value !== 'administrator' && value !== 'operator') {
          throw new Error(`--role must be "administrator" or "operator", got "${value}"`);
        }
        options.role = value;
        break;
      }
      case '--instance':
        options.instance = argv[++i];
        break;
      case '--headed':
        options.headed = true;
        break;
      case '--json':
        options.jsonOutPath = argv[++i];
        break;
      case '--help':
      case '-h':
        return 'help';
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxSilentRetries) || options.maxSilentRetries < 0) {
    throw new Error(`--retries must be a non-negative integer, got "${options.maxSilentRetries}"`);
  }

  return options;
}

function resolveInstance(id: string): InstanceSummary {
  const instances = loadInstances();
  const instance = instances.find((candidate) => candidate.id === id);
  if (!instance) throw new Error(`Unknown instance "${id}". Valid ids: ${instances.map((i) => i.id).join(', ')}`);
  return instance;
}

function resolveSuites(suiteIds: string[], instance: InstanceSummary) {
  if (suiteIds.length === 0) return SANITY_SUITES.filter((suite) => suiteAvailableOn(suite, instance));

  return suiteIds.map((id) => {
    const suite = SANITY_SUITES.find((candidate) => candidate.id === id);
    if (!suite) throw new Error(`Unknown suite "${id}". Valid ids: ${SANITY_SUITES.map((s) => s.id).join(', ')}`);
    if (!suiteAvailableOn(suite, instance)) throw new Error(`Suite "${id}" isn't available on instance "${instance.id}".`);
    return suite;
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options === 'help') {
    printHelp();
    return;
  }

  const instance = resolveInstance(options.instance);
  const suites = resolveSuites(options.suiteIds, instance);
  console.log(`[sanity-runner] Instance: ${instance.id}, role: ${options.role}`);
  const results = await runSuites(suites, {
    maxSilentRetries: options.maxSilentRetries,
    headed: options.headed,
    role: options.role,
    instance: instance.id,
    onEvent: (event) => {
      if (event.type === 'suite-log') console.log(event.line);
      else if (event.type === 'suite-retry') {
        console.log(
          `\n[sanity-runner] failed with no diagnosed cause (README: "Transient server-side flakiness") — ` +
            `retrying, attempt ${event.nextAttemptNumber}/${event.maxAttempts}\n`,
        );
      }
    },
  });

  console.log(toConsoleSummary(results));

  if (options.jsonOutPath) {
    await writeFile(options.jsonOutPath, JSON.stringify(toJsonSummary(results), null, 2));
    console.log(`Wrote JSON results to ${options.jsonOutPath}`);
  }

  const overallPassed = results.every((result) => attemptPassed(result.finalAttempt));
  // Set the exit code and let the process end naturally (no forced process.exit()) —
  // node:child_process leaves handles around after a child closes that a hard
  // process.exit() here can tear down mid-cleanup and crash on Windows.
  process.exitCode = overallPassed ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
