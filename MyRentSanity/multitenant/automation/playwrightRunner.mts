import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { JSONReport } from '@playwright/test/reporter';
import type { SanitySuite } from './suiteDefinitions.mts';
import { flattenReport, type SpecOutcome } from './jsonReport.mts';
import { stripAnsi } from './ansi.mts';
import { fileURLToPath } from 'node:url';
import type { Role } from '../utils/env.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface SuiteAttempt {
  attemptNumber: number;
  specs: SpecOutcome[];
  exitCode: number;
}

/** Thrown out of runPlaywrightOnce/runSuite when `options.signal` is aborted mid-run — never a real test failure. */
export class RunStoppedError extends Error {
  constructor() {
    super('Run stopped by user.');
    this.name = 'RunStoppedError';
  }
}

/**
 * Kills the whole process tree rooted at `pid`, not just that one process —
 * runPlaywrightOnce spawns through a shell (`shell: true`, see below), so `pid`
 * is cmd.exe's own pid on Windows, with npx/node/the actual browser as its
 * children. `child.kill()` alone only signals cmd.exe and leaves the rest
 * running. `taskkill /t` walks the tree; `/f` is needed because Playwright's
 * own processes don't respond to a plain terminate request.
 */
function killProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f']);
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process had already exited on its own.
      }
    }
  }
}

export interface SuiteRunResult {
  suite: SanitySuite;
  attempts: SuiteAttempt[];
  /** The attempt reported as the suite's outcome — always the last one run. */
  finalAttempt: SuiteAttempt;
}

/**
 * Progress events emitted while running — the one live-progress API shared by
 * both the CLI (prints them as text) and the web dashboard (broadcasts them
 * over SSE). Neither interface talks to child_process/Playwright directly.
 */
export type RunEvent =
  | { type: 'suite-start'; suiteId: string; attemptNumber: number; maxAttempts: number }
  | { type: 'suite-log'; suiteId: string; line: string }
  | { type: 'suite-attempt-done'; suiteId: string; attemptNumber: number; passed: boolean; specs: SpecOutcome[] }
  | { type: 'suite-retry'; suiteId: string; nextAttemptNumber: number; maxAttempts: number }
  | { type: 'suite-stopped'; suiteId: string }
  | { type: 'suite-done'; suiteId: string; result: SuiteRunResult }
  | { type: 'run-done'; results: SuiteRunResult[] }
  | { type: 'run-stopped'; results: SuiteRunResult[] };

export interface RunOptions {
  /** Extra reruns for a suite whose failures all lack a diagnosed cause — see jsonReport.mts. */
  maxSilentRetries: number;
  headed: boolean;
  /** Which account to log in as — passed to the spawned `playwright test` process as MT_RUN_AS (see playwright.config.ts). */
  role: Role;
  /** Which MyRent instance to run against — passed as MT_INSTANCE (see utils/instances.ts and config/instances.json). */
  instance: string;
  /** Aborting this kills the in-flight `playwright test` process tree and halts the rest of the batch — see the dashboard's "End" button (server.mts). */
  signal?: AbortSignal;
  onEvent?: (event: RunEvent) => void;
}

/**
 * The single source of truth for "did this attempt pass" — every other place
 * that used to ask this question (server.mts, report.mts, sanityCli.mts)
 * imports this instead of repeating the check.
 *
 * Requires at least one reported spec AND a clean (0) exit code, not just
 * `specs.every(...)`. `[].every(...)` is vacuously true in JS: a suite whose
 * `global-setup.ts` throws before any test runs (e.g. login failing) exits
 * non-zero with zero specs in the JSON report, and the old plain `.every()`
 * check read that as a trivial PASS — confirmed live (23 Sep 2026): a broken
 * login showed "PASS" on the dashboard with "No spec results reported for
 * this run" as the only clue anything was wrong.
 */
export function attemptPassed(attempt: Pick<SuiteAttempt, 'specs' | 'exitCode'>): boolean {
  if (attempt.specs.length === 0) return false;
  if (attempt.exitCode !== 0) return false;
  return attempt.specs.every((spec) => spec.status === 'passed' || spec.status === 'skipped');
}

function everyFailureUndiagnosed(specs: SpecOutcome[]): boolean {
  // Zero specs means the process crashed before any test ran — almost always
  // global-setup's login against this same shared, flaky environment (see
  // attemptPassed above). That's exactly the kind of failure maxSilentRetries
  // exists to absorb, so it's treated as "undiagnosed" (worth retrying) rather
  // than falling through `failures.length > 0` to "nothing to retry".
  if (specs.length === 0) return true;
  const failures = specs.filter((spec) => spec.status !== 'passed' && spec.status !== 'skipped');
  return failures.length > 0 && failures.every((failure) => !failure.hasDiagnosedCause);
}

async function runPlaywrightOnce(
  suite: SanitySuite,
  headed: boolean,
  role: Role,
  instance: string,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<{ exitCode: number; report: JSONReport }> {
  const jsonOutputDir = await mkdtemp(path.join(tmpdir(), 'myrent-mt-sanity-'));
  const jsonOutputFile = path.join(jsonOutputDir, 'report.json');
  let stoppedByUser = false;

  try {
    // MULTITENANT: its own Playwright config (multitenant/playwright.config.ts), never the tenant-based one at the repo root.
    const commandParts = ['npx', 'playwright', 'test', suite.testDir, '--config=multitenant/playwright.config.ts', '--project=sanity', '--reporter=list,json'];
    if (headed) commandParts.push('--headed');

    const exitCode = await new Promise<number>((resolve, reject) => {
      // A single command string (not command + args array) run through the
      // shell: on Windows, npx is npx.cmd, and spawning a .cmd file directly
      // without a shell fails outright (Node blocks it as a security
      // hardening measure). Passing one string instead of a command+args pair
      // also sidesteps Node's shell-escaping deprecation warning for that
      // combination — moot anyway since every part here is a fixed constant
      // from suiteDefinitions.mts, never user input.
      const child = spawn(commandParts.join(' '), {
        shell: true,
        // Always the repo root, so the relative multitenant/ paths above resolve however the server/CLI was launched.
        cwd: REPO_ROOT,
        // Piped (not 'inherit'): both the CLI and the web dashboard replay
        // each line themselves via onLine, so it works the same way regardless
        // of which interface is driving this run.
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOutputFile, MT_RUN_AS: role, MT_INSTANCE: instance },
      });
      // Playwright hardcodes color for its own worker subprocesses regardless
      // of env vars set here (see automation/ansi.mts), so every line is
      // stripped before onLine ever sees it — raw ANSI codes would otherwise
      // render as literal escape bytes in the web dashboard's log panel.
      const onCleanLine = (line: string) => onLine(stripAnsi(line));
      createInterface({ input: child.stdout }).on('line', onCleanLine);
      createInterface({ input: child.stderr }).on('line', onCleanLine);
      child.on('error', reject);
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(code ?? 1);
      });
      // Registered after spawn (there's nothing to kill before the child
      // exists) — an abort that arrives between suites, not mid-process, is
      // instead caught by runSuites/runSuite checking signal.aborted directly.
      const onAbort = () => {
        stoppedByUser = true;
        killProcessTree(child.pid);
      };
      signal?.addEventListener('abort', onAbort);
    });

    // The JSON reporter only writes its file once Playwright exits on its own
    // — a forced kill leaves it missing or half-written, so parsing it here
    // would throw ENOENT/SyntaxError and mask the real reason (user stop)
    // behind a confusing crash.
    if (stoppedByUser) throw new RunStoppedError();

    const report = JSON.parse(await readFile(jsonOutputFile, 'utf-8')) as JSONReport;
    return { exitCode, report };
  } finally {
    await rm(jsonOutputDir, { recursive: true, force: true });
  }
}

/**
 * Runs one suite's Playwright process and — only when every failure lacks a
 * diagnosed cause (testWithCrashLogging's tags never fired) — reruns the whole
 * suite, up to `maxSilentRetries` extra times. That mirrors the README's own
 * advice for this shared legacy server: a spec that fails with no crash/error
 * line pointing at a real cause is worth retrying before it's treated as a bug.
 * A failure that DOES carry a diagnosed cause is reported as-is on the first
 * attempt — it's never auto-retried, so a real bug can't get silently masked.
 */
export async function runSuite(suite: SanitySuite, options: RunOptions): Promise<SuiteRunResult> {
  const onEvent = options.onEvent ?? (() => {});
  const attempts: SuiteAttempt[] = [];
  const maxAttempts = options.maxSilentRetries + 1;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    onEvent({ type: 'suite-start', suiteId: suite.id, attemptNumber, maxAttempts });

    let exitCode: number;
    let report: JSONReport;
    try {
      ({ exitCode, report } = await runPlaywrightOnce(
        suite,
        options.headed,
        options.role,
        options.instance,
        (line) => onEvent({ type: 'suite-log', suiteId: suite.id, line }),
        options.signal,
      ));
    } catch (error) {
      if (error instanceof RunStoppedError) onEvent({ type: 'suite-stopped', suiteId: suite.id });
      throw error;
    }
    const specs = flattenReport(report);
    const attempt: SuiteAttempt = { attemptNumber, specs, exitCode };
    attempts.push(attempt);

    const passed = attemptPassed(attempt);
    onEvent({ type: 'suite-attempt-done', suiteId: suite.id, attemptNumber, passed, specs });

    const worthRetrying = !passed && attemptNumber < maxAttempts && everyFailureUndiagnosed(specs);
    if (passed || !worthRetrying) break;

    onEvent({ type: 'suite-retry', suiteId: suite.id, nextAttemptNumber: attemptNumber + 1, maxAttempts });
  }

  const result: SuiteRunResult = { suite, attempts, finalAttempt: attempts[attempts.length - 1] };
  onEvent({ type: 'suite-done', suiteId: suite.id, result });
  return result;
}

/**
 * Runs every suite in order, one at a time — never concurrently.
 * playwright.config.ts pins workers to 1 for the same reason: this shared
 * legacy server gets flaky under concurrent sessions, so running suites
 * back-to-back respects that constraint at the process level too.
 */
export async function runSuites(suites: SanitySuite[], options: RunOptions): Promise<SuiteRunResult[]> {
  const onEvent = options.onEvent ?? (() => {});
  const results: SuiteRunResult[] = [];
  for (const suite of suites) {
    // Checked before each suite too, not just inside runPlaywrightOnce — a
    // stop requested between suites (nothing to kill yet) must still halt the
    // rest of the batch instead of starting the next one anyway.
    if (options.signal?.aborted) break;
    try {
      results.push(await runSuite(suite, options));
    } catch (error) {
      if (error instanceof RunStoppedError) {
        onEvent({ type: 'run-stopped', results });
        return results;
      }
      throw error;
    }
  }
  onEvent({ type: 'run-done', results });
  return results;
}
