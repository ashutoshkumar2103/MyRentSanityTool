import type { JSONReport, JSONReportSuite, JSONReportTestResult, JSONReportTestStep } from '@playwright/test/reporter';
import { stripAnsi } from './ansi.mts';

/**
 * One top-level `test.step()` inside a spec — only meaningful for a spec that
 * uses test.step() at all (every dashboard suite now does, via
 * fixtures/sanityStep.ts, so each shows a per-step results table). Specs
 * without test.step() (e.g. tests/sanity) leave SpecOutcome.steps undefined, and
 * nothing about it changes.
 */
export interface StepOutcome {
  title: string;
  passed: boolean;
  /** Listed in the spec's `[PLAN]` line but never started, because an earlier step failed — see fixtures/sanityStep.ts. */
  notRun?: boolean;
  durationMs: number;
  /**
   * A passed step's own last `[EVIDENCE] ...` console.log line (see spec
   * files' test.step() callbacks) — e.g. "Quotation created successfully:
   * PMO-22". A failed step instead gets a plain-English reason (see
   * explainFailure()), since it never reached its `[EVIDENCE]` line.
   */
  evidence: string;
  /** Failed steps only: the last `[STEP]` line logged before the failure — "what it was doing / last thing that worked". */
  lastAction?: string;
  /** Failed steps only: the first few lines of the raw error, for whoever needs to dig in. */
  rawError?: string;
}

/** One executed test, flattened out of the JSON reporter's file/describe-block nesting. */
export interface SpecOutcome {
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  durationMs: number;
  /**
   * True when the failure's own console output carries one of
   * testWithCrashLogging's tags ([PAGE CRASHED], [PAGE ERROR], [CONSOLE ERROR],
   * [HTTP 5xx], [REQUEST FAILED]) — i.e. a real, diagnosable cause, as opposed
   * to the shared server's known silent rejections (README: "Transient
   * server-side flakiness"). [STEP FAILED] is deliberately NOT one of these:
   * it's a page object's own "the expected result didn't show up" marker
   * (see e.g. QuotationPage.createAndGetQuotationId), not evidence of why —
   * its own message says to check the tags above it for the actual cause. A
   * bare [STEP FAILED] with none of those tags alongside it is exactly the
   * shared-server flakiness case, so it must NOT count as diagnosed.
   */
  hasDiagnosedCause: boolean;
  errorMessage?: string;
  /** Failed specs only: plain-English version of errorMessage — see explainFailure(). */
  reason?: string;
  /** Failed specs only: the last `[STEP]` line logged before the failure. */
  lastAction?: string;
  /** Present only for a spec whose test body used test.step() — see StepOutcome. */
  steps?: StepOutcome[];
}

const DIAGNOSED_CAUSE_PATTERN = /\[(PAGE CRASHED|PAGE ERROR|CONSOLE ERROR|HTTP 5\d\d|REQUEST FAILED)\]/;

// This legacy app logs a handful of tagged lines on essentially every page
// load or action, regardless of whether that test passes or fails — left in
// DIAGNOSED_CAUSE_PATTERN's search text, they'd make nearly every failure
// look "diagnosed" and defeat the point of the check. Confirmed benign via
// live testing on 2026-08-26 (seen in both passing and failing runs).
const KNOWN_BENIGN_NOISE_PATTERNS = [
  // Every page load requests a datepicker .js file with a stylesheet <link>,
  // so Chrome logs this MIME-type mismatch constantly — unrelated to outcome.
  /\[CONSOLE ERROR\][^\n]*bootstrap-datepicker[^\n]*MIME type[^\n]*/g,
  // TinyMCE throws this on load; seen in successful Rental Agreement
  // creations too, so it's pre-existing app noise, not a regression signal.
  /\[PAGE ERROR\][^\n]*r is not a constructor[^\n]*/g,
  // Fires on every load of the CRM Create Customer page — confirmed live
  // (2 Sep 2026) present in both passing and failing runs of that spec, so
  // left unfiltered it would make every failure there look "diagnosed" and
  // defeat the silent-retry heuristic for a suite that's otherwise exactly
  // the kind of intermittent-flake case that heuristic exists for.
  /\[PAGE ERROR\][^\n]*Cannot set properties of undefined \(setting 'newInputEl'\)[^\n]*/g,
  // A [STEP FAILED] line's own text (e.g. QuotationPage.createAndGetQuotationId)
  // names the other tags as a hint to a human reader ("check the [PAGE ERROR] /
  // [HTTP 5xx] / [CONSOLE ERROR] / [REQUEST FAILED] lines above this") — those
  // tag names would otherwise match DIAGNOSED_CAUSE_PATTERN even when none of
  // those events actually fired. Real occurrences of those tags are always
  // emitted as their own separate line by a separate listener, so stripping
  // the whole [STEP FAILED] line here never hides a genuine one.
  /\[STEP FAILED\][^\n]*/g,
];

function withoutKnownBenignNoise(text: string): string {
  return KNOWN_BENIGN_NOISE_PATTERNS.reduce((cleaned, pattern) => cleaned.replace(pattern, ''), text);
}

function stdioText(entries: JSONReportTestResult['stdout']): string {
  return entries.map((entry) => ('text' in entry ? entry.text : '')).join('');
}

const EVIDENCE_LINE_PATTERN = /^\[EVIDENCE\] (.+)$/;
// Markers logged by fixtures/sanityStep.ts.
const SECTION_LINE_PATTERN = /^\[SECTION\] (.+)$/;
const PLAN_LINE_PATTERN = /^\[PLAN\] (.+)$/;
const STEP_LINE_PATTERN = /^\[STEP\] (.+)$/;

function toLines(text: string): string[] {
  return text.split('\n').map((line) => line.trimEnd());
}

/** First line of a thrown error's message, with Playwright's own "Error: " prefix dropped — the rest is a stack/code frame, not useful as a one-line table cell. */
function firstErrorLine(message: string): string {
  return message.split('\n')[0].trim().replace(/^Error:\s*/, '');
}

/** The first few non-blank lines of an error — enough to recognise it, without Playwright's full call log. */
function shortRawError(message: string): string {
  return toLines(message)
    .filter((line) => line.trim() !== '')
    .slice(0, 6)
    .join('\n');
}

function asSeconds(ms: string): string {
  return `${Math.round(Number(ms) / 1000)}s`;
}

const ACTION_VERBS: Record<string, string> = {
  click: 'click',
  fill: 'type into',
  check: 'tick',
  selectOption: 'choose an option in',
  hover: 'hover over',
};

/**
 * Turns a Playwright error into one sentence a non-coder can act on, e.g.
 * `Couldn't click "4. Pay" — popup #RACreateMessageModal stayed on top of it
 * for 15s.` Anything it doesn't recognise falls back to the error's own first
 * line, so it only ever rephrases — never hides — what went wrong.
 */
export function explainFailure(rawMessage: string): string {
  const message = stripAnsi(rawMessage);
  const first = firstErrorLine(message);
  const timeoutMs = first.match(/Timeout (\d+)ms/)?.[1] ?? message.match(/Timed out (\d+)ms/)?.[1];
  const within = timeoutMs ? ` within ${asSeconds(timeoutMs)}` : '';

  const testTimeout = first.match(/^Test timeout of (\d+)ms exceeded/);
  if (testTimeout) return `The whole test ran out of time (${Math.round(Number(testTimeout[1]) / 60_000)} min limit).`;

  const locatorAction = first.match(/^(?:TimeoutError: )?locator\.(\w+): Timeout/);
  if (locatorAction) {
    const verb = ACTION_VERBS[locatorAction[1]] ?? locatorAction[1];
    // e.g. `locator resolved to <a href="#tab4" ...>4. Pay</a>` or `<input ... value="New Board RA" .../>`
    const resolved = message.match(/locator resolved to (<[^\n]*)/)?.[1];
    const label =
      resolved?.match(/>([^<…\n]+)</)?.[1]?.trim() ||
      resolved?.match(/value="([^"]+)"/)?.[1] ||
      message.match(/waiting for (\S+\(.+?\))\s*$/m)?.[1] ||
      'the element';
    const blockerLine = message.split('\n').find((line) => /intercepts pointer events/.test(line) && /id="[^"]+"/.test(line));
    const blockerId = blockerLine?.match(/id="([^"]+)"/)?.[1];
    const forHowLong = timeoutMs ? ` for ${asSeconds(timeoutMs)}` : '';
    if (blockerId) return `Couldn't ${verb} "${label}" — popup #${blockerId} stayed on top of it${forHowLong}.`;
    if (/intercepts pointer events/.test(message)) return `Couldn't ${verb} "${label}" — something else on the page kept covering it${forHowLong}.`;
    if (!resolved) return `Couldn't ${verb} "${label}" — it never appeared on the page${within}.`;
    if (!/element is visible/.test(message)) return `Couldn't ${verb} "${label}" — it never became visible${within}.`;
    return `Couldn't ${verb} "${label}"${within}.`;
  }

  if (/waitForLoadState: Timeout/.test(first)) return `A page didn't finish loading${within || ' in time'}.`;
  if (/waitForEvent: Timeout/.test(first) && /"popup"|popup/.test(message)) return `The expected new tab/popup never opened${within}.`;
  if (/waitForEvent: Timeout/.test(first) && /download/.test(message)) return `The expected file download never started${within}.`;

  const expectCall = message.match(/expect\((page|locator)\)\.(\w+)\(/);
  if (expectCall) {
    const [, subject, matcher] = expectCall;
    if (matcher === 'toHaveURL') {
      const expected = message.match(/Expected (?:pattern|string): (.+)/)?.[1]?.trim();
      const received = message.match(/Received string:\s+"?([^"\n]+)"?/)?.[1]?.trim();
      const detail = [expected && `expected ${expected}`, received && `stayed on ${received}`].filter(Boolean).join(', ');
      return `The app didn't go to the expected page${within}${detail ? ` (${detail})` : ''}.`;
    }
    const target = message.match(/Locator: (.+)/)?.[1]?.trim() ?? subject;
    if (matcher === 'toBeVisible') return `Expected ${target} to appear, but it didn't${within}.`;
    if (matcher === 'toBeHidden') return `Expected ${target} to close, but it stayed open${within}.`;
    if (matcher === 'toContainText' || matcher === 'toHaveText') return `${target} didn't show the expected text${within}.`;
  }

  if (/Target page, context or browser has been closed/.test(first)) return 'The browser window closed unexpectedly mid-step.';
  return first;
}

/** Log lines grouped under the `[SECTION]` marker that preceded them. */
function splitBySection(lines: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of lines) {
    const title = line.match(SECTION_LINE_PATTERN)?.[1];
    if (title) {
      current = [];
      sections.set(title, current);
    } else {
      current?.push(line);
    }
  }
  return sections;
}

function lastStepLine(lines: string[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const step = lines[i].match(STEP_LINE_PATTERN)?.[1];
    if (step) return step;
  }
  return undefined;
}

function plannedSteps(lines: string[]): string[] {
  for (const line of lines) {
    const plan = line.match(PLAN_LINE_PATTERN)?.[1];
    if (!plan) continue;
    try {
      const parsed: unknown = JSON.parse(plan);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Malformed plan line — unreached steps just won't be listed.
    }
  }
  return [];
}

/**
 * Builds one row per top-level test.step() call for a spec that used them —
 * undefined for every other spec (steps is empty/absent for a plain test()).
 * Confirmed live (23 Sep 2026): Playwright's JSON reporter only lists
 * explicit test.step() calls here, not fixture/hook setup, so no "Before
 * Hooks" entry ever needs filtering out.
 *
 * Log lines are attributed to a step via the `[SECTION]` marker
 * fixtures/sanityStep.ts logs as it starts. Without one (a spec still using
 * bare test.step()), a passed step falls back to being zipped, in order,
 * against the `[EVIDENCE]` lines — each passing step logs exactly one as its
 * very last line, and a step that throws never reaches it, so the queue
 * never desyncs. Steps listed in a `[PLAN]` line but never reported (an
 * earlier step failed first) are appended as "not run".
 */
function buildStepOutcomes(
  steps: JSONReportTestStep[] | undefined,
  stdout: string,
  testErrorMessage: string | undefined,
): StepOutcome[] | undefined {
  if (!steps || steps.length === 0) return undefined;

  const lines = toLines(stdout);
  const sections = splitBySection(lines);
  const evidenceIn = (someLines: string[]) =>
    someLines.map((line) => line.match(EVIDENCE_LINE_PATTERN)?.[1]).filter((line): line is string => Boolean(line));
  const evidenceQueue = evidenceIn(lines);

  let nextEvidenceIndex = 0;
  const outcomes: StepOutcome[] = steps.map((step) => {
    const sectionLines = sections.get(step.title);
    if (!step.error) {
      const evidence = sectionLines ? (evidenceIn(sectionLines).at(-1) ?? '') : (evidenceQueue[nextEvidenceIndex++] ?? '');
      return { title: step.title, passed: true, durationMs: step.duration, evidence };
    }
    const errorMessage = stripAnsi(step.error.message ?? 'Step failed.');
    return {
      title: step.title,
      passed: false,
      durationMs: step.duration,
      evidence: explainFailure(errorMessage),
      lastAction: lastStepLine(sectionLines ?? lines),
      rawError: shortRawError(errorMessage),
    };
  });

  // Confirmed live (5 Oct 2026, Fine Creation under Operator): when the whole
  // test hits its timeout, Playwright's JSON can drop steps that had already
  // finished from result.steps — all five logged [EVIDENCE], only two were
  // reported. So for a planned-but-unreported step, the log is the fallback:
  // its own [EVIDENCE] line means it passed; a [SECTION] with no evidence
  // means it was cut off mid-way; no [SECTION] at all means it never started.
  const reported = new Set(outcomes.map((outcome) => outcome.title));
  for (const title of plannedSteps(lines)) {
    if (reported.has(title)) continue;
    const sectionLines = sections.get(title);
    const evidence = sectionLines && evidenceIn(sectionLines).at(-1);
    if (evidence) {
      outcomes.push({ title, passed: true, durationMs: 0, evidence });
    } else if (sectionLines) {
      outcomes.push({
        title,
        passed: false,
        durationMs: 0,
        evidence: testErrorMessage ? explainFailure(testErrorMessage) : 'Stopped before this step finished.',
        lastAction: lastStepLine(sectionLines),
      });
    } else {
      outcomes.push({ title, passed: false, notRun: true, durationMs: 0, evidence: 'Not run — an earlier step failed first.' });
    }
  }

  // Every step passed but the test itself still failed (e.g. it ran out of
  // time right after the last step, or in teardown) — say so in the table
  // rather than show an all-green table under a FAIL badge.
  if (testErrorMessage && outcomes.every((outcome) => outcome.passed)) {
    outcomes.push({
      title: 'Test finished cleanly',
      passed: false,
      durationMs: 0,
      evidence: `${explainFailure(testErrorMessage)} (every step above did complete)`,
      rawError: shortRawError(testErrorMessage),
    });
  }
  return outcomes;
}

function flattenSuite(suite: JSONReportSuite): SpecOutcome[] {
  const outcomes: SpecOutcome[] = [];

  for (const spec of suite.specs) {
    // One test per spec here (we always run a single project), so the last
    // test/result is also the only one — "last" just guards against a future
    // config change (e.g. CI retries) silently reading a stale first attempt.
    const test = spec.tests[spec.tests.length - 1];
    const result = test.results[test.results.length - 1];
    // Playwright hardcodes color for its own worker subprocesses regardless of
    // this tool's env vars (see automation/ansi.mts), so strip it here rather
    // than trust the source to already be plain text.
    const errorMessage = result.error?.message ? stripAnsi(result.error.message) : undefined;
    const rawOutput = stripAnsi(stdioText(result.stdout) + stdioText(result.stderr)) + (errorMessage ?? '');
    const combinedOutput = withoutKnownBenignNoise(rawOutput);

    outcomes.push({
      title: spec.title,
      file: suite.file,
      // Undefined only happens for a result that never reached a determinable
      // end state (e.g. interrupted mid-run) — treat that as a failure rather
      // than silently counting it as a pass.
      status: result.status ?? 'failed',
      durationMs: result.duration,
      hasDiagnosedCause: DIAGNOSED_CAUSE_PATTERN.test(combinedOutput),
      errorMessage,
      reason: errorMessage ? explainFailure(errorMessage) : undefined,
      lastAction: errorMessage ? lastStepLine(toLines(stripAnsi(stdioText(result.stdout)))) : undefined,
      steps: buildStepOutcomes(result.steps, stripAnsi(stdioText(result.stdout)), errorMessage),
    });
  }

  for (const nested of suite.suites ?? []) outcomes.push(...flattenSuite(nested));
  return outcomes;
}

export function flattenReport(report: JSONReport): SpecOutcome[] {
  return report.suites.flatMap(flattenSuite);
}
