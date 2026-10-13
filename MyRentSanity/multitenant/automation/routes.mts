import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile as readFileText } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANITY_SUITES } from './suiteDefinitions.mts';
import { runSuites, attemptPassed, type RunEvent, type SuiteRunResult } from './playwrightRunner.mts';
import type { SpecOutcome } from './jsonReport.mts';
import type { Role } from '../utils/env.ts';
import { DEFAULT_INSTANCE_ID, loadInstances, suiteAvailableOn } from './instanceRegistry.mts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_LOG_LINES_PER_SUITE = 500;

type SuiteStatus = 'pending' | 'queued' | 'running' | 'passed' | 'failed' | 'stopped';

interface SuiteState {
  status: SuiteStatus;
  attemptNumber: number;
  maxAttempts: number;
  log: string[];
  specs: SpecOutcome[];
}

function freshSuiteState(): SuiteState {
  return { status: 'pending', attemptNumber: 0, maxAttempts: 1, log: [], specs: [] };
}

/** A run requested while another was already in progress — held until the current run finishes, then started in order. */
interface QueuedRun {
  suiteIds: string[];
  maxSilentRetries: number;
  headed: boolean;
  role: Role;
  instance: string;
}

/**
 * The dashboard's whole server-side state — one snapshot, hydrated to any
 * browser tab that (re)connects via GET /api/state, then kept live over SSE.
 * Only one run actually executes at a time (see startRun below), mirroring
 * runSuites()'s own one-suite-at-a-time constraint — requests made while a
 * run is in progress are held in `queue` and started in order as each
 * previous run finishes, rather than rejected.
 */
const state = {
  running: false,
  /** Role of the most recently started run — lets a (re)connecting browser tab show who a run/result was for. */
  role: 'administrator' as Role,
  /** Instance of the most recently started run — same purpose as `role`. */
  instance: DEFAULT_INSTANCE_ID,
  suites: Object.fromEntries(SANITY_SUITES.map((suite) => [suite.id, freshSuiteState()])) as Record<string, SuiteState>,
  queue: [] as QueuedRun[],
};

/** Aborts the run currently in progress (see the dashboard's "End" button) — null whenever state.running is false. */
let currentRunAbort: AbortController | null = null;
/** The suite ids belonging to the in-flight run — lets run-stopped mark any that never got to start as 'stopped' too, instead of leaving them looking untouched. */
let currentRunSuiteIds: string[] = [];

const sseClients = new Set<ServerResponse>();

function broadcast(event: object): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) client.write(payload);
}

function suitePassed(result: SuiteRunResult): boolean {
  return attemptPassed(result.finalAttempt);
}

/** Only the first line of an error — the rest is Playwright's own stack trace/code frame, not useful in a terminal summary. */
function firstLine(text: string): string {
  return text.split('\n')[0].trim();
}

/**
 * Mirrors run progress to the terminal too — otherwise it only ever streams
 * to whichever browser tab has the dashboard open over SSE, so the console
 * window someone's actually watching (e.g. after launching Start
 * Dashboard.bat) sits silent for the whole run even though real work is
 * happening. Deliberately NOT a full mirror of suite-log's raw output —
 * that's every line Playwright's reporter and this legacy app's own console
 * noise produce (HTTP 5xx spam, MIME-type warnings, etc.), unreadable at
 * suite volume. What's actually useful in a terminal: which entity is being
 * created (Quotation/Reservation/Rental Agreement — the page objects' own
 * [STEP] lines already say this, e.g. "Clicking \"Create\" on .../preventivi/create"),
 * its id once created ("Quotation created successfully: X"), when each spec
 * itself finishes, and why a spec failed. The first two come through the
 * [STEP] filter below. "When each spec finishes" needs its own filter,
 * separate from [STEP]: Playwright's own list reporter prints one line per
 * test only once it's done (e.g. "ok 2 [sanity] › tests/.../create-reservation-...
 * (12.3s)"), and nothing marks a test *starting* — without also keeping that
 * line, a spec whose own page object never happens to log anything (or fails
 * before its first [STEP] line) would show no activity for it at all, which
 * read as "it's not even starting". Failures use SpecOutcome's own
 * errorMessage (from jsonReport.mts) rather than trying to grep raw output —
 * a bare thrown error (e.g. formHelpers.ts's retryFieldSelection giving up)
 * never gets a [STEP FAILED] line at all, so that's the only reliable source
 * for "why" in every case.
 */
function logEventToTerminal(event: RunEvent): void {
  switch (event.type) {
    case 'suite-start':
      console.log(`\n=== ${event.suiteId} — attempt ${event.attemptNumber}/${event.maxAttempts} ===`);
      break;
    case 'suite-log': {
      const isStepLine = /^\[STEP(?: FAILED)?\]/.test(event.line);
      const isTestResultLine = /^\s*(ok|x)\s+\d+\s+\[/.test(event.line);
      if (isStepLine || isTestResultLine) console.log(`[${event.suiteId}] ${event.line.trim()}`);
      break;
    }
    case 'suite-attempt-done':
      for (const spec of event.specs) {
        if (spec.status === 'passed' || spec.status === 'skipped') continue;
        const reason = spec.reason ?? (spec.errorMessage ? firstLine(spec.errorMessage) : `status: ${spec.status}`);
        console.log(`[${event.suiteId}] FAILED — ${spec.title}: ${reason}`);
        for (const step of spec.steps ?? []) {
          const mark = step.passed ? 'PASS' : step.notRun ? 'NOT RUN' : 'FAIL';
          console.log(`[${event.suiteId}]   ${mark.padEnd(7)} ${step.title}${step.passed || step.notRun ? '' : ` — ${step.evidence}`}`);
        }
      }
      console.log(`[${event.suiteId}] attempt ${event.attemptNumber}: ${event.passed ? 'PASSED' : 'FAILED'}`);
      break;
    case 'suite-retry':
      console.log(`[${event.suiteId}] retrying — attempt ${event.nextAttemptNumber}/${event.maxAttempts}`);
      break;
    case 'suite-stopped':
      console.log(`[${event.suiteId}] stopped by user`);
      break;
    case 'suite-done':
      console.log(`[${event.suiteId}] done: ${suitePassed(event.result) ? 'PASSED' : 'FAILED'}`);
      break;
    case 'run-done':
      console.log('\nAll suites finished.\n');
      break;
    case 'run-stopped':
      console.log('\nRun stopped by user.\n');
      break;
  }
}

/** Mirrors every RunEvent into `state` before broadcasting it — this is the only place state is mutated. */
function handleRunEvent(event: RunEvent): void {
  logEventToTerminal(event);
  switch (event.type) {
    case 'suite-start': {
      const suite = state.suites[event.suiteId];
      suite.status = 'running';
      suite.attemptNumber = event.attemptNumber;
      suite.maxAttempts = event.maxAttempts;
      if (event.attemptNumber === 1) {
        suite.log = [];
        suite.specs = [];
      }
      break;
    }
    case 'suite-log': {
      const suite = state.suites[event.suiteId];
      suite.log.push(event.line);
      if (suite.log.length > MAX_LOG_LINES_PER_SUITE) suite.log.shift();
      break;
    }
    case 'suite-attempt-done': {
      const suite = state.suites[event.suiteId];
      suite.specs = event.specs;
      suite.status = event.passed ? 'passed' : 'failed';
      break;
    }
    case 'suite-stopped': {
      state.suites[event.suiteId].status = 'stopped';
      break;
    }
    case 'suite-done': {
      state.suites[event.suiteId].status = suitePassed(event.result) ? 'passed' : 'failed';
      break;
    }
    case 'run-done': {
      state.running = false;
      currentRunAbort = null;
      dequeueNext();
      break;
    }
    case 'run-stopped': {
      state.running = false;
      currentRunAbort = null;
      // Suites in this batch that hadn't started yet (never got a
      // suite-start/suite-stopped event) are still sitting in freshSuiteState()
      // from startRun — mark them stopped too, so the batch reads as
      // deliberately cut short rather than looking untouched or stuck pending.
      for (const id of currentRunSuiteIds) {
        const suite = state.suites[id];
        if (suite && (suite.status === 'pending' || suite.status === 'queued')) suite.status = 'stopped';
      }
      dequeueNext();
      break;
    }
  }
  broadcast(event);
}

function queueSnapshot(): string[][] {
  return state.queue.map((run) => run.suiteIds);
}

/** Pops the next queued run (if any) and starts it — called once the current run finishes, whether it passed, failed, or errored. */
function dequeueNext(): void {
  const next = state.queue.shift();
  broadcast({ type: 'queue-update', queue: queueSnapshot() });
  if (next) startRun(next.suiteIds, next.maxSilentRetries, next.headed, next.role, next.instance);
}

async function startRun(suiteIds: string[], maxSilentRetries: number, headed: boolean, role: Role, instance: string): Promise<void> {
  if (state.running) throw new Error('A run is already in progress.');
  state.running = true;
  state.role = role;
  state.instance = instance;
  currentRunSuiteIds = suiteIds;
  const abort = new AbortController();
  currentRunAbort = abort;
  for (const id of suiteIds) state.suites[id] = freshSuiteState();
  broadcast({ type: 'run-start', suiteIds, role, instance });
  console.log(`\n=== [multitenant] Starting run (${instance}, ${role}): ${suiteIds.join(', ')} ===`);

  const suites = suiteIds.map((id) => SANITY_SUITES.find((suite) => suite.id === id)!);
  // Deliberately not awaited: the HTTP handler responds as soon as the run is
  // accepted, and progress streams to clients over SSE as it happens.
  runSuites(suites, { maxSilentRetries, headed, role, instance, signal: abort.signal, onEvent: handleRunEvent }).catch((error: unknown) => {
    state.running = false;
    currentRunAbort = null;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nRun failed: ${message}`);
    broadcast({ type: 'run-error', message });
    dequeueNext();
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Every multitenant request lives under /mt (page at /mt/, API at /mt/api/...). The tenant-based
 * server only forwards those paths here; it never reads or writes anything in this module.
 */
export async function handleMultitenantRequest(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {

  if (req.method === 'GET' && (url.pathname === '/mt' || url.pathname === '/mt/')) {
    const html = await readFileText(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/mt/api/suites') {
    sendJson(res, 200, SANITY_SUITES);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/mt/api/instances') {
    // Re-read per request so an edit to config/instances.json shows up on
    // a page refresh, without restarting the dashboard.
    sendJson(res, 200, loadInstances());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/mt/api/state') {
    sendJson(res, 200, state);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/mt/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/mt/api/run') {
    const body = await readJsonBody(req);
    const instances = loadInstances();
    const instanceId: string = typeof body.instance === 'string' ? body.instance : DEFAULT_INSTANCE_ID;
    const instance = instances.find((candidate) => candidate.id === instanceId);
    if (!instance) {
      sendJson(res, 400, { error: `Unknown instance: ${instanceId}` });
      return;
    }
    const suiteIds: string[] =
      Array.isArray(body.suiteIds) && body.suiteIds.length > 0
        ? body.suiteIds
        : SANITY_SUITES.filter((s) => suiteAvailableOn(s, instance)).map((s) => s.id);

    const unknownIds = suiteIds.filter((id) => !SANITY_SUITES.some((suite) => suite.id === id));
    if (unknownIds.length > 0) {
      sendJson(res, 400, { error: `Unknown suite id(s): ${unknownIds.join(', ')}` });
      return;
    }
    const unavailableIds = suiteIds.filter((id) => instance.excludedSuites.includes(id));
    if (unavailableIds.length > 0) {
      sendJson(res, 400, { error: `Not available on ${instance.id}: ${unavailableIds.join(', ')}` });
      return;
    }

    const retries = Number.isInteger(body.retries) && body.retries >= 0 ? body.retries : 1;
    const headed = body.headed === true;
    const role: Role = body.role === 'operator' ? 'operator' : 'administrator';

    if (state.running) {
      state.queue.push({ suiteIds, maxSilentRetries: retries, headed, role, instance: instance.id });
      // Don't downgrade a suite that's still finishing its *current* run — only
      // suites waiting for this queued run get the 'queued' badge.
      for (const id of suiteIds) {
        const suite = state.suites[id];
        if (suite && suite.status !== 'running') suite.status = 'queued';
      }
      broadcast({ type: 'queue-update', queue: queueSnapshot() });
      sendJson(res, 202, { queued: true, position: state.queue.length });
      return;
    }

    try {
      await startRun(suiteIds, retries, headed, role, instance.id);
      sendJson(res, 202, { started: true });
    } catch (error) {
      sendJson(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/mt/api/stop') {
    if (!state.running || !currentRunAbort) {
      sendJson(res, 409, { error: 'No run in progress.' });
      return;
    }
    console.log('\n[dashboard] Stop requested — killing the in-progress suite process.\n');
    currentRunAbort.abort();
    sendJson(res, 202, { stopping: true });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found (multitenant)');
}

