// Playwright hardcodes FORCE_COLOR=1 for its own worker subprocesses
// (see playwright/lib/runner/index.js), so captured stdout/stderr and
// error.message strings carry raw ANSI escapes no matter what color-related
// env vars this tool sets on the outer `playwright test` process. Stripping
// them here is the only reliable fix - used for the live log stream (raw
// escapes would render as literal escape bytes in a plain <pre> or terminal)
// and for the text jsonReport.mts pattern-matches for diagnosed-cause tags.
//
// Built from String.fromCharCode rather than a regex literal containing a
// raw escape byte, so this source file stays plain, unambiguous text.
const ESCAPE_CHAR = String.fromCharCode(27);
// Matches SGR color/style sequences (ESCAPE_CHAR + "[" + digits/semicolons + "m") -
// the only kind of ANSI escape Playwright's own reporters emit.
const SGR_ESCAPE_PATTERN = new RegExp(ESCAPE_CHAR + '\\[[0-9;]*m', 'g');

export function stripAnsi(text: string): string {
  return text.replace(SGR_ESCAPE_PATTERN, '');
}
