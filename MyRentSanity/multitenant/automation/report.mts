import type { SpecOutcome } from './jsonReport.mts';
import { attemptPassed, type SuiteRunResult } from './playwrightRunner.mts';

function suitePassed(result: SuiteRunResult): boolean {
  return attemptPassed(result.finalAttempt);
}

function statusLabel(status: SpecOutcome['status']): string {
  return status === 'passed' ? 'PASS' : status === 'skipped' ? 'SKIP' : 'FAIL';
}

/** Human-readable, terminal-friendly summary — the tool's primary output. */
export function toConsoleSummary(results: SuiteRunResult[]): string {
  const lines: string[] = ['', '=== MyRent Sanity Suite Summary ==='];

  for (const result of results) {
    const { suite, attempts, finalAttempt } = result;
    lines.push('', `${statusLabel(suitePassed(result) ? 'passed' : 'failed')}  ${suite.title}  (${suite.testDir})`);
    if (attempts.length > 1) lines.push(`  ran ${attempts.length} times against this shared environment — showing the final attempt`);

    for (const spec of finalAttempt.specs) {
      const seconds = (spec.durationMs / 1000).toFixed(1);
      lines.push(`  [${statusLabel(spec.status)}] ${spec.title} (${seconds}s)`);
      if (spec.status !== 'passed' && spec.status !== 'skipped') {
        const cause = spec.hasDiagnosedCause
          ? 'diagnosed — see the tagged line above'
          : 'undiagnosed — see README "Transient server-side flakiness"';
        lines.push(`         cause: ${cause}`);
        if (spec.reason) lines.push(`         ${spec.reason}`);
        if (spec.lastAction) lines.push(`         last thing it did: ${spec.lastAction}`);
      }
      for (const step of spec.steps ?? []) {
        const mark = step.passed ? 'PASS' : step.notRun ? 'NOT RUN' : 'FAIL';
        lines.push(`    ${mark.padEnd(7)} ${step.title}${step.notRun ? '' : ` — ${step.evidence}`}`);
      }
    }
  }

  const overallPassed = results.every(suitePassed);
  lines.push('', `Overall: ${overallPassed ? 'PASS' : 'FAIL'}`, '');
  return lines.join('\n');
}

/** Structured shape for --json output — one record per suite, final-attempt specs only. */
export function toJsonSummary(results: SuiteRunResult[]) {
  return results.map(({ suite, attempts, finalAttempt }) => ({
    id: suite.id,
    title: suite.title,
    testDir: suite.testDir,
    attempts: attempts.length,
    passed: attemptPassed(finalAttempt),
    specs: finalAttempt.specs,
  }));
}
