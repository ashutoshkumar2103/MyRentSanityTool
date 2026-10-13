import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { appUrl } from '../utils/instances';
import {
  createFailure,
  logAndAdvancePaymentType,
  retryFieldSelection,
  searchAndSelectViaBlur,
  searchAndSelectViaKeystroke,
  selectAnyRealOption,
  selectOptionArg,
} from '../utils/formHelpers';
import type { OptionTarget, SearchableOption } from '../utils/instances';

/**
 * The "Create Quotation" form (/MyRentWeb/preventivi/create).
 *
 * Field fill order matters: Car Class, Pick Up, and Return must already have a
 * value before Reservation Source is set. Its onchange handler runs
 * checkCarClass('fonte'), which blanks Reservation Source straight back out if
 * any of those three are still empty — see selectReservationSource().
 */
export class QuotationPage extends BasePage {
  readonly customerSearchInput: Locator;
  readonly customerSelect: Locator;
  readonly driver1SearchInput: Locator;
  readonly driver1Select: Locator;
  readonly carClassSelect: Locator;
  readonly pickupSearchInput: Locator;
  readonly pickupSelect: Locator;
  readonly returnSearchInput: Locator;
  readonly returnSelect: Locator;
  readonly reservationSourceSelect: Locator;
  readonly paymentSearchInput: Locator;
  readonly paymentSelect: Locator;
  readonly tariffaInput: Locator;
  readonly createButton: Locator;
  readonly paymentNotLinkedYesButton: Locator;
  readonly quotationCreatedModal: Locator;
  readonly quotationCreatedText: Locator;
  readonly quotationCreatedCloseButton: Locator;
  /**
   * On the resulting Show page (not the Create form) — submits straight into
   * a Reservation create form pre-filled from this quotation. See
   * tests/conversion/ for the full Quotation → Reservation → Rental
   * Agreement chain.
   */
  readonly convertToReservationButton: Locator;
  /**
   * Also on the Show page. Confirmed live it's already present in the DOM
   * even while the create-success modal is still open on top (creation
   * silently lands on the Show page under that modal) — two identical
   * copies exist, hence `.first()`.
   */
  readonly editLink: Locator;
  /** Shared id on both the Create and Edit forms. */
  readonly updateButton: Locator;

  constructor(page: Page) {
    super(page);
    this.customerSearchInput = page.locator('#inputValDriver');
    this.customerSelect = page.locator('#client');
    this.driver1SearchInput = page.locator('#inputValDriver1');
    this.driver1Select = page.locator('#clientiByIdCond1');
    this.carClassSelect = page.locator('#groupId');
    this.pickupSearchInput = page.locator('#pickupKey');
    this.pickupSelect = page.locator('#pickupId');
    this.returnSearchInput = page.locator('#returnKey');
    this.returnSelect = page.locator('#returnId');
    this.reservationSourceSelect = page.locator('#commissionis');
    this.paymentSearchInput = page.locator('#inputPaymentKey');
    this.paymentSelect = page.locator('#payments');
    this.tariffaInput = page.locator('#tariffa');
    this.createButton = page.locator('#create');
    this.paymentNotLinkedYesButton = page.locator('#confirmMessageModal').getByRole('button', { name: 'Yes' });
    this.quotationCreatedModal = page.locator('#quoteCreatedMessage');
    this.quotationCreatedText = page.locator('#quoteCreatedMessageCont span');
    this.quotationCreatedCloseButton = this.quotationCreatedModal.locator('.close');
    this.convertToReservationButton = page.locator('#Reservation');
    this.editLink = page.getByRole('link', { name: 'Edit' }).first();
    this.updateButton = page.locator('#update');
  }

  async open() {
    await this.goto(appUrl('/preventivi/create'));
  }

  // Customer/Driver search boxes look up matches on blur (not on keystroke), via
  // an AJAX call that replaces the target <select>'s options wholesale.
  async selectCustomer(searchTerm: string, option: OptionTarget) {
    await searchAndSelectViaBlur(this.page, this.customerSearchInput, this.customerSelect, searchTerm, option, 'getBusinessPartnerList');
  }

  async selectDriver1(searchTerm: string, option: OptionTarget) {
    await searchAndSelectViaBlur(this.page, this.driver1SearchInput, this.driver1Select, searchTerm, option, 'getBusinessPartnerList');
  }

  async selectCarClass(option: OptionTarget) {
    await this.carClassSelect.selectOption(selectOptionArg(option));
  }

  // Pick Up / Return search boxes filter the option list client-side on every
  // keystroke — no network round trip, so no extra wait is needed here.
  //
  // Pick Up specifically (not Return, which always starts on the blank
  // "Select One..." placeholder) — confirmed live (24 Sep 2026) that #pickupId
  // already comes preselected to the account's own branch office on load, in
  // BOTH roles. But the label text on that default differs by role in a way
  // that isn't ours to control: Administrator's list happens to get replaced
  // with the full multi-branch list at some point (label becomes dash-
  // separated, e.g. "PMO - PALERMO PORTO"), while Operator's stays on its
  // permanent single-branch stub (comma-separated, "PMO,PALERMO PORTO") and
  // never gets that replacement. Searching for one hardcoded label format then
  // breaks the other role. If a real option is already selected, trust it and
  // skip the search entirely instead of hunting for an exact label that may
  // not exist in this role's DOM.
  //
  // The default doesn't necessarily land *immediately* on page load — a first
  // version of this check read selectedIndex exactly once, right away, and
  // confirmed live (24 Sep 2026) that's a race: on a slower load this shared
  // environment can still have #pickupId sitting on the blank "Select One..."
  // placeholder at that exact instant, so the one-shot check wrongly
  // concluded "blank" and fell through to searching for a label that hadn't
  // populated yet either — the exact same failure this method exists to
  // avoid. Polling (via `expect(...).not.toHaveValue('')`, which retries on
  // its own) instead of sampling once gives the page's own async population a
  // real window to land before deciding there's genuinely nothing there.
  async selectPickupLocation(searchLetter: string, option: OptionTarget) {
    try {
      await expect(this.pickupSelect).not.toHaveValue('', { timeout: 8_000 });
      return;
    } catch {
      // Still blank after waiting — genuinely nothing preselected, fall
      // through to an explicit search.
    }
    await searchAndSelectViaKeystroke(this.pickupSearchInput, this.pickupSelect, searchLetter, option);
  }

  async selectReturnLocation(searchLetter: string, option: OptionTarget) {
    await searchAndSelectViaKeystroke(this.returnSearchInput, this.returnSelect, searchLetter, option);
  }

  /**
   * Deliberately doesn't type into the search box first: #commissionis comes
   * preloaded with every Reservation Source on page load (confirmed live —
   * the option is there even with the search box untouched), and typing a
   * 4+ character term here fires its keyup-bound AJAX search more than once
   * (it re-searches on every keyup once the box has 3+ characters). Two
   * overlapping searches can resolve out of order, and whichever one's
   * success handler rebuilds the <select> last wins — silently reverting a
   * selection that already landed. Selecting directly sidesteps that search
   * entirely, since it was never needed to find the option in the first place.
   */
  async selectReservationSource(option: OptionTarget) {
    await retryFieldSelection(async () => {
      await this.reservationSourceSelect.selectOption(selectOptionArg(option), { timeout: 10_000 });
      // Reservation Source is the last field that triggers a rate recalculation —
      // wait for it to land before touching Payment or submitting. It's also a
      // stronger success signal than the select's own value: its onchange
      // handler runs checkCarClass('fonte'), which can blank the selection
      // straight back out if Car Class/Pick Up/Return aren't set yet, and
      // tariffa only settles once that check has actually passed.
      await expect(this.tariffaInput).not.toHaveValue('', { timeout: 10_000 });
    }, this.reservationSourceSelect, option, 'Reservation Source');
  }

  /** `payment` null = any Payment Type (see InstanceProfile.data.payment). */
  async selectPayment(payment: SearchableOption | null) {
    if (!payment) {
      await selectAnyRealOption(this.paymentSelect, 'Quotation Payment Type');
      return;
    }
    await searchAndSelectViaKeystroke(this.paymentSearchInput, this.paymentSelect, payment.searchTerm, payment.option);
  }

  async createAndGetQuotationId(): Promise<string> {
    console.log(`[STEP] Clicking "Create" on ${this.page.url()}`);
    await this.createButton.click();

    // "Payment is not linked to the selected customer!" only shows up for some
    // customer/payment combinations — confirm it if it appears, otherwise move on.
    try {
      await this.paymentNotLinkedYesButton.waitFor({ state: 'visible', timeout: 5_000 });
      console.log('[STEP] "Payment not linked to customer" confirmation appeared — clicking Yes');
      await this.paymentNotLinkedYesButton.click();
    } catch {
      // No confirmation needed for this customer/payment combination.
    }

    try {
      await expect(this.quotationCreatedModal).toBeVisible({ timeout: 20_000 });
    } catch (error) {
      throw await createFailure(
        this.page,
        '[STEP FAILED] No success modal appeared after clicking "Create" — the page likely crashed or the ' +
          'server rejected the submission. Check the [PAGE ERROR] / [HTTP 5xx] / [CONSOLE ERROR] / [REQUEST FAILED] ' +
          `lines above this for the cause. Current URL: ${this.page.url()}`,
        error,
      );
    }

    const text = (await this.quotationCreatedText.innerText()).trim();
    const match = text.match(/Quote\s+(\S+)\s+created/i);
    if (!match) {
      throw new Error(`Could not parse a quotation ID out of confirmation text: "${text}"`);
    }
    console.log(`[STEP] Quotation created successfully: ${match[1]}`);
    return match[1];
  }

  /**
   * Converts this quotation into a Reservation, landing on
   * /MyRentWeb/MRReservation/create pre-filled with Customer, Driver,
   * Reservation Source and Payment. Only usable right after
   * createAndGetQuotationId() — closes the success modal it left open (its
   * backdrop would otherwise block this click) before submitting.
   */
  async convertToReservation() {
    if (await this.quotationCreatedModal.isVisible().catch(() => false)) {
      await this.quotationCreatedCloseButton.click();
      await expect(this.quotationCreatedModal).toBeHidden();
    }
    console.log(`[STEP] Converting quotation to reservation on ${this.page.url()}`);
    await this.convertToReservationButton.click();
    // The Reservation create form fires a lot more init work on load
    // (tinyMCE, datepickers, several widgets) than this page — filling
    // Customer immediately can race the page's own AJAX customer-search call
    // into never firing. Let it settle first.
    // Bounded rather than awaited outright — confirmed live (6 Oct 2026) this
    // page's own background polling can keep it from ever reaching true
    // network idle on testee, which failed the step with a 30s timeout; same
    // treatment as the new-button suite's settle waits. The spec's own
    // toHaveURL() check right after is the real "did we land" gate.
    await this.page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  }

  /**
   * Post-creation only: closes the success modal (its backdrop would
   * otherwise block the Edit link, same reason convertToReservation() closes
   * it first), clicks Edit, cycles Payment Type to the next option, and
   * clicks Update — logging the before/after values. Confirmed live: Update
   * lands back on the Show page. The settle wait after landing on the Edit
   * page mirrors the same fix Reservation/RentalAgreement's equivalent
   * needed — confirmed live there that a real click-through navigation (as
   * opposed to a raw page.goto(), which is how this exact page was first
   * explored) can still be finishing its own init when the next action fires.
   */
  async editAndAdvancePaymentType() {
    if (await this.quotationCreatedModal.isVisible().catch(() => false)) {
      await this.quotationCreatedCloseButton.click();
      await expect(this.quotationCreatedModal).toBeHidden();
    }
    console.log(`[STEP] Clicking "Edit" on ${this.page.url()}`);
    await this.editLink.click();
    await expect(this.page).toHaveURL(/\/preventivi\/edit\//);
    await this.page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    await logAndAdvancePaymentType(this.paymentSelect, 'Quotation');

    console.log(`[STEP] Clicking "Update" on ${this.page.url()}`);
    await this.updateButton.click();
    await expect(this.page).toHaveURL(/\/preventivi\/show\//);
    console.log('[STEP] Payment Type update saved.');
  }
}
