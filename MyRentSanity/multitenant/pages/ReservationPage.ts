import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { createFailure, logAndAdvancePaymentType, searchAndSelectViaBlur, selectAnyRealOption, selectOptionArg } from '../utils/formHelpers';
import type { OptionTarget } from '../utils/instances';

/**
 * The "Create Reservation" form (/MyRentWeb/MRReservation/create). MyRent's UI
 * labels this entity "Rental" in the top nav and "CREATE RENTAL" on the page
 * itself, but the calendar's own action button and the underlying code both
 * call it "Reservation" — this page object follows that button's name.
 */
export class ReservationPage extends BasePage {
  readonly rentalTabLink: Locator;
  readonly rateTabLink: Locator;
  readonly payTabLink: Locator;
  readonly customerSearchInput: Locator;
  readonly customerSelect: Locator;
  readonly driver1SearchInput: Locator;
  readonly driver1Select: Locator;
  readonly reservationSourceSearchInput: Locator;
  readonly reservationSourceSelect: Locator;
  readonly paymentSelect: Locator;
  readonly rentalTypeSelect: Locator;
  /**
   * Car Class Booked, Pickup and Return Location — only relevant when
   * creating from scratch (via the top-nav menu or the Rental List's "New
   * Rental" button). The Calendar Planning flow pre-fills all three from the
   * vehicle/day clicked, so calendar-create-reservation.spec.ts never touches
   * these.
   */
  readonly carClassBookedSelect: Locator;
  readonly pickupLocationSelect: Locator;
  readonly returnLocationSelect: Locator;
  /** "Pickup Location will be closed" — fires on some locations regardless of which field triggered it. */
  readonly closedLocationModal: Locator;
  readonly closedLocationContinueButton: Locator;
  readonly createButton: Locator;
  readonly createdModal: Locator;
  readonly createdModalCloseButton: Locator;
  /**
   * Tab 1's conversion button — submits straight into a Rental Agreement
   * create form pre-filled from this reservation (a second, identical
   * button, `#transformRA2`, lives on tab 4 — either works). See
   * tests/conversion/ for the full Quotation → Reservation → Rental
   * Agreement chain.
   */
  readonly convertToRentalAgreementButton: Locator;
  /**
   * A submit `<input>`, not a link — and, like Quotation's Edit link, exists
   * as two identical copies in the DOM, hence `.first()`.
   */
  readonly editButton: Locator;
  /** Shared id with Quotation's edit form and Rental Agreement's Pay tab. */
  readonly updateButton: Locator;

  constructor(page: Page) {
    super(page);
    // Rental Type lives on "1. Rental" (the default tab, so Customer/Driver1
    // don't need to switch to it), Reservation Source on "2. Rate", and
    // Payment on "4. Pay". selectRentalType/selectReservationSource/
    // selectPayment each switch to their own tab first, so callers don't
    // need to fill fields in a tab-friendly order.
    this.rentalTabLink = page.locator('a[href="#tab1"]');
    this.rateTabLink = page.locator('a[href="#tab2"]');
    this.payTabLink = page.locator('a[href="#tab4"]');
    this.customerSearchInput = page.locator('#inputValClient');
    this.customerSelect = page.locator('#client');
    this.driver1SearchInput = page.locator('#inputValDriver1');
    this.driver1Select = page.locator('#clientiByIdCond1');
    this.reservationSourceSearchInput = page.locator('#inputValResSource');
    this.reservationSourceSelect = page.locator('#fontiCommissioni');
    // Payment has no search box on this form — it's a plain, fully-loaded select.
    this.paymentSelect = page.locator('#pagamenti');
    // Required but easy to miss: submission is silently blocked without it.
    this.rentalTypeSelect = page.locator('#raType');
    this.carClassBookedSelect = page.locator('#group');
    this.pickupLocationSelect = page.locator('#locationPickupExcepted');
    this.returnLocationSelect = page.locator('#locationReturnExcepted');
    this.closedLocationModal = page.locator('#closedLocationModal');
    this.closedLocationContinueButton = this.closedLocationModal.locator('.btn, button').filter({ hasText: 'Continue' });
    this.createButton = page.locator('#create');
    this.createdModal = page.locator('#RACreateMessageModal');
    this.createdModalCloseButton = this.createdModal.locator('.close');
    this.convertToRentalAgreementButton = page.locator('#transformRA');
    this.editButton = page.locator('#edit').first();
    this.updateButton = page.locator('#update');
  }

  /**
   * Only needed for from-scratch creation — see the fields' own comment.
   * `pickupLocationLabel` and `returnLocationLabel` are separate parameters,
   * not one shared value, for the same reason as Quotation's Pick Up field
   * (see QuotationPage.selectPickupLocation()'s own comment): confirmed live
   * (25 Sep 2026) `#locationPickupExcepted` is ALSO branch-restricted under
   * Operator (just "Select One..." + the account's own office, already
   * preselected) while `#locationReturnExcepted` gets the full location list
   * — a label valid for Return (like TEST_LOCATION_LABEL) isn't necessarily
   * valid for Pick Up. Defaults to the same value for both so an existing
   * single-location caller doesn't have to change.
   */
  async selectCarClassAndLocations(carClassBooked: OptionTarget, pickupLocation: OptionTarget, returnLocation: OptionTarget = pickupLocation) {
    await this.rentalTabLink.click();
    await this.carClassBookedSelect.selectOption(selectOptionArg(carClassBooked));
    await this.pickupLocationSelect.selectOption(selectOptionArg(pickupLocation));
    await this.confirmClosedLocationIfShown();
    await this.returnLocationSelect.selectOption(selectOptionArg(returnLocation));
    await this.confirmClosedLocationIfShown();
  }

  /**
   * Some locations warn "Pickup Location will be closed" right after being
   * selected, on either the Pickup or Return field — a real, if soon-closing,
   * location, not a bug in the form fill. Proceeds past it rather than
   * switching locations, since it's still usable today.
   */
  private async confirmClosedLocationIfShown() {
    try {
      await this.closedLocationContinueButton.waitFor({ state: 'visible', timeout: 5_000 });
      console.log('[STEP] "Pickup Location will be closed" warning appeared — clicking Continue');
      await this.closedLocationContinueButton.click();
      await expect(this.closedLocationModal).toBeHidden();
    } catch {
      // No warning for this location.
    }
  }

  async selectCustomer(searchTerm: string, option: OptionTarget) {
    await searchAndSelectViaBlur(this.page, this.customerSearchInput, this.customerSelect, searchTerm, option, 'getBusinessPartnerList');
  }

  async selectDriver1(searchTerm: string, option: OptionTarget) {
    await searchAndSelectViaBlur(this.page, this.driver1SearchInput, this.driver1Select, searchTerm, option, 'getBusinessPartnerList');
  }

  // Requires Customer to already be set — the page focuses back on Customer
  // and refuses to search otherwise.
  async selectReservationSource(searchTerm: string, option: OptionTarget) {
    await this.rateTabLink.click();
    await searchAndSelectViaBlur(
      this.page,
      this.reservationSourceSearchInput,
      this.reservationSourceSelect,
      searchTerm,
      option,
      'getReservationSourceListRes',
    );
  }

  /** `option` null = any Payment Type (see InstanceProfile.data.payment). */
  async selectPayment(option: OptionTarget | null) {
    await this.payTabLink.click();
    if (!option) {
      await selectAnyRealOption(this.paymentSelect, 'Reservation Payment Type');
      return;
    }
    await this.paymentSelect.selectOption(selectOptionArg(option));
  }

  /** Skipped on instances whose form has no Rental Type field at all (confirmed live, 6 Oct 2026: noleggiaretest, esgrenttest). */
  async selectRentalType(exactLabel: 'Short Term' | 'Long Term') {
    await this.rentalTabLink.click();
    if ((await this.rentalTypeSelect.count()) === 0) {
      console.log('[STEP] This instance has no Rental Type field — skipping it');
      return;
    }
    await this.rentalTypeSelect.selectOption({ label: exactLabel });
  }

  async createAndGetReferenceId(): Promise<string> {
    // The "Create" button is only shown while a tab 4+ is active — clicking
    // into tab 1/2/3 explicitly hides it again via the page's own JS, so
    // whichever field was filled last (possibly re-activating an early tab)
    // can leave it hidden. Land on the Pay tab right before clicking it.
    await this.payTabLink.click();
    console.log(`[STEP] Clicking "Create" on ${this.page.url()}`);
    // A jQuery blockUI overlay can cover the button while the page's own
    // background calculation (rate, etc.) is still settling — normally quick,
    // but can run long enough to blow the default 15s action timeout. Give it
    // more room rather than failing on what's just a slow-clearing overlay.
    await this.createButton.click({ timeout: 30_000 });

    // Navigating to a "show" URL is the authoritative success signal — more
    // reliable than the success modal, which can appear right as the page is
    // navigating away and get missed by a visibility check (Playwright can
    // throw "execution context was destroyed" mid-navigation, which an
    // isVisible().catch(() => false) would silently swallow as "not
    // visible"). Confirmed live (25 Sep 2026): a run that failed here with
    // "No success modal appeared" had actually already landed on a real
    // `/MRReservation/show/<id>` page — the modal was simply missed, not
    // absent. Same fix already applied to Quotation/RentalAgreement's own
    // createAndGetReferenceId().
    try {
      await expect(this.page).toHaveURL(/\/MRReservation\/show\//, { timeout: 20_000 });
    } catch (error) {
      throw await createFailure(
        this.page,
        '[STEP FAILED] The page never navigated to a "show" URL after clicking "Create" — the page likely crashed ' +
          'or the server rejected the submission. Check the [PAGE ERROR] / [HTTP 5xx] / [CONSOLE ERROR] / ' +
          `[REQUEST FAILED] lines above this for the cause. Current URL: ${this.page.url()}`,
        error,
      );
    }

    // Read straight off the show page's own reference fields (confirmed live
    // they're present: prefix="clarent", number="750" → "CLARENT-750") rather
    // than the success modal, which the URL check above has already made
    // redundant as a signal and which can't be relied on to still be present.
    let prefix: string;
    let number: string;
    try {
      prefix = await this.page.locator('#prefix').inputValue();
      number = await this.page.locator('#number').inputValue();
    } catch (error) {
      console.error(
        `[STEP FAILED] Navigated to ${this.page.url()} (creation likely succeeded) but could not read the ` +
          '"#prefix"/"#number" reference fields on that page — check this URL directly for the actual reference.',
      );
      throw error;
    }

    const referenceId = `${prefix}-${number}`;
    console.log(`[STEP] Reservation created successfully: ${referenceId}`);
    return referenceId;
  }

  /**
   * Converts this reservation into a Rental Agreement, landing on
   * /MyRentWeb/MRRentalAgreement/create pre-filled with Customer, Driver,
   * Reservation Source, Payment and Rental Type — but never a specific
   * vehicle (see RentalAgreementPage.assignVehicle()). Only usable right
   * after createAndGetReferenceId() — closes the success modal it left open
   * (its backdrop would otherwise block this click) before submitting.
   */
  async convertToRentalAgreement() {
    // Same async `#RACreateMessageModal` race as editAndAdvancePaymentType():
    // confirmed live (5 Oct 2026) the modal can appear *after* a one-shot
    // isVisible() check returns false and then block every retry of the
    // click via its backdrop until the action times out. Retry the whole
    // dismiss-then-click cycle instead.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.createdModal.isVisible().catch(() => false)) {
        await this.createdModalCloseButton.click();
        await expect(this.createdModal).toBeHidden();
      }
      try {
        console.log(`[STEP] Converting reservation to rental agreement on ${this.page.url()}`);
        await this.convertToRentalAgreementButton.click({ timeout: 8_000 });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    // This 11-tab wizard fires a lot more init work on load (tinyMCE,
    // datepickers, several widgets) than this page — filling Customer
    // immediately can race the page's own AJAX customer-search call into
    // never firing. Let it settle first.
    // Bounded rather than awaited outright — confirmed live (6 Oct 2026) this
    // page's own background polling can keep it from ever reaching true
    // network idle on testee, which failed the step with a 30s timeout; same
    // treatment as the new-button suite's settle waits. The spec's own
    // toHaveURL() check right after is the real "did we land" gate.
    await this.page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  }

  /**
   * Post-creation only: closes the success modal, clicks Edit, waits for the
   * edit page to settle (confirmed live: the "4. Pay" tab link isn't
   * reliably queryable right after the click-through navigation lands —
   * unlike a raw page.goto() to the same URL, which doesn't show this),
   * switches to the Pay tab (Payment lives there on this form too, same as
   * the create form), cycles Payment Type to the next option, and clicks
   * Update — logging the before/after values. Confirmed live: Update lands
   * back on the Show page.
   */
  async editAndAdvancePaymentType() {
    // Same leftover-modal race fixed in RentalAgreementPage.closeMovement():
    // a single upfront isVisible() check can miss the modal if it's still
    // mid-appearing rather than already open — confirmed live (25 Sep 2026)
    // this then lets editButton's click get blocked by its backdrop instead
    // of throwing anything diagnosable at the check itself. Retrying the
    // whole dismiss-then-click cycle covers both timings.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.createdModal.isVisible().catch(() => false)) {
        await this.createdModalCloseButton.click();
        await expect(this.createdModal).toBeHidden();
      }
      try {
        console.log(`[STEP] Clicking "Edit" on ${this.page.url()}`);
        await this.editButton.click({ timeout: 8_000 });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    await expect(this.page).toHaveURL(/\/MRReservation\/edit\//);
    await this.page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    await this.payTabLink.click();
    await logAndAdvancePaymentType(this.paymentSelect, 'Reservation');

    console.log(`[STEP] Clicking "Update" on ${this.page.url()}`);
    await this.updateButton.click();
    await expect(this.page).toHaveURL(/\/MRReservation\/show\//);
    console.log('[STEP] Payment Type update saved.');
  }
}
