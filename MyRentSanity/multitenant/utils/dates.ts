/**
 * Date handling that does not care how a page spells a day: "2026-10-09",
 * "2026/10/09", "09/10/2026", "09-10-2026" and "09.10.2026" are all 9 Oct 2026.
 * Pages and instances differ (rentalplustest's Calendar writes dd/MM/yyyy while
 * its dateFormat setting says yyyy-MM-dd), so code that reads, compares or
 * writes a date goes through here instead of assuming one format.
 */

/**
 * Parses a date written as year-first (yyyy-MM-dd, yyyy/MM/dd, yyyy.MM.dd) or
 * day-first (dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy); any time after it is ignored.
 * A day-first reading is assumed unless the second number can only be a day
 * (e.g. 10/25/2026). Returns null when the text is not a real calendar date.
 */
export function parseAnyDate(text: string | null | undefined): Date | null {
  if (!text) return null;
  const s = text.trim();
  let year: number, month: number, day: number;
  const ymd = s.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})(?!\d)/);
  const dmy = s.match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})(?!\d)/);
  if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    year = Number(dmy[3]);
    if (b > 12 && a <= 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
  } else {
    return null;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** True when both texts/dates are the same calendar day, whatever their spelling. */
export function sameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  const da = typeof a === 'string' || a == null ? parseAnyDate(a) : a;
  const db = typeof b === 'string' || b == null ? parseAnyDate(b) : b;
  return !!da && !!db && da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/**
 * Writes `date` in the same style as `sample` — same order (year first or day
 * first) and same separator — so a value set on a field is spelled the way that
 * field spells its own dates.
 */
export function formatLike(date: Date, sample: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const s = sample.trim();
  const yearFirst = /^\d{4}\D/.test(s);
  const separator = (yearFirst ? s.match(/^\d{4}(\D)/) : s.match(/^\d{1,2}(\D)/))?.[1] ?? (yearFirst ? '-' : '/');
  return yearFirst ? [yyyy, mm, dd].join(separator) : [dd, mm, yyyy].join(separator);
}
