import { test } from './testWithCrashLogging';

/**
 * Markers the Sanity dashboard reads out of the live log to build its
 * per-step results table (see automation/jsonReport.mts and
 * automation/public/index.html):
 * - `[PLAN] ["a","b",...]` — every step this test intends to run, logged
 *   once up front, so steps never reached (because an earlier one failed)
 *   still show up in the table as "Not run" instead of silently vanishing.
 * - `[SECTION] <title>` — logged as each step starts; the dashboard shows it
 *   as a highlighted header in the live log, and uses it to tell which log
 *   lines (and which `[EVIDENCE]` line) belong to which step.
 */
export function planSteps(titles: readonly string[]): void {
  console.log(`[PLAN] ${JSON.stringify(titles)}`);
}

/** `test.step()` plus the `[SECTION]` marker above. */
export function sanityStep<T>(title: string, body: () => Promise<T>): Promise<T> {
  return test.step(title, async () => {
    console.log(`[SECTION] ${title}`);
    return body();
  });
}
