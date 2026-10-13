import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

function toDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Writes a date-picker-bound field's value directly and dispatches
 * input/change — not `.fill()` — same reasoning as
 * RentalAgreementPage.closeMovement()'s `returnDateInput`: `.fill()` focuses
 * the field first, which (being bound to bootstrap-datepicker here too, same
 * `date-picker` class) can pop the calendar widget open, and a later click
 * elsewhere can then commit whatever day it happens to have highlighted
 * instead of the value just written.
 */
async function setDateField(locator: Locator, date: Date) {
  await setPickerFieldValue(locator, toDateString(date));
}

/** HH:mm — the format `#infractionTime`'s bootstrap-timepicker (`timepicker-no-seconds`) holds. */
function toTimeString(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

/**
 * Same direct-write approach as setDateField(), for the timepicker-bound
 * Infraction Time field — `.fill()` would focus it and pop the timepicker
 * widget open, same risk as the date-picker one.
 */
async function setTimeField(locator: Locator, date: Date) {
  await setPickerFieldValue(locator, toTimeString(date));
}

async function setPickerFieldValue(locator: Locator, value: string) {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Thrown by search() when no vehicle matches the given plate. */
export class NoVehicleMatchError extends Error {}

/**
 * The "Create Fine" flow (`/MyRentWeb/MRFine/create`) reached via
 * `FineListPage.clickNewFine()`. Two phases on one page:
 *
 * 1. Search Filters (Infraction Date/Time, Vehicle, Type) — search() fills
 *    these and clicks Search, which replaces the page below with...
 * 2. ...a form of its own, two tabs: "General" (read-only, auto-filled from
 *    the matched vehicle/rental — Rent Agreement, Customer, etc.) and
 *    "Infraction details" (fillInfractionDetails()), which is where this
 *    fine's actual data goes.
 */
export class FinePage extends BasePage {
  readonly infractionDateInput: Locator;
  readonly infractionTimeInput: Locator;
  readonly vehicleSearchInput: Locator;
  readonly vehicleSelect: Locator;
  /** A `<div class="btn btn-success ...">`, not a `<button>` — same non-button pattern used throughout MyRent. */
  readonly searchButton: Locator;
  readonly generalTabLink: Locator;
  readonly infractionDetailsTabLink: Locator;
  readonly protocolNumberInput: Locator;
  readonly minutesNumberInput: Locator;
  readonly emissionDateInput: Locator;
  readonly fineOrgSearchInput: Locator;
  readonly fineOrgSelect: Locator;
  readonly notificationDateInput: Locator;
  readonly violatedLawInput: Locator;
  readonly expirationDateInput: Locator;
  readonly pointsDeletedInput: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    super(page);
    this.infractionDateInput = page.locator('#infractionDate');
    this.infractionTimeInput = page.locator('#infractionTime');
    this.vehicleSearchInput = page.locator('#inputValVehicle');
    this.vehicleSelect = page.locator('#vehicle');
    this.searchButton = page.locator('#searchVehicleMovement');
    this.generalTabLink = page.locator('a[href="#tab_1_1"]');
    this.infractionDetailsTabLink = page.locator('a[href="#tab_1_2"]');
    this.protocolNumberInput = page.locator('#protocolNumber');
    this.minutesNumberInput = page.locator('#minutesNumber');
    this.emissionDateInput = page.locator('#munutesEmissionDate');
    this.fineOrgSearchInput = page.locator('#fineAuthoritySearch');
    this.fineOrgSelect = page.locator('#fineOrg');
    this.notificationDateInput = page.locator('#minutesNotificationDate');
    this.violatedLawInput = page.locator('#articoloViolato');
    this.expirationDateInput = page.locator('#expirationDate');
    this.pointsDeletedInput = page.locator('#punti');
    this.createButton = page.locator('input[type="submit"]');
  }

  /**
   * Fills the Search Filters (Infraction Date + Vehicle plate) and clicks
   * Search — this is what actually loads the create form below. Type is
   * left at its default (auto-resolves to NOLEGGIO once a vehicle currently
   * out on a rental is picked; confirmed live).
   *
   * Infraction Time is set from `infractionDate`'s own time of day, not left
   * at its default (the current time): the date alone isn't enough — on the
   * rental's pickup day a fine only matches after the pickup time (e.g. a
   * 11:38 pickup rejected an 08:42 default with "Please enter valid vehicle
   * and date"; confirmed live, 6 Oct 2026).
   *
   * Vehicle plate search fires an AJAX lookup (`getVehicleSearch`) on blur,
   * not on every keystroke — real focus loss (`.blur()`), not a synthetic
   * DOM event, confirmed live as the only thing that actually triggers it.
   * Assumes the plate matches exactly one vehicle (true for any plate read
   * off a real rental — plates are unique) and throws NoVehicleMatchError
   * otherwise, since selectOption({index:1}) on an empty/placeholder-only
   * select would otherwise fail with a much less obvious error.
   */
  async search(plate: string, infractionDate: Date) {
    await setDateField(this.infractionDateInput, infractionDate);
    await setTimeField(this.infractionTimeInput, infractionDate);

    await this.vehicleSearchInput.fill(plate);
    await Promise.all([
      this.page.waitForResponse((res) => res.url().includes('getVehicleSearch'), { timeout: 10_000 }),
      this.vehicleSearchInput.blur(),
    ]);

    const optionCount = await this.vehicleSelect.locator('option').count();
    if (optionCount < 2) {
      throw new NoVehicleMatchError(`No vehicle found for plate "${plate}" via getVehicleSearch.`);
    }
    // Real plates are unique — the search reliably narrows to exactly one
    // real option past the "Select One..." placeholder.
    await this.vehicleSelect.selectOption({ index: 1 });

    console.log(
      `[STEP] Searching Fine creation for plate "${plate}" on ${toDateString(infractionDate)} ${toTimeString(infractionDate)}`,
    );
    await this.searchButton.click();
    await expect(this.infractionDetailsTabLink).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Fills "2. Infraction details" and submits. Minutes Number is read back
   * from the already-populated, read-only Protocol Number field rather than
   * taking it as a parameter — the two are meant to match (user request, 15
   * Sep 2026), and Protocol Number is assigned by the server at search()
   * time, not something a caller could know in advance.
   *
   * Selecting a Fine Org auto-fills Issuer Authority Name/City/Address from
   * that organization's own record — confirmed live — which is why this
   * method doesn't set those itself despite them being required (`*`) fields.
   */
  async fillInfractionDetails(params: {
    emissionDate: Date;
    fineOrgSearchTerm: string;
    notificationDate: Date;
    violatedLaw: string;
    expirationDate: Date;
    pointsDeleted: number;
  }) {
    await this.infractionDetailsTabLink.click();

    const protocolNumber = await this.protocolNumberInput.inputValue();
    await this.minutesNumberInput.fill(protocolNumber);
    await setDateField(this.emissionDateInput, params.emissionDate);

    await this.fineOrgSearchInput.fill(params.fineOrgSearchTerm);
    await Promise.all([
      this.page.waitForResponse((res) => res.url().includes('getFineOrgList'), { timeout: 10_000 }),
      this.fineOrgSearchInput.blur(),
    ]);
    // Selecting an org auto-fills Issuer Authority Name/City/Address from its
    // own record — confirmed live — so the field's own onchange handler needs
    // a moment to run before the caller (create()) reads/submits those.
    await this.fineOrgSelect.selectOption({ index: 1 });

    await setDateField(this.notificationDateInput, params.notificationDate);
    await this.violatedLawInput.fill(params.violatedLaw);
    await setDateField(this.expirationDateInput, params.expirationDate);
    await this.pointsDeletedInput.fill(String(params.pointsDeleted));
  }

  /**
   * Clicks "create" and reports what actually happened rather than assuming
   * success — a "crash" here (per the original request) isn't necessarily a
   * browser/page crash: it can just as easily be the create failing to
   * navigate to a "show" page at all (validation, a server error, or a real
   * JS crash), so this checks the authoritative signal (URL) and, if that
   * never lands, reports whatever diagnosable state is on screen instead of
   * throwing something generic.
   */
  async create(): Promise<{ created: true; fineId: string } | { created: false; error: string }> {
    console.log(`[STEP] Clicking "create" on ${this.page.url()}`);
    await this.createButton.click();

    try {
      await expect(this.page).toHaveURL(/\/MRFine\/show\/\d+/, { timeout: 15_000 });
      const fineId = this.page.url().match(/\/MRFine\/show\/(\d+)/)?.[1] ?? '';
      console.log(`[STEP] Fine created successfully: id ${fineId}`);
      return { created: true, fineId };
    } catch {
      // Still on the create form — MyRent shows validation feedback inline
      // rather than a single summary banner, so collect whatever's visibly
      // flagged (red help-block/has-error text) instead of asserting on one
      // specific element.
      const errorTexts = await this.page
        .locator('.has-error .help-block, .alert-danger, .form-control.error')
        .allInnerTexts();
      const error = errorTexts.filter((t) => t.trim()).join(' | ') || `Did not navigate to a Fine "show" page. Current URL: ${this.page.url()}`;
      console.error(`[STEP FAILED] Fine was not created — ${error}`);
      return { created: false, error };
    }
  }
}
