import { Locator, Page, expect } from '@playwright/test';
import { type OptionTarget, optionLabel } from './instances';

/**
 * Shared search-box interaction patterns used by the Quotation, Reservation,
 * and Rental Agreement forms. Each form uses its own field IDs (see the
 * respective page object), but all three wire their "search then pick from a
 * dropdown" fields the same two ways:
 *
 * - searchAndSelectViaBlur: typing into the box and then leaving it (blur)
 *   fires an AJAX lookup that replaces the target <select>'s options. Used
 *   for Customer/Driver on every form, and Reservation Source on Reservation
 *   and Rental Agreement.
 * - searchAndSelectViaKeystroke: typing filters an already-loaded <select>'s
 *   options live, no network round trip. Used for Pick Up/Return/Reservation
 *   Source/Payment on the Quotation form.
 */

/**
 * Playwright's own selectOption() argument for an OptionTarget — by database
 * id (`value`) when the instance profile has one, otherwise by exact label.
 * See OptionTarget in utils/instances.ts.
 */
export function selectOptionArg(option: OptionTarget): { value: string } | { label: string } {
  return typeof option === 'string' ? { label: option } : { value: option.value };
}

/** Whether `select`'s current selection is `option` — compared the same way selectOptionArg() selects it. */
async function isSelected(select: Locator, option: OptionTarget): Promise<{ ok: boolean; current: string }> {
  const current = await select.evaluate((el) => {
    const selected = (el as HTMLSelectElement).selectedOptions[0];
    return { value: selected?.value ?? '', label: selected?.label ?? '' };
  });
  const ok = typeof option === 'string' ? current.label === option : current.value === option.value;
  return { ok, current: current.label };
}

/**
 * Runs `fillOnce` (a full search-and-select cycle) up to `attempts` times,
 * judging success by reading `select`'s own current value back rather than
 * trusting that `fillOnce` merely completed — a slow/absent AJAX response can
 * leave a stale or empty selection in place even though `selectOption` itself
 * didn't throw (it's satisfied by whatever's in the DOM *right now*, not by
 * the search actually having loaded the right options yet), and re-running
 * the whole cycle (re-typing, re-waiting) is what actually recovers from
 * that, not just re-checking the same never-updated state.
 */
export async function retryFieldSelection(fillOnce: () => Promise<void>, select: Locator, option: OptionTarget, description: string) {
  const exactLabel = optionLabel(option);
  const attempts = 3;
  let lastFailure = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fillOnce();
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      console.log(`[STEP] Attempt ${attempt}/${attempts} to select "${exactLabel}" (${description}) failed — retrying: ${lastFailure}`);
      continue;
    }
    const { ok, current } = await isSelected(select, option);
    if (ok) return;
    lastFailure = `selected "${current}" instead`;
    console.log(`[STEP] Attempt ${attempt}/${attempts} to select "${exactLabel}" (${description}) didn't stick (${lastFailure}) — retrying`);
  }
  throw new Error(`Could not select "${exactLabel}" (${description}) after ${attempts} attempts: ${lastFailure}`);
}

export async function searchAndSelectViaBlur(
  page: Page,
  searchInput: Locator,
  select: Locator,
  searchTerm: string,
  option: OptionTarget,
  responseUrlPart: string,
) {
  await retryFieldSelection(
    async () => {
      await searchInput.fill(searchTerm);
      // The response listener must be registered before blur() fires the AJAX
      // request, not after — otherwise a fast response can complete before
      // waitForResponse starts listening, and it hangs until timeout.
      //
      // Matching on URL alone isn't enough: Customer and Driver1 hit the exact
      // same endpoint, so filling one field right after another can resolve this
      // wait on a stray, still-in-flight response from the OTHER field's own
      // search — the select then gets `selectOption`'d before its real response
      // has actually landed. Tying the match to this request's own POST body
      // (which carries the search pattern) makes sure it's the response to the
      // request *this* call just fired.
      await Promise.all([
        page.waitForResponse((res) => {
          if (!res.url().includes(responseUrlPart)) return false;
          const postData = res.request().postData();
          return postData ? postData.includes(searchTerm) : true;
        }, { timeout: 10_000 }),
        searchInput.blur(),
      ]);
      await select.selectOption(selectOptionArg(option), { timeout: 10_000 });
    },
    select,
    option,
    `"${searchTerm}" via ${responseUrlPart}`,
  );
}

export async function searchAndSelectViaKeystroke(searchInput: Locator, select: Locator, searchLetters: string, option: OptionTarget) {
  await retryFieldSelection(
    async () => {
      // fill('') rather than relying on a fresh element — this can run more
      // than once against the same input on a retry, and pressSequentially
      // alone would just append onto whatever's already typed there.
      await searchInput.fill('');
      await searchInput.pressSequentially(searchLetters);
      await select.selectOption(selectOptionArg(option), { timeout: 10_000 });
    },
    select,
    option,
    `"${searchLetters}"`,
  );
}

/** Bootstrap modals (`.modal`) and the app's other dialog popups (`role="dialog"`, e.g. noleggiaretest's validation messages). */
export const POPUP_SELECTOR = '.modal:visible, [role="dialog"]:visible';

/**
 * The text of whatever popup is open right now, or '' if none —
 * read when Create didn't go through, since the app reports business-rule
 * rejections that way (e.g. "Please fill missing customer data: (Driver 1)
 * e-Invoice Code or Email", confirmed live on noleggiaretest, 6 Oct 2026)
 * and the generic "never reached the show page" message otherwise hides it.
 */
export async function visibleModalText(page: Page): Promise<string> {
  const modal = page.locator(POPUP_SELECTOR).first();
  if (!(await modal.isVisible().catch(() => false))) return '';
  return ((await modal.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
}

/**
 * Logs the [STEP FAILED] line for a Create that never landed, and returns the
 * error to throw — naming the app's own popup message when one is open.
 */
export async function createFailure(page: Page, genericMessage: string, error: unknown): Promise<unknown> {
  const popup = await visibleModalText(page);
  if (popup) {
    console.error(`[STEP FAILED] Create was blocked by the app: "${popup}". Current URL: ${page.url()}`);
    return new Error(`Create was blocked by the app: "${popup}"`);
  }
  console.error(genericMessage);
  return error;
}

/**
 * "Any Payment Type will do" (InstanceProfile.data.payment === null): keeps
 * whatever real option the form already has selected, or else picks the
 * first real one. Waits for one to exist first — Rental Agreement's Payment
 * select only gets its options once Customer has been chosen.
 */
export async function selectAnyRealOption(select: Locator, description: string): Promise<void> {
  await expect
    .poll(() => select.evaluate((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value !== '')), {
      message: `${description} never got any selectable option`,
      timeout: 15_000,
    })
    .toBe(true);
  const chosen = await select.evaluate((el) => {
    const s = el as HTMLSelectElement;
    if (s.value !== '') return null;
    return Array.from(s.options).find((o) => o.value !== '')!.value;
  });
  if (chosen !== null) await select.selectOption(chosen);
  const label = await select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.label ?? '');
  console.log(`[STEP] ${description}: using "${label}"${chosen === null ? ' (already selected)' : ''}`);
}

/**
 * Selects the option immediately after a Payment Type <select>'s currently
 * chosen one (wrapping back to the first real option past the last one),
 * skipping the "Select One..." placeholder, and logs both values. Used by
 * the new-button "hover" specs' post-creation edit step, so a reviewer can
 * see the actual before/after change in the log without reopening the page.
 * Deliberately doesn't click Update itself — that button (and what else it
 * might also submit) is the caller's to know about, not this helper's.
 */
export async function logAndAdvancePaymentType(paymentSelect: Locator, entityLabel: string): Promise<{ before: string; after: string }> {
  const readSelectedText = () =>
    paymentSelect.evaluate((el) => (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.text.trim() ?? '');

  const before = await readSelectedText();
  const nextValue = await paymentSelect.evaluate((el) => {
    const select = el as HTMLSelectElement;
    const realOptions = Array.from(select.options).filter((o) => o.text.trim() !== 'Select One...');
    const currentIndex = realOptions.findIndex((o) => o.selected);
    const next = realOptions[(currentIndex + 1) % realOptions.length];
    return next.value;
  });
  await paymentSelect.selectOption(nextValue);
  const after = await readSelectedText();

  console.log(`[STEP] ${entityLabel} Payment Type before: "${before}"`);
  console.log(`[STEP] ${entityLabel} Payment Type after: "${after}"`);
  return { before, after };
}
