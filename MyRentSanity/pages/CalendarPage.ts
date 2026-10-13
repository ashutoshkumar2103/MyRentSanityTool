import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { formatDate, optionLabel } from '../utils/instances';
import { formatLike, sameDay } from '../utils/dates';
import { selectOptionArg } from '../utils/formHelpers';
import { CALENDAR_CAR_CLASS, RA_LOCATION } from '../utils/testData';

/**
 * The Calendar Planning grid (/MyRentWeb/MRVehicle/planningCalander). Each
 * vehicle row has one cell per day; a cell carrying class `avalableVehicle`
 * (green) looks free, but that's a display hint, not a guarantee — clicking
 * it opens a modal whose "Printed Note" states the real, server-checked
 * availability. See openAvailableVehicleModalForToday().
 */
export class CalendarPage extends BasePage {
  readonly vehicleTable: Locator;
  readonly modal: Locator;
  readonly modalNote: Locator;
  readonly closeModalButton: Locator;
  readonly quotationButton: Locator;
  readonly reservationButton: Locator;
  readonly rentalAgreementButton: Locator;
  readonly availabilityConfirmYesButton: Locator;
  readonly carClassFilterSelect: Locator;
  readonly locationFilterSelect: Locator;
  /**
   * The actual filter-apply control — a styled `<div>`, not a real
   * button/link/input, confirmed live via its class
   * ("btn btn-success btn-dark-submit"). Selecting the two filters above
   * does nothing on its own (no onchange handlers on either select) until
   * this is clicked — confirmed live (3 Sep 2026, after the user pointed out
   * a screenshot of the real filtered table) that Car Class + Location +
   * this click together correctly narrow the grid ("Total vehicle 10",
   * matching the real fleet exactly). An earlier attempt at this filter
   * (selecting the dropdowns alone, no click) looked broken purely because
   * this click was missing.
   */
  readonly applyFilterButton: Locator;

  constructor(page: Page) {
    super(page);
    this.vehicleTable = page.locator('#vehicleDetails');
    this.modal = page.locator('#raModal');
    this.modalNote = this.modal.locator('.modal-body');
    this.closeModalButton = page.locator('#clear');
    this.quotationButton = page.locator('#createPreventivi');
    this.reservationButton = page.locator('#createReservation');
    this.rentalAgreementButton = page.locator('#createRentalAgreement1');
    // "Vehicle will be available at <location> on <date>. Do you want to
    // continue?" — shown by Reservation (and sometimes Rental Agreement),
    // never by Quotation.
    this.availabilityConfirmYesButton = page.locator('#confirmMessageContainer').getByRole('button', { name: 'Yes' });
    this.carClassFilterSelect = page.locator('#carClass');
    this.locationFilterSelect = page.locator('#locations');
    this.applyFilterButton = page.locator('div.btn-dark-submit', { hasText: 'Search' });
  }

  /**
   * Restricts the grid to the instance's Rental Agreement Car Class at its RA
   * Location (CDAV at PMO on testee) — Rental Agreement only (user request,
   * 2-3 Sep 2026), instead of scanning the whole ~90-row fleet. Confirmed
   * live on testee this leaves 8 of the class's 10 PMO vehicles showing as
   * available for today, matching the user's own manual count exactly ("all
   * except 2").
   */
  async filterToRentalAgreementClassAndLocation() {
    console.log(`[STEP] Filtering the Calendar to "${optionLabel(CALENDAR_CAR_CLASS)}" at "${optionLabel(RA_LOCATION)}"`);
    await this.carClassFilterSelect.selectOption(selectOptionArg(CALENDAR_CAR_CLASS));
    await this.locationFilterSelect.selectOption(selectOptionArg(RA_LOCATION));
    await this.applyFilterButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  private async availableLookingCellsForToday(): Promise<Locator> {
    return this.availableLookingCellsForDay(new Date());
  }

  /**
   * Clicks one cell and waits for its modal to open — retried a couple of
   * times: confirmed live this can otherwise leave `#raModal` stuck hidden
   * (a real failure seen in practice, not hypothetical), most likely because
   * the grid's own state from a just-closed previous modal hadn't fully
   * settled yet.
   */
  private async clickCellAndOpenModal(cell: Locator): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      // The grid's mousedown handler adds a "highlighted" class to the
      // clicked cell, and mouseup counts ALL currently-highlighted cells
      // (page-wide) to decide what to do — a leftover highlight from a
      // previous attempt bumps that count and changes which code path runs.
      // Clear it defensively before every attempt.
      await this.page.evaluate(() => document.querySelectorAll('.highlighted').forEach((el) => el.classList.remove('highlighted')));
      // The grid opens the modal on a mousedown+mouseup pair (a drag-select
      // gesture, not a plain click), delegated via jQuery. It also has
      // sticky/frozen columns (Inventory, Winter Tyre) that physically sit on
      // top of far-right day columns at the real pixel coordinates Playwright
      // would click at — even force:true can't help there, since the browser's
      // own hit-testing (not Playwright's) decides which element receives a
      // coordinate-based event. Dispatching the events directly on the DOM
      // node sidesteps both problems.
      await cell.evaluate((el) => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
      try {
        await expect(this.modal).toBeVisible({ timeout: 5_000 });
        return;
      } catch {
        console.log(`[STEP] Attempt ${attempt}/3 to open the vehicle modal didn't take — retrying`);
      }
    }
    throw new Error('Could not open the vehicle modal after 3 attempts.');
  }

  /**
   * Clicks the first available-looking cell for today and opens its modal —
   * no retry across candidates, no check of whether it's genuinely
   * available. Quotation and Reservation don't need a genuinely available
   * vehicle to be created (user request, 2 Sep 2026 — Quotation is already
   * documented elsewhere as "only an estimate" that can be created against a
   * vehicle that isn't actually free); only Rental Agreement does, via
   * openAvailableVehicleModalForToday() below.
   */
  async openFirstLookingAvailableCellForToday(): Promise<string> {
    const cells = await this.availableLookingCellsForToday();
    await expect(cells.first()).toBeAttached();
    const cell = cells.first();
    const vehicle = (await cell.getAttribute('vehicle')) ?? '(unknown vehicle)';
    await this.clickCellAndOpenModal(cell);
    console.log(`[STEP] Using vehicle ${vehicle} — no availability check needed for this entity`);
    return vehicle;
  }

  /**
   * Clicks an available-looking cell for today and opens its modal. If the
   * "Printed Note" says the vehicle isn't actually available (real shared
   * test data — the green styling isn't a guarantee), closes the modal and
   * tries the next one, up to maxAttempts. Callers wanting a restricted pool
   * (e.g. Rental Agreement's CDAV-at-PMO) should call filterToRentalAgreementClassAndLocation()
   * first — this method just scans whatever's currently in the grid.
   *
   * @param startIndex Skip this many available-looking cells before trying —
   *   used to resume past vehicles a caller already tried and rejected for
   *   reasons this method can't see itself (e.g. Rental Agreement's
   *   affiliate-mismatch check, which only happens after leaving this page).
   * @returns the cell index and the vehicle's own `vehicle` attribute (e.g.
   *   "XXXX1299-BMW-STELVIO") that succeeded. The index alone isn't a stable
   *   identifier — row order and per-vehicle availability shift over time in
   *   this shared environment — so callers that need to report *which*
   *   vehicle was used (e.g. in an error message) should log the name, not
   *   just the index.
   */
  async openAvailableVehicleModalForToday(startIndex = 0, maxAttempts = 20): Promise<{ cellIndex: number; vehicle: string }> {
    const cells = await this.availableLookingCellsForToday();
    // .count() doesn't auto-wait like Playwright's assertions — the grid is
    // ~90 vehicle rows rendered client-side, so without this the count can
    // be taken (as 0) before the table has finished populating.
    await expect(cells.first()).toBeAttached();
    const count = await cells.count();
    const lastIndex = Math.min(count, startIndex + maxAttempts);
    for (let i = startIndex; i < lastIndex; i++) {
      const cell = cells.nth(i);
      const vehicle = (await cell.getAttribute('vehicle')) ?? `(unknown vehicle at cell index ${i})`;
      await this.clickCellAndOpenModal(cell);
      const noteText = await this.modalNote.innerText();
      if (/vehicle available/i.test(noteText)) {
        console.log(`[STEP] Found an available vehicle for today: ${vehicle} (cell index ${i})`);
        return { cellIndex: i, vehicle };
      }
      console.log(`[STEP] Vehicle ${vehicle} (cell index ${i}) is not actually available today — trying the next one`);
      await this.closeModalButton.click();
      await expect(this.modal).toBeHidden();
    }
    throw new Error(`Could not find an available vehicle for today after checking cell indexes ${startIndex}..${lastIndex - 1}`);
  }

  // ---- Monthly rental (user request, 8 Oct 2026): new methods only, so the other Calendar flows are untouched ----

  /**
   * The values of the grid's `day` attribute that mean `day`, whatever spelling
   * the grid uses — rentalplustest's Calendar writes "09/10/2026" although its
   * dateFormat setting is yyyy-MM-dd (seen live 8-9 Oct 2026), and another page
   * could write "2026/10/09"; all of them are 9 Oct 2026. Waits for the grid to
   * have any day cells first, since it fills in after the page loads.
   */
  private async gridValuesForDay(day: Date): Promise<string[]> {
    await this.vehicleTable.locator('td[day]').first().waitFor({ state: 'attached', timeout: 60_000 }).catch(() => {});
    const values = await this.vehicleTable.locator('td[day]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('day') ?? ''))]);
    return values.filter((v) => sameDay(v, day));
  }

  /** `td` cells of one day that look available (an unmatchable locator when the grid has no such day). */
  private async availableLookingCellsForDay(day: Date): Promise<Locator> {
    const values = await this.gridValuesForDay(day);
    if (values.length === 0) return this.vehicleTable.locator('td.avalableVehicle[day="no-such-day"]');
    return this.vehicleTable.locator(`td.avalableVehicle:is(${values.map((v) => `[day="${v}"]`).join(',')})`);
  }

  /**
   * Shows the month `day` falls in (the grid's own Month/Year selectors) with
   * the instance's Rental Agreement Car Class and Location filters applied, then
   * waits for that day's column to be there. Month 1-12 as in the select's values.
   */
  async showMonthFilteredToRentalAgreementClassAndLocation(day: Date) {
    console.log(`[STEP] Calendar: ${formatDate(day)} — filtering to "${optionLabel(CALENDAR_CAR_CLASS)}" at "${optionLabel(RA_LOCATION)}"`);
    // The page is heavy; give its filter controls real time to appear.
    await this.applyFilterButton.waitFor({ state: 'visible', timeout: 120_000 });
    // The page can finish its own initial load after the selects were set and
    // put the current month back (seen live 8 Oct 2026: October shown although
    // September was chosen), so the choice is checked and repeated.
    for (let attempt = 1; attempt <= 4; attempt++) {
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.carClassFilterSelect.selectOption(selectOptionArg(CALENDAR_CAR_CLASS));
      await this.locationFilterSelect.selectOption(selectOptionArg(RA_LOCATION));
      await this.page.locator('#currentMonth').selectOption(String(day.getMonth() + 1));
      await this.page.locator('#year').selectOption(String(day.getFullYear()));
      await this.applyFilterButton.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      // The wanted day, in whichever spelling the grid uses.
      if (await expect.poll(async () => (await this.gridValuesForDay(day)).length, { timeout: 25_000 }).toBeGreaterThan(0).then(() => true, () => false)) {
        await this.page.waitForTimeout(2_000);
        return;
      }
      console.log(`[STEP] Calendar: the ${formatDate(day)} column did not appear (attempt ${attempt}/4) — selecting the month again`);
    }
    throw new Error(`The Calendar never showed ${formatDate(day)} after 4 attempts.`);
  }

  /**
   * Like openAvailableVehicleModalForToday(), but for the given day. Each
   * candidate's modal is checked for "Printed Note: Vehicle available" (the
   * green cell alone is not a guarantee). The modal's Pickup Start date is set
   * to `day` and its End date to `end`, and the note is read again for that
   * whole period, so a vehicle booked later inside the window is skipped too.
   * Returns the cell index and vehicle of the one left open.
   */
  async openAvailableVehicleModalForPeriod(day: Date, end: Date, startIndex = 0, maxAttempts = 40): Promise<{ cellIndex: number; vehicle: string }> {
    const cells = await this.availableLookingCellsForDay(day);
    await expect(cells.first()).toBeAttached();
    const count = await cells.count();
    const lastIndex = Math.min(count, startIndex + maxAttempts);
    const note = async () => (await this.modalNote.innerText()).replace(/\s+/g, ' ');
    for (let i = startIndex; i < lastIndex; i++) {
      const cell = cells.nth(i);
      const vehicle = (await cell.getAttribute('vehicle')) ?? `(unknown vehicle at cell index ${i})`;
      await this.clickCellAndOpenModal(cell);
      await this.page.waitForTimeout(1_000);
      await this.setModalPeriod(day, end);
      await this.page.waitForTimeout(1_500);
      if (/vehicle available/i.test(await note())) {
        console.log(`[STEP] Calendar: ${vehicle} is available ${formatDate(day)} to ${formatDate(end)} (cell index ${i})`);
        // The long period was only for the availability check: carrying it into
        // the create form made its rate calculation answer HTTP 500 (seen live
        // 8 Oct 2026, testee). The form starts from the default 1 day, as the
        // New button does, and "Enable monthly Rental" extends it afterwards.
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);
        await this.setModalPeriod(day, nextDay);
        await this.page.waitForTimeout(1_000);
        return { cellIndex: i, vehicle };
      }
      console.log(`[STEP] Calendar: ${vehicle} is not available ${formatDate(day)} to ${formatDate(end)} — trying the next one`);
      await this.closeModalButton.click();
      await expect(this.modal).toBeHidden();
    }
    throw new Error(`No vehicle was available from ${formatDate(day)} to ${formatDate(end)} (checked cell indexes ${startIndex}..${lastIndex - 1}).`);
  }

  /** Writes the modal's Pickup Start date (a read-only field) and Pickup End date. */
  private async setModalPeriod(start: Date, end: Date) {
    // The modal's dates follow the grid's spelling, not necessarily the instance's.
    const current = await this.page.locator('#raModal #startDate').inputValue().catch(() => '');
    await this.page.evaluate(
      ([s, e]) => {
        const set = (id: string, value: string) => {
          const el = document.querySelector<HTMLInputElement>(`#raModal #${id}`);
          if (!el || el.value === value) return;
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        set('startDate', s);
        set('endDate', e);
      },
      [current ? formatLike(start, current) : formatDate(start), current ? formatLike(end, current) : formatDate(end)],
    );
  }

  async clickQuotation() {
    await this.quotationButton.click();
  }

  async clickReservation() {
    await this.reservationButton.click();
    await this.confirmAvailabilityPromptIfShown();
  }

  async clickRentalAgreement() {
    await this.rentalAgreementButton.click();
    await this.confirmAvailabilityPromptIfShown();
  }

  private async confirmAvailabilityPromptIfShown() {
    try {
      await this.availabilityConfirmYesButton.waitFor({ state: 'visible', timeout: 5_000 });
      console.log('[STEP] "Vehicle will be available..." confirmation appeared — clicking Yes');
      await this.availabilityConfirmYesButton.click();
    } catch {
      // No confirmation needed.
    }
  }
}
