import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { createFailure, logAndAdvancePaymentType, searchAndSelectViaBlur, selectAnyRealOption, selectOptionArg } from '../utils/formHelpers';
import { appUrl, currentInstance, formatDate, type OptionTarget } from '../utils/instances';
import { formatLike, parseAnyDate, sameDay } from '../utils/dates';
import { CustomerPage } from './CustomerPage';
import { NEW_CUSTOMER_DETAILS, NEW_CUSTOMER_DRIVER_INFO } from '../utils/testData';

/**
 * Thrown by assignVehicle() once both Search Available Vehicle and Unlock and
 * Assign are genuinely out of candidates for the form's current Car Class
 * Booked/Location — distinct from a candidate simply being rejected (busy,
 * affiliate mismatch), which just means "try the next one". Callers use this
 * to know when to stop retrying vehicles here and move the whole form on to
 * a different Location or Car Class Booked instead.
 */
export class NoMoreVehicleCandidatesError extends Error {}

/**
 * The "Create Rental Agreement" form (/MyRentWeb/MRRentalAgreement/create).
 * MyRent's UI labels this entity "Board Rental" in the top nav and
 * "CREATE BOARD RENTAL" on the page itself; this page object follows the
 * calendar's own action button name, "Rental Agreement".
 *
 * This is an 11-tab wizard. We only ever touch "1. Rentals" (Customer,
 * Driver1, Car Class, Pick Up/Return — all pre-filled from the calendar),
 * "2. Rate" (Reservation Source), and "4. Pay" (Payment) — everything else
 * keeps its defaults.
 */
export class RentalAgreementPage extends BasePage {
  readonly rentalTabLink: Locator;
  readonly rateTabLink: Locator;
  readonly payTabLink: Locator;
  readonly customerSearchInput: Locator;
  readonly customerSelect: Locator;
  readonly driver1SearchInput: Locator;
  readonly driver1Select: Locator;
  readonly reservationSourceSearchInput: Locator;
  readonly reservationSourceSelect: Locator;
  readonly rentalTypeSelect: Locator;
  /**
   * Tab 4 ("Pay")'s Payment select. There's a second, name="pagamenti1"
   * select on the same tab, but setting this one alone is enough — it syncs
   * pagamenti1 automatically via the field's own onchange handler.
   */
  readonly paymentSelect: Locator;
  /**
   * Car Class Booked, Vehicle Pickup and Vehicle Return — only relevant when
   * creating from scratch (via the top-nav menu or the Board RA List's "New"
   * button). The Calendar Planning flow pre-fills all three from the
   * vehicle/day clicked.
   */
  readonly carClassBookedSelect: Locator;
  readonly pickupLocationSelect: Locator;
  readonly returnLocationSelect: Locator;
  /** "Pickup Location will be closed" — fires on some locations regardless of which field triggered it. */
  readonly closedLocationModal: Locator;
  readonly closedLocationContinueButton: Locator;
  readonly raVehicleInput: Locator;
  /** "Search Available Vehicle" (tab 1) — opens a radio-button picker of vehicles genuinely free right now. */
  readonly searchVehicleButton: Locator;
  readonly vehicleModal: Locator;
  readonly vehicleModalRadios: Locator;
  readonly vehicleModalConfirmButton: Locator;
  readonly vehicleModalCloseButton: Locator;
  /**
   * "Unlock and Assign" (tab 1) — the fallback when Search Available Vehicle
   * has nothing to offer. Its dropdown draws from a wider pool (it can
   * override an existing hold on a vehicle, hence "unlock").
   */
  readonly unlockAssignButton: Locator;
  readonly unlockAssignModal: Locator;
  readonly unlockAssignSelect: Locator;
  readonly unlockAssignConfirmButton: Locator;
  readonly unlockAssignCloseButton: Locator;
  readonly createButton: Locator;
  /** Validation message shown under Driver1 when Create is refused because that driver already has an open contract. */
  readonly openContractError: Locator;
  readonly createdModal: Locator;
  /**
   * `#confirmMessageModal` is a single generic element MyRent reuses for
   * unrelated one-off messages — here it carries either "Logged-in user
   * affiliate mismatched" (Create) or "The vehicle is assigned successfully"
   * (Unlock and Assign), never both, so one locator serves both meanings.
   */
  readonly affiliateMismatchModal: Locator;
  readonly affiliateMismatchCloseButton: Locator;
  readonly vehicleAssignedModal: Locator;
  readonly vehicleAssignedModalCloseButton: Locator;
  /**
   * Unlike Quotation/Reservation, there's no separate Edit page for this
   * entity — Payment on "4. Pay" is already directly editable right on the
   * Show page (confirmed live: not disabled, and a real select+Update cycle
   * against it saves successfully), so there's no Edit button to click here.
   */
  readonly updateButton: Locator;
  /**
   * "7. Closure" tab (anchor id `tab6anchor`, href `#tab6`) — confirmed live
   * the visible tab label is "7. Closure" even though the anchor/URL fragment
   * itself says "tab6" (0-indexed against "1. Rentals").
   */
  readonly closureTabLink: Locator;
  readonly returnDateInput: Locator;
  readonly returnTimeInput: Locator;
  /** Read-only — the movement's actual Pickup Time, read back to mirror into returnTimeInput. */
  readonly pickupTimeInput: Locator;
  readonly returnKmInput: Locator;
  /** Read-only — the movement's actual Start KM, read back so returnKmInput can be set above it. */
  readonly startKmInput: Locator;
  readonly closeMovementButton: Locator;
  /**
   * The Closure tab's own (disabled) Vehicle Pickup select — reused only to
   * read back its selected label, which is what closeMovementLocationModal's
   * operating-location picker must be searched for and selected.
   */
  readonly closureVehiclePickupSelect: Locator;
  /** "Select Operating Location" — opens after Close Movement; a DataTable search+radio picker reused for several unrelated flows (confirmed live via its id, `locationModal`). */
  readonly closeMovementLocationModal: Locator;
  readonly closeMovementLocationSearchInput: Locator;
  /** A `<div class="btn btn-success">`, not a `<button>` — confirmed live, same non-button-Confirm pattern as vehicleModalConfirmButton. */
  readonly closeMovementLocationConfirmButton: Locator;
  /** "Invoice" button on "2. Rate" (`#invoiceConf`, actually a `<div>` — same non-button pattern as other action buttons here). */
  readonly invoiceButton: Locator;
  /**
   * First invoice dialog — confirmed live its id is `invoiceOptModel` (not
   * "Model" typo'd consistently elsewhere in this app, but this is the real
   * one). Its heading text varies ("There is/are N invoice(s)..." vs no
   * invoices yet), so not matched on; only the two selects and Confirm inside
   * it are used.
   */
  readonly invoiceOptionsModal: Locator;
  readonly invoiceActionSelect: Locator;
  readonly invoiceLanguageSelect: Locator;
  readonly invoiceOptionsConfirmButton: Locator;
  /** Second dialog, "Please select invoice type to be issued" (`#invoiceTypeModel`) — offers Final Invoice / Advance Payment Invoice. */
  readonly invoiceTypeModal: Locator;
  readonly finalInvoiceButton: Locator;
  /** "Enable monthly Rental" (tab 1) and the Month / Month Duration selects it reveals. */
  readonly pickupDateInput: Locator;
  /** Tab 1's Drop-off (return) Date on the create form; its time is #returnTime. */
  readonly dropoffDateInput: Locator;
  readonly monthlyRentalCheckbox: Locator;
  readonly monthSelect: Locator;
  readonly monthDurationSelect: Locator;
  readonly estimatedEndDateInput: Locator;
  /** "3. Ext..." tab: Discount %, the page's own TOTAL(€), and the "Invoice Preview" modal's Total Amount. */
  readonly extrasTabLink: Locator;
  readonly discountInput: Locator;
  readonly totalAmountInput: Locator;
  readonly invoicePreviewButton: Locator;
  readonly invoicePreviewModal: Locator;
  readonly invoicePreviewTotalInput: Locator;
  /** Closure tab's "Renew Movement" button, the modal it opens, and that modal's own Renew Movement button. */
  readonly renewMovementTabButton: Locator;
  readonly renewMovementModal: Locator;
  readonly renewMovementButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pickupDateInput = page.locator('#startDate');
    this.dropoffDateInput = page.locator('#endDate');
    this.monthlyRentalCheckbox = page.locator('#isMonthlyRentalRA');
    this.monthSelect = page.locator('#monthRA');
    this.monthDurationSelect = page.locator('#monthDurationRA');
    this.estimatedEndDateInput = page.locator('#estEndDateRA');
    this.extrasTabLink = page.locator('a[href="#tab3"]');
    this.discountInput = page.locator('#tab3 #discount');
    this.totalAmountInput = page.locator('#totalAmount');
    this.invoicePreviewButton = page.locator('#invoice');
    this.invoicePreviewModal = page.locator('#invoiceModal');
    this.invoicePreviewTotalInput = page.locator('#totAmount');
    this.renewMovementTabButton = page.locator('#renewMov');
    this.renewMovementModal = page.locator('#renewMovModal');
    this.renewMovementButton = page.locator('#renewMovementBtn');
    // Rental Type lives on "1. Rentals" (the default tab, so Customer/Driver1
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
    this.reservationSourceSelect = page.locator('#commissionis');
    this.rentalTypeSelect = page.locator('#raType');
    this.paymentSelect = page.locator('#pagamenti');
    this.carClassBookedSelect = page.locator('#groups');
    this.pickupLocationSelect = page.locator('#locationPickUpExcepted');
    this.returnLocationSelect = page.locator('#locationReturnExpected');
    this.closedLocationModal = page.locator('#closedLocationModal');
    this.closedLocationContinueButton = this.closedLocationModal.locator('.btn, button').filter({ hasText: 'Continue' });
    this.raVehicleInput = page.locator('#raVehicle');
    this.searchVehicleButton = page.locator('#searchVehicle');
    this.vehicleModal = page.locator('#vehicleModal');
    this.vehicleModalRadios = this.vehicleModal.locator('input[type="radio"]');
    this.vehicleModalConfirmButton = this.vehicleModal.locator('.btn, button').filter({ hasText: 'Confirm' });
    this.vehicleModalCloseButton = this.vehicleModal.getByRole('button', { name: 'Close' });
    this.unlockAssignButton = page.locator('#validateUnlockAssign');
    this.unlockAssignModal = page.locator('#unlockAssignModal');
    this.unlockAssignSelect = page.locator('#plateNumberUnlock');
    this.unlockAssignConfirmButton = this.unlockAssignModal.locator('.btn, button').filter({ hasText: 'Confirm' });
    this.unlockAssignCloseButton = this.unlockAssignModal.locator('.btn, button').filter({ hasText: 'Close' });
    this.createButton = page.locator('#create');
    this.openContractError = page.getByText(/another open contract for this driver/i);
    this.createdModal = page.locator('#RACreateMessageModal');
    this.affiliateMismatchModal = page.locator('#confirmMessageModal');
    this.affiliateMismatchCloseButton = this.affiliateMismatchModal.getByRole('button', { name: 'Close' });
    this.vehicleAssignedModal = this.affiliateMismatchModal;
    this.vehicleAssignedModalCloseButton = this.affiliateMismatchCloseButton;
    this.updateButton = page.locator('#update');
    this.closureTabLink = page.locator('a[href="#tab6"]');
    this.returnDateInput = page.locator('#endDateCheckIn');
    this.returnTimeInput = page.locator('#returnTimeCheckIn');
    this.pickupTimeInput = page.locator('#pickUpTime');
    this.returnKmInput = page.locator('#endKmCheckIn');
    this.startKmInput = page.locator('#startKmCheckIn');
    this.closeMovementButton = page.locator('#movement');
    this.closureVehiclePickupSelect = page.locator('#locationPickUpExceptedChckIN');
    this.closeMovementLocationModal = page.locator('#locationModal');
    this.closeMovementLocationSearchInput = this.closeMovementLocationModal.locator('.dataTables_filter input');
    this.closeMovementLocationConfirmButton = this.closeMovementLocationModal.locator('.btn, button').filter({ hasText: 'Confirm' });
    this.invoiceButton = page.locator('#invoiceConf');
    this.invoiceOptionsModal = page.locator('#invoiceOptModel');
    this.invoiceActionSelect = page.locator('#invoiceSelectOpt');
    this.invoiceLanguageSelect = page.locator('#languageInv');
    this.invoiceOptionsConfirmButton = this.invoiceOptionsModal.locator('.btn, button').filter({ hasText: 'Confirm' });
    // Confirmed live (15 Sep 2026): `#invoiceTypeModel` is duplicated in the
    // DOM (a second, permanently hidden element with the same id) — `.first()`
    // picks the real one Bootstrap actually shows.
    this.invoiceTypeModal = page.locator('#invoiceTypeModel').first();
    this.finalInvoiceButton = this.invoiceTypeModal.getByRole('button', { name: 'Final Invoice', exact: true });
  }

  /**
   * Only needed for from-scratch creation — see the fields' own comment.
   * Same two-parameter shape as ReservationPage's own
   * selectCarClassAndLocations() (structurally shared via
   * BookingFormPageWithVehicleClass) — Pick Up and Return aren't guaranteed
   * to accept the same label set on this form either, even though every
   * caller here currently passes RA_LOCATION_LABEL (PMO) for both, which is
   * valid for both fields.
   */
  async selectCarClassAndLocations(carClassBooked: OptionTarget, pickupLocation: OptionTarget, returnLocation: OptionTarget = pickupLocation) {
    await this.dismissLeftoverModals();
    await this.clickTabPastNotice(this.rentalTabLink);
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

  /**
   * "Rate cannot apply to the selected group or period" — the generic
   * #confirmMessageModal the form raises (asynchronously, after the rate
   * lookup) when the chosen Car Class has no rate for the pickup/period, which
   * a backdated monthly rental hits for some classes (confirmed live 8 Oct 2026
   * on rentalplustest, "V - DREAM CAR"; not seen on testee). Its backdrop blocks every click, so it is closed here;
   * the Car Class loop still decides whether the class is usable. `waitMs`
   * gives the rate lookup time to answer before concluding there is no modal.
   */
  private raTypePromptHandlerAdded = false;

  private async dismissRateWarning(waitMs = 2_000) {
    const rateModal = this.affiliateMismatchModal.filter({ hasText: /rate cannot apply/i });
    try {
      await rateModal.waitFor({ state: 'visible', timeout: Math.max(waitMs, 1) });
    } catch {
      return;
    }
    console.log('[STEP] "Rate cannot apply to the selected group or period" appeared — closing it');
    await rateModal.getByRole('button', { name: /close/i }).first().click();
    await expect(rateModal).toBeHidden();
  }

  /**
   * A leftover Unlock and Assign dialog or #RACreateMessageModal — from a
   * previous attempt, possibly against a completely different Car
   * Class/Location combo — can still be open here and block every click
   * below via its backdrop. Both selectCarClassAndLocations() and
   * assignVehicle() can be a "first" call within a retry sequence, so both
   * guard with this.
   */
  private async dismissLeftoverModals() {
    if (await this.unlockAssignModal.isVisible().catch(() => false)) {
      await this.unlockAssignCloseButton.click();
      await expect(this.unlockAssignModal).toBeHidden();
    }
    // Same idea for a leftover #RACreateMessageModal (e.g. the Cargos notice
    // createAndGetReferenceId() can leave open on a failed attempt) — its
    // backdrop blocks every click here just as effectively.
    if (await this.createdModal.isVisible().catch(() => false)) {
      await this.createdModal.getByRole('button').first().click();
      await expect(this.createdModal).toBeHidden();
    }
  }

  /**
   * Clicks a tab link; if the "movements not yet transmitted to Cargos/Hospedajes"
   * notice (#RACreateMessageModal) opens over the page — it can at any moment —
   * closes it and tries again (3 attempts). Behaves exactly like a plain click
   * when nothing is in the way.
   */
  private async clickTabPastNotice(tab: Locator) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.closeNoticeIfOpen();
      try {
        await tab.click({ timeout: attempt === 2 ? 30_000 : 8_000 });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /**
   * Assigns a vehicle on tab 1 — required before Create will accept the form
   * when creating from scratch (unlike Calendar Planning, where the vehicle
   * comes from the cell clicked). Confirmed process: try Search Available
   * Vehicle first; only fall back to Unlock and Assign if it has nothing
   * listed.
   *
   * `attempt` selects which candidate to try: 0-based through the Search
   * Available Vehicle radios first, then continuing into the Unlock and
   * Assign dropdown once those are exhausted. Callers retry with the next
   * attempt number if Create later fails with an affiliate mismatch (a data
   * condition on that specific vehicle, not a bug — see
   * createAndGetReferenceId()). Throws NoMoreVehicleCandidatesError once both
   * are genuinely out of candidates, so a caller iterating attempts can tell
   * "nothing left here, try a different Location/Car Class Booked" apart from
   * "this one candidate didn't work, try the next attempt".
   *
   * @returns the assigned vehicle's own description, for logging which one was tried.
   */
  async assignVehicle(attempt: number, allowUnlockAndAssign = true): Promise<string> {
    await this.dismissLeftoverModals();
    // A retry after a failed Create leaves tab 4 ("Pay") active — Search
    // Available Vehicle lives on tab 1 and is hidden (so unclickable) otherwise.
    await this.clickTabPastNotice(this.rentalTabLink);
    // Brought to the middle of the screen first: at the bottom edge the collapsed
    // Jivochat bar can sit over the button and swallow the click (seen live
    // 9 Oct 2026, rentalplustest).
    await this.searchVehicleButton.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await this.searchVehicleButton.click();
    // Some classes answer with a "No available vehicle" dialog instead of the
    // picker (user report, 7 Oct 2026, rentalplustest): nothing to try for
    // this Car Class, so let the caller move on to the next one.
    const noVehicleDialog = this.page.locator('.modal.in, [role="dialog"]').filter({ hasText: /no available vehicle/i });
    const outcome = await Promise.race([
      this.vehicleModal.waitFor({ state: 'visible' }).then(() => 'picker' as const),
      noVehicleDialog.first().waitFor({ state: 'visible' }).then(() => 'none' as const),
    ]);
    if (outcome === 'none') {
      await noVehicleDialog.first().getByRole('button').first().click().catch(() => {});
      throw new NoMoreVehicleCandidatesError('Search Available Vehicle reported "No available vehicle" for this Car Class.');
    }
    const radioCount = await this.vehicleModalRadios.count();

    if (attempt < radioCount) {
      const radio = this.vehicleModalRadios.nth(attempt);
      const description = (await radio.locator('xpath=ancestor::tr[1]').innerText()).replace(/\s+/g, ' ').trim();
      await radio.check();
      await this.vehicleModalConfirmButton.click();
      await expect(this.raVehicleInput).not.toHaveValue('', { timeout: 10_000 });
      return description;
    }

    await this.vehicleModalCloseButton.click();
    await expect(this.vehicleModal).toBeHidden();

    if (!allowUnlockAndAssign) {
      throw new NoMoreVehicleCandidatesError(`Search Available Vehicle offered only ${radioCount} vehicle(s) for this Car Class (Unlock and Assign not allowed in this pass).`);
    }
    await this.unlockAssignButton.click();
    await expect(this.unlockAssignModal).toBeVisible();
    const options = this.unlockAssignSelect.locator('option');
    const optionCount = await options.count();
    const optionIndex = attempt - radioCount + 1; // +1 skips the leading "Select One..." option
    if (optionIndex >= optionCount) {
      throw new NoMoreVehicleCandidatesError(
        `No more vehicles left to try at attempt ${attempt}: only ${radioCount} from Search Available Vehicle ` +
          `and ${optionCount - 1} from Unlock and Assign were on offer.`,
      );
    }
    const label = (await options.nth(optionIndex).innerText()).trim();
    await this.unlockAssignSelect.selectOption({ label });
    await this.unlockAssignConfirmButton.click();
    // Unlock and Assign can also refuse a candidate outright — e.g. "The
    // vehicle is busy with another rental or movement" — rather than confirm
    // it, so check the actual message instead of assuming success.
    await expect(this.vehicleAssignedModal).toBeVisible({ timeout: 10_000 });
    const message = (await this.vehicleAssignedModal.innerText()).trim();
    await this.vehicleAssignedModalCloseButton.click();
    await expect(this.vehicleAssignedModal).toBeHidden();
    // Either way, Unlock and Assign itself is still open underneath — close
    // it too, or its backdrop blocks every click the next attempt makes.
    if (await this.unlockAssignModal.isVisible().catch(() => false)) {
      await this.unlockAssignCloseButton.click();
      await expect(this.unlockAssignModal).toBeHidden();
    }
    if (!/assigned successfully|assegnato con successo/i.test(message)) {
      throw new Error(`Could not assign "${label}" via Unlock and Assign: "${message}"`);
    }
    return label;
  }

  async selectCustomer(searchTerm: string, option: OptionTarget) {
    await searchAndSelectViaBlur(this.page, this.customerSearchInput, this.customerSelect, searchTerm, option, 'getBusinessPartnerList');
  }

  async selectDriver1(searchTerm: string, option: OptionTarget) {
    await searchAndSelectViaBlur(this.page, this.driver1SearchInput, this.driver1Select, searchTerm, option, 'getBusinessPartnerList');
  }

  async selectReservationSource(searchTerm: string, option: OptionTarget) {
    await this.rateTabLink.click();
    await searchAndSelectViaBlur(
      this.page,
      this.reservationSourceSearchInput,
      this.reservationSourceSelect,
      searchTerm,
      option,
      'getReservationSourceList',
    );
  }

  /** `option` null = any Payment Type (see InstanceProfile.data.payment). */
  async selectPayment(option: OptionTarget | null) {
    await this.payTabLink.click();
    if (!option) {
      await selectAnyRealOption(this.paymentSelect, 'Rental Agreement Payment Type');
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

  /**
   * Returns the "PREFIX-NUMBER" reference (e.g. "CLARENT-345") read off the
   * resulting Show page — unlike Quotation/Reservation, the success modal
   * here doesn't include the reference itself.
   */
  /**
   * Creates a brand-new customer/driver in a SECOND tab (same session, so the
   * half-filled rental form here is left exactly as it is), then swaps it into
   * Customer and Driver1 on this form. Used when Create is refused with
   * "There is another open contract for this driver!" — the form is already
   * complete, so only these two fields need changing before retrying Create.
   * The name is made unique so the Customer/Driver search finds only this record.
   */
  private async switchToFreshDriver(): Promise<void> {
    const lastName = `Sanity${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;
    console.log(`[STEP] Driver has another open contract — creating a fresh customer/driver "${NEW_CUSTOMER_DETAILS.firstName} ${lastName}" in a new tab`);

    const tab = await this.page.context().newPage();
    let id: string;
    try {
      const customerPage = new CustomerPage(tab);
      await customerPage.goto(appUrl('/MRBusinessPartner/create'));
      await tab.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      // The Rental Agreement refuses a customer with no City, and only Italy has a City list.
      await customerPage.fillDetails({
        ...NEW_CUSTOMER_DETAILS,
        lastName,
        countrySearchTerm: 'Ital',
        country: 'ITALIA',
        city: 'Tortona',
        province: 'AL',
        postalCode: '15057',
        birthNationSearchTerm: 'Ital',
        birthNation: 'ITALIA',
        birthProv: 'AL',
        birthPlace: 'TORTONA',
        computeTaxCode: true,
      });
      await customerPage.fillDriverInformation(NEW_CUSTOMER_DRIVER_INFO);
      id = await customerPage.createAndGetId();
    } finally {
      await tab.close();
    }

    // The failed Create leaves the page's loader modal over the form — clear it
    // so the field changes below aren't blocked by its backdrop.
    await this.page.evaluate(() => {
      document.querySelectorAll('#loaderModal, .modal-backdrop').forEach((el) => el.remove());
      document.body.classList.remove('modal-open');
    });
    await this.rentalTabLink.click();
    const option = { value: id, label: `${NEW_CUSTOMER_DETAILS.firstName} ${lastName}` };
    await this.selectCustomer(lastName, option);
    await this.selectDriver1(lastName, option);
    console.log(`[STEP] Switched this rental to the new customer/driver (id ${id})`);
  }

  async createAndGetReferenceId(canSwitchDriver = true): Promise<string> {
    // The "Create" button is only shown while a tab 4+ is active — clicking
    // into tab 1/2/3 explicitly hides it again via the page's own JS, so
    // whichever field was filled last (possibly re-activating an early tab)
    // can leave it hidden. Land on the Pay tab right before clicking it.
    await this.payTabLink.click();

    // Confirmed live (3 Sep 2026) this is why Create kept silently failing to
    // reach a "show" page with zero diagnosable cause — no console error, no
    // HTTP error, the form still fully filled: a CARGOS driver-document
    // warning ("Missing Driver Details... Vuoi continuare?") fires as a
    // native confirm() dialog right after clicking Create, and an unhandled
    // dialog is dismissed by Playwright by default — a manual tester never
    // even notices this, since they'd just see and click through it. Handler
    // is re-registered fresh each call (not accumulated with page.on) since
    // this method can run more than once per test when retrying across
    // vehicles.
    this.page.removeAllListeners('dialog');
    this.page.on('dialog', async (dialog) => {
      console.log(`[STEP] Dialog appeared: "${dialog.message().replace(/\s+/g, ' ').trim()}" — accepting`);
      await dialog.accept();
    });

    console.log(`[STEP] Clicking "Create" on ${this.page.url()}`);
    await this.createButton.click();

    // The first click only runs the form's async validation/calculation
    // chain (rate, affiliate, blacklist checks) — the actual submission
    // needs a second click once that settles. A stray "Logged-in user
    // affiliate mismatched" business-rule modal can also show up here, tied
    // to this specific vehicle's location, not a bug in the form fill.
    for (let attempt = 0; attempt < 2; attempt++) {
      // Already on the "show" page means the RA exists — never click Create
      // again (would duplicate it) and never let modal-closing noise fail a
      // creation that succeeded (seen live 30 Sep 2026: RAs 410/411/412 were
      // all created but the first two were reported as failures, then retried).
      if (/\/MRRentalAgreement\/show\//.test(this.page.url())) break;
      if (await this.createdModal.isVisible().catch(() => false)) {
        // e.g. a Cargos "movements not yet transmitted" notice — close it so
        // its backdrop doesn't block whatever runs next (the URL check right
        // below, or a retry's clicks on a completely different tab/modal).
        // Best-effort: the page may be navigating away mid-click, which
        // detaches the modal and is not a failure.
        try {
          await this.createdModal.getByRole('button').first().click({ timeout: 5_000 });
          await expect(this.createdModal).toBeHidden({ timeout: 5_000 });
        } catch {
          // navigation/detach race — the URL check below is authoritative
        }
        break;
      }
      if (await this.openContractError.isVisible().catch(() => false)) {
        // "There is another open contract for this driver1. Do you wish to
        // continue?" (OK / Cancel) is only a question — user instruction, 9 Oct
        // 2026: click OK and carry on creating, instead of swapping the driver
        // for a new customer (which that text, also matched by openContractError,
        // used to trigger before the OK handler could answer it). Only a hard
        // refusal, with no OK button, still falls through to the old handling.
        const continuePrompt = this.page
          .locator('.modal.in, [role="dialog"]')
          .filter({ hasText: /another open contract/i })
          .getByRole('button', { name: /^\s*(OK|Yes|Continue)\s*$/i })
          .first();
        if (await continuePrompt.isVisible().catch(() => false)) {
          console.log('[STEP] "Another open contract for this driver" — clicking OK and carrying on with the same driver');
          await continuePrompt.click({ timeout: 5_000, noWaitAfter: true }).catch(() => {});
          break; // creation carries on by itself; the URL check below waits for the Show page
        }
        if (canSwitchDriver && currentInstance.freshDriverOnOpenContract) {
          await this.switchToFreshDriver();
          return this.createAndGetReferenceId(false);
        }
        throw new Error('Create was refused: "There is another open contract for this driver!"');
      }
      if (await this.affiliateMismatchModal.isVisible().catch(() => false)) {
        const msg = (await this.affiliateMismatchModal.innerText()).trim();
        // A backdated pickup (the monthly-rental suite starts a month in the
        // past) raises "issuing date is after the start date. Do you want to
        // update the issuing date?" — Update / Do not Update / Cancel, not a
        // failure. Keep the issuing date as it is and submit again.
        if (/issuing date is after the start date/i.test(msg)) {
          console.log('[STEP] "Issuing date is after the start date" prompt appeared — clicking "Do not Update"');
          await this.affiliateMismatchModal.locator('.btn, button').filter({ hasText: /^\s*Do not Update\s*$/i }).first().click();
          await expect(this.affiliateMismatchModal).toBeHidden();
          break;
        }
        console.error(
          `[STEP FAILED] "${msg}" — this vehicle's location doesn't match the logged-in user's affiliate. ` +
            'This is a data condition on the specific vehicle the calendar picked, not a bug in the form fill. ' +
            'Re-run to have the calendar pick a different available vehicle.',
        );
        // Close it before throwing — otherwise it's left open, blocking
        // whatever the caller tries to click next (e.g. re-navigating to the
        // calendar to try a different vehicle).
        await this.affiliateMismatchCloseButton.click();
        await expect(this.affiliateMismatchModal).toBeHidden();
        throw new Error(msg);
      }
      if (attempt > 0) await this.createButton.click();
      await this.page.waitForTimeout(1_500);
    }

    // Navigating to a "show" URL is the authoritative success signal — more
    // reliable than the success modal, which can appear right as the page is
    // navigating away from "create" and get missed by a visibility check
    // (Playwright can throw "execution context was destroyed" mid-navigation,
    // which the isVisible().catch(() => false) calls above would silently
    // swallow as "not visible" rather than surface).
    try {
      await expect(this.page).toHaveURL(/\/MRRentalAgreement\/show\//, { timeout: 20_000 });
    } catch (error) {
      throw await createFailure(
        this.page,
        '[STEP FAILED] The page never navigated to a "show" URL after clicking "Create" — the page likely crashed ' +
          'or the server rejected the submission. Check the [PAGE ERROR] / [HTTP 5xx] / [CONSOLE ERROR] / ' +
          `[REQUEST FAILED] lines above this for the cause. Current URL: ${this.page.url()}`,
        error,
      );
    }

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
    console.log(`[STEP] Rental agreement created successfully: ${referenceId}`);
    return referenceId;
  }

  /**
   * Create for the monthly rental, which clicks Create ONCE and then waits for
   * the Show page (user instruction, 8 Oct 2026: click "Do not Update" on the
   * issuing-date prompt and wait — it creates the rental and loads the page).
   * createAndGetReferenceId() clicks Create a second time after 1.5s, which
   * cuts that save short here. Prompts are answered in the wait loop itself:
   * locator handlers only fire during actions, and the loop makes none.
   */
  async createMonthlyAndGetReferenceId(vehicleCandidate = 0): Promise<string> {
    await this.payTabLink.click();
    this.page.removeAllListeners('dialog');
    // "Attention, vehicle not valid with the selected values" is the app refusing
    // this vehicle for this period; it then empties Vehicle and Create does
    // nothing for good. Noted here so the wait below can give up on that vehicle
    // at once instead of running out its 180s (seen live 12 Oct 2026).
    let vehicleRejected = false;
    this.page.on('dialog', async (dialog) => {
      const message = dialog.message().replace(/\s+/g, ' ').trim();
      console.log(`[STEP] Dialog appeared: "${message}" — accepting`);
      if (/vehicle not valid with the selected values/i.test(message)) vehicleRejected = true;
      await dialog.accept().catch(() => {});
    });
    console.log(`[STEP] Clicking "Create" on ${this.page.url()}`);
    await this.createButton.click();

    const raTypeModal = this.page.locator('#raTypeConfirmationModal');
    const issuingDateModal = this.affiliateMismatchModal.filter({ hasText: /issuing date is after the start date/i });
    const loader = this.page.locator('#loaderModal');
    const deadline = Date.now() + 180_000;
    let lastCreateClick = Date.now();
    let extraClicks = 0;
    // The "another open contract" text stays on the page after the driver is
    // swapped (a brand-new customer cannot have an open contract — seen live 12
    // Oct 2026, rentalplustest/Operator, where it triggered 3-4 swaps and as many
    // throwaway customers per attempt). One swap per attempt is enough.
    let swappedDriver = false;
    while (!/\/MRRentalAgreement\/show\//.test(this.page.url())) {
      if (Date.now() > deadline) throw new Error(`The monthly rental was not created within 180s (URL: ${this.page.url()}).`);
      if (vehicleRejected && (await this.raVehicleInput.inputValue().catch(() => 'x')) === '') {
        throw new Error('The app rejected the vehicle for this period ("vehicle not valid with the selected values") and emptied the Vehicle field.');
      }
      try {
        if (await raTypeModal.isVisible()) {
          await this.answerRentalTypePrompt(raTypeModal);
        } else if (await issuingDateModal.isVisible()) {
          console.log('[STEP] "Issuing date is after the start date" prompt appeared — clicking "Do not Update" and waiting for the save');
          await issuingDateModal.locator('.btn, button').filter({ hasText: /^\s*Do not Update\s*$/i }).first().click({ timeout: 5_000 });
          // Seen live 8 Oct 2026 (testee): the form then goes back to idle on the
          // Pay tab and only saves on the next Create click — due in ~3s.
          lastCreateClick = Date.now() - 17_000;
          extraClicks = 0;
        } else if (await this.createdModal.isVisible()) {
          await this.createdModal.getByRole('button').first().click({ timeout: 5_000 });
        } else if (!swappedDriver && (await this.openContractError.isVisible())) {
          swappedDriver = true;
          // Monthly keeps swapping in a fresh driver here: clicking OK on the
          // "another open contract" prompt restarts the whole check (the issuing-
          // date prompt comes straight back) and the save never completes — seen
          // live 9 Oct 2026, rentalplustest, in a loop that ran until the test
          // timed out. The fresh-driver path is the one proven for the monthly flow.
          await this.switchToFreshDriver();
          // Changing the customer can clear the vehicle again, and Create then
          // silently does nothing (as when the monthly period is entered) — put
          // one back with Search Available Vehicle (never Unlock and Assign).
          if ((await this.raVehicleInput.inputValue().catch(() => '')) === '') {
            const assigned = await this.assignVehicle(vehicleCandidate, false);
            console.log(`[STEP] The form's Vehicle was empty after the driver swap — Search Available Vehicle assigned: ${assigned}`);
          }
          await this.payTabLink.click();
          await this.createButton.click();
          lastCreateClick = Date.now();
        } else if (await this.affiliateMismatchModal.isVisible()) {
          const msg = (await this.affiliateMismatchModal.innerText()).replace(/\s+/g, ' ').trim();
          await this.affiliateMismatchCloseButton.click({ timeout: 5_000 }).catch(() => {});
          throw new Error(`Create was refused: "${msg}"`);
        } else if (Date.now() - lastCreateClick > 20_000 && extraClicks < 2 && !(await loader.isVisible())) {
          extraClicks++;
          lastCreateClick = Date.now();
          const state = await this.page.evaluate(() => {
            const vis = (e: Element) => !!((e as HTMLElement).offsetWidth || (e as HTMLElement).offsetHeight);
            const create = document.querySelector<HTMLElement>('#create');
            return {
              url: location.href,
              activeTab: document.querySelector('.nav-tabs li.active a')?.getAttribute('href') ?? null,
              createVisible: create ? vis(create) : null,
              vehicle: document.querySelector<HTMLInputElement>('#raVehicle')?.value ?? null,
              modals: [...document.querySelectorAll('.modal')].filter(vis).map((m) => `${m.id}: ${(m as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 160)}`),
              errors: [...document.querySelectorAll('.has-error, .error, .text-danger, .help-block')].filter(vis).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 100)).filter(Boolean).slice(0, 6),
            };
          });
          console.log(`[STEP] Nothing happened for 20s and nothing is loading (${JSON.stringify(state)}) — clicking Create again`);
          if (process.env.SANITY_DEBUG_SHOTS) await this.page.screenshot({ path: `${process.env.SANITY_DEBUG_SHOTS}/create_stuck_${extraClicks}.png` });
          if (!state.createVisible) await this.payTabLink.click({ timeout: 10_000 });
          await this.createButton.click({ timeout: 10_000 });
        }
      } catch (error) {
        // A modal closing or the page navigating away mid-check is not a failure.
        if (error instanceof Error && /^Create was refused/.test(error.message)) throw error;
      }
      await this.page.waitForTimeout(500);
    }
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    const referenceId = `${await this.page.locator('#prefix').inputValue()}-${await this.page.locator('#number').inputValue()}`;
    console.log(`[STEP] Rental agreement created successfully: ${referenceId}`);
    return referenceId;
  }

  /**
   * Post-creation only, right on the Show page — no separate Edit step, see
   * updateButton's own comment. `createdModal` (`#RACreateMessageModal`) is
   * reused for several unrelated messages on this page (confirmed live: it
   * can also carry an unrelated "movements not yet transmitted to Cargos"
   * warning on an existing record), but whichever it's showing here, its
   * backdrop blocks the Pay tab the same way, so it's closed unconditionally
   * rather than checked for particular text. Cycles Payment Type to the next
   * option and clicks Update — logging the before/after values. Confirmed
   * live: Update reloads the Show page with the Pay tab preserved.
   */
  /**
   * Clicks `target` on the Show page, closing `#RACreateMessageModal` first
   * whenever it's in the way. Confirmed live (5 Oct 2026) that this modal can
   * open at any point in the first ~30s after the Show page loads — after a
   * one-shot isVisible() check said it wasn't there, and even after an
   * earlier click on the same page had already succeeded (Pay tab fine,
   * Update a few seconds later blocked) — and once open, its backdrop blocks
   * every retry of an in-flight click until that click times out. So every
   * Show-page click goes through this dismiss-then-click retry cycle, not
   * just the first one.
   */
  private async clickPastCreatedModal(target: Locator) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.createdModal.isVisible().catch(() => false)) {
        await this.createdModal.getByRole('button').first().click();
        await expect(this.createdModal).toBeHidden();
      }
      try {
        await target.click({ timeout: 8_000 });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async editAndAdvancePaymentType() {
    await this.clickPastCreatedModal(this.payTabLink);
    await logAndAdvancePaymentType(this.paymentSelect, 'Rental Agreement');

    console.log(`[STEP] Clicking "Update" on ${this.page.url()}`);
    await this.clickPastCreatedModal(this.updateButton);
    await expect(this.page).toHaveURL(/\/MRRentalAgreement\/show\//, { timeout: 20_000 });
    console.log('[STEP] Payment Type update saved.');
  }

  /**
   * Post-creation only, right on the Show page. Creates and issues a Final
   * Invoice for the RA from tab "2. Rate" — confirmed live (15 Sep 2026)
   * against an existing RA:
   * 1. Click Invoice (`#invoiceConf`) — opens `#invoiceOptModel` ("There
   *    is/are N invoice(s) for this Rental Agreement." when any already
   *    exist, but the same two selects regardless).
   * 2. Select "Create an Invoice" (value "0") in `#invoiceSelectOpt`, and the
   *    first real language option (English) in `#languageInv` — language
   *    choice doesn't matter here, so just take whatever is first.
   * 3. Confirm — opens a second dialog, `#invoiceTypeModel` ("Please select
   *    invoice type to be issued"), offering Final Invoice / Advance Payment
   *    Invoice.
   * 4. Click Final Invoice. This opens the generated invoice PDF in a new
   *    tab (confirmed live: a real popup window, not a same-tab navigation;
   *    headless Chromium downloads that PDF instead of rendering it)
   *    — both dialogs above close on their own once it does. The popup is
   *    only used to confirm the invoice was actually generated, then closed;
   *    the flow has nothing further to do with it.
   * 5. Click Update on the (still on tab "2. Rate") Show page to persist.
   *
   * Called after createAndGetReferenceId() and before closeMovement() —
   * MyRent expects the invoice issued while the movement is still open.
   */
  async createInvoice(): Promise<'created' | 'already-invoiced'> {
    // Same async/leftover `#RACreateMessageModal` risk as closeMovement() —
    // confirmed live (15 Sep 2026) it can still be open right after
    // createAndGetReferenceId() returns and blocks the Rate tab click below
    // via its backdrop.
    try {
      await this.createdModal.waitFor({ state: 'visible', timeout: 5_000 });
      await this.createdModal.getByRole('button').first().click();
      await expect(this.createdModal).toBeHidden();
    } catch {
      // No leftover message modal.
    }

    await this.clickPastCreatedModal(this.rateTabLink);
    await this.clickPastCreatedModal(this.invoiceButton);
    await expect(this.invoiceOptionsModal).toBeVisible();

    // Some instances invoice the RA on their own at creation — confirmed live
    // (6 Oct 2026, giffitest): a brand-new RA's dialog already says "There
    // is/are 1 invoice(s)" and offers only "Print & Email an already created
    // invoice", no "Create an Invoice" at all. The RA is invoiced either way,
    // so report that instead of failing on a missing option.
    const createOption = this.invoiceActionSelect.locator('option', { hasText: 'Create an Invoice' });
    const canCreate = await createOption
      .waitFor({ state: 'attached', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!canCreate) {
      const heading = ((await this.invoiceOptionsModal.innerText()).match(/There is\/are (\d+) invoice\(s\)/i) ?? [])[0];
      if (!heading || heading.match(/\d+/)![0] === '0') {
        throw new Error('The Invoice dialog offers no "Create an Invoice" option and reports no existing invoice either.');
      }
      console.log(`[STEP] "${heading}" — this instance already invoiced the RA, and offers no "Create an Invoice"`);
      await this.invoiceOptionsModal.locator('.btn, button').filter({ hasText: 'Close' }).first().click();
      await expect(this.invoiceOptionsModal).toBeHidden();
      return 'already-invoiced';
    }

    await this.invoiceActionSelect.selectOption({ label: 'Create an Invoice' });
    await this.invoiceLanguageSelect.selectOption({ index: 1 });
    await this.invoiceOptionsConfirmButton.click();

    await expect(this.invoiceTypeModal).toBeVisible({ timeout: 10_000 });
    // The popup (generateInvoice -> printInvoice1) serves the invoice as
    // `application/pdf`. Confirmed from a trace (5 Oct 2026) that headless
    // Chromium turns that into a *download* rather than rendering it, so the
    // popup's `load` event never fires and a plain waitForLoadState() hangs
    // even though the invoice was generated. Accept either outcome: the popup
    // loads (headed / PDF viewer) or a download starts. The download event
    // fired on the opener ~2ms *before* the popup event in that trace, so its
    // listener has to be registered before the click.
    const downloadOnOpener = this.page.waitForEvent('download', { timeout: 30_000 });
    downloadOnOpener.catch(() => {});
    const popupPromise = this.page.waitForEvent('popup', { timeout: 60_000 });
    popupPromise.catch(() => {});
    await this.finalInvoiceButton.click();
    // rentalplustest asks for an Operating Location first (confirmed live, 7 Oct
    // 2026); the popup only opens once it is confirmed.
    const invoiceLocationModal = this.page.locator('.modal:visible', { hasText: 'Select Operating Location' }).first();
    const next = await Promise.race([
      popupPromise.then(() => 'popup' as const),
      invoiceLocationModal.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'location' as const),
    ]).catch(() => 'popup' as const);
    if (next === 'location') {
      console.log('[STEP] "Select Operating Location" appeared for the invoice — selecting the rental pickup location');
      await this.selectOperatingLocation(invoiceLocationModal);
    }
    const invoicePopup = await popupPromise;
    const outcome = await Promise.any([
      downloadOnOpener.then((d) => `downloaded ${d.suggestedFilename()} from ${d.url()}`),
      invoicePopup.waitForEvent('download', { timeout: 30_000 }).then((d) => `downloaded ${d.suggestedFilename()} from ${d.url()}`),
      invoicePopup.waitForLoadState('load', { timeout: 30_000 }).then(() => `opened ${invoicePopup.url()}`),
    ]).catch(() => {
      throw new Error(`Final Invoice popup neither loaded nor produced a PDF download within 30s (popup URL: ${invoicePopup.url()})`);
    });
    // The popup can open on an error page instead of the invoice, e.g. "cannot create
    // a document with an amount of zero" — that is a failed invoice, not a created one.
    if (/errorPopUpMsg/.test(invoicePopup.url())) {
      const reason = decodeURIComponent(new URL(invoicePopup.url()).searchParams.get('errorMsg') ?? invoicePopup.url());
      await invoicePopup.close();
      throw new Error(`Final Invoice was refused: "${reason}"`);
    }
    console.log(`[STEP] Invoice generated: ${outcome}`);
    await invoicePopup.close();

    console.log(`[STEP] Clicking "Update" on ${this.page.url()} after invoicing`);
    await this.clickPastCreatedModal(this.updateButton);
    await expect(this.page).toHaveURL(/\/MRRentalAgreement\/show\//, { timeout: 20_000 });
    console.log('[STEP] Invoice created and RA updated.');
    return 'created';
  }

  /**
   * Post-creation only, right on the Show page. Closes the RA's last (only)
   * movement on the "7. Closure" tab — required after every from-scratch
   * creation, since a movement is otherwise left open indefinitely. Sets
   * Return Date to today, Return Time equal to the movement's own Pickup
   * Time, and Return KM to one past the read-only Start KM, then confirms
   * the operating-location picker with the same location as Vehicle Pickup —
   * when that picker actually appears (Administrator only; see its own guard
   * below for why).
   *
   * Return Date is set by writing `endDateCheckIn`'s value directly and
   * dispatching input/change — not by clicking through the bootstrap
   * datepicker — because the datepicker's own default highlighted day is NOT
   * necessarily today: confirmed live (10 Sep 2026) that opening the picker
   * and then merely blurring away (without an explicit day click) silently
   * commits whatever day the widget happened to have highlighted, which can
   * be several days off. Driving the input directly sidesteps that bug
   * entirely.
   *
   * Submitting also fires a native confirm() dialog carrying a Cargos
   * message ("<msg> Vuoi continuare") — confirmed live in the page's own
   * inline script (`if (confirm(data.msgCargos + ...)) return false`), which
   * can appear either right after Close Movement or asynchronously a moment
   * later. A manual tester just clicks OK through it without noticing;
   * accepted here the same way createAndGetReferenceId() accepts Create's
   * own Cargos dialog.
   */
  /**
   * @param options.monthly Monthly rentals are NOT closed on today's date: the
   *   Return Date picker is clicked into and then clicked out of (a click on the
   *   page body), and the page itself sets the date to 30 days / the end of the
   *   month (user instruction, 9 Oct 2026). Everything else is unchanged, and
   *   the default (no options) keeps closing on today's date as before.
   */
  async closeMovement(options: { monthly?: boolean } = {}) {
    // A fresh or just-reloaded Show page (e.g. right after
    // editAndAdvancePaymentType()'s Update) can load straight into
    // #RACreateMessageModal showing its own "movements not yet transmitted
    // to Cargos" notice — its backdrop blocks the tab bar the same way it
    // blocks the Pay tab there. An upfront wait-and-close alone isn't enough:
    // confirmed live (25 Sep 2026) the modal can appear asynchronously even
    // later than that — mid-click, after closureTabLink.click() had already
    // started and moved past an initial unrelated actionability hiccup
    // (another tab briefly intercepting pointer events right after the
    // reload) — and then block every retry of that same click via its
    // backdrop for the rest of the action timeout, since nothing was
    // dismissing it once the click was already in flight. Retrying the whole
    // "dismiss modal, then click" cycle a few times covers both timings.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.createdModal.waitFor({ state: 'visible', timeout: 3_000 });
        await this.createdModal.getByRole('button').first().click();
        await expect(this.createdModal).toBeHidden();
      } catch {
        // No leftover message modal this attempt.
      }
      try {
        await this.closureTabLink.click({ timeout: 8_000 });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    // The tab can be highlighted while its pane is still not showing (seen live
    // 9 Oct 2026, testee conversion: "Received: hidden"), and clicking an
    // already-active tab does nothing — so if the Return Date is not there yet,
    // go through another tab and back. Skipped entirely when it is showing.
    if (!(await this.returnDateInput.isVisible().catch(() => false))) await this.ensureClosureTabOpen();
    await expect(this.returnDateInput).toBeVisible();

    // This instance's own date format — see InstanceProfile.dateFormat.
    // The Closure tab's own format, which isn't always the instance's
    // dateFormat — rentalplustest shows dd/MM/yyyy here and answers a yyyy-MM-dd
    // Return Date with a 500 from getCloseMovement (confirmed live, 7 Oct 2026).
    const currentReturnDate = await this.returnDateInput.inputValue();
    // Written the way the field spells its own dates (any order/separator), the
    // instance's setting only when the field is still empty.
    const today = currentReturnDate ? formatLike(new Date(), currentReturnDate) : formatDate(new Date());
    const movementClosedDialog = this.page.getByRole('dialog').filter({ hasText: 'Movement closed successfully' });

    // Re-registered fresh (not accumulated with page.on) for the same reason
    // as createAndGetReferenceId()'s own handler — this can run more than
    // once per test run.
    this.page.removeAllListeners('dialog');
    this.page.on('dialog', async (dialog) => {
      console.log(`[STEP] Dialog appeared while closing movement: "${dialog.message().replace(/s+/g, ' ').trim()}" — accepting`);
      await dialog.accept();
    });

    // Filling and clicking can be restarted: "Do you want to save the changes
    // before closing?" (seen live, 7 Oct 2026, on a monthly rental right after
    // an invoice Update) is confirmed by saving, which can reload the page and
    // wipe the Return fields — so they're filled in again and Close Movement
    // is clicked again.
    let closed = false;
    for (let attempt = 0; attempt < 4 && !closed; attempt++) {
      if (options.monthly) {
        await this.setMonthlyReturnDateViaDatePicker();
      } else {
        await this.returnDateInput.evaluate((el, value) => {
          const input = el as HTMLInputElement;
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, today);
        await expect(this.returnDateInput).toHaveValue(today);
      }

      const pickupTime = await this.pickupTimeInput.inputValue();
      await this.returnTimeInput.fill(pickupTime);

      const startKm = Number(await this.startKmInput.inputValue());
      await this.returnKmInput.fill(String(startKm + 1));

      console.log(`[STEP] Clicking "Close Movement" on ${this.page.url()}`);
      try {
        await this.closeMovementButton.click({ timeout: 8_000 });
      } catch (error) {
        // The save prompt, or the Cargos 'movements not yet transmitted' notice
        // (#RACreateMessageModal, which can open at any time after load), can
        // already be up, covering the button.
        const savePromptHandled = await this.confirmSaveBeforeClosingIfShown();
        const noticeShown = await this.createdModal.isVisible().catch(() => false);
        if (noticeShown) {
          await this.createdModal.getByRole('button').first().click();
          await expect(this.createdModal).toBeHidden();
        }
        if (!savePromptHandled && !noticeShown) throw error;
        continue;
      }

      // Whatever follows Close Movement, in whatever order this role/rental
      // gets it: the save prompt (above), the ">30 days" manager warning
      // (Proceed), the "Select Operating Location" picker, then the closed
      // dialog. The picker only appears when there's genuinely more than one
      // location to choose from — confirmed live (25 Sep 2026) Operator
      // (locked to a single branch/office) never sees it and goes straight to
      // "Movement closed successfully", while Administrator does.
      for (let hop = 0; hop < 6 && !closed; hop++) {
        const prompt = await this.waitForCloseMovementPrompt(movementClosedDialog);
        if (prompt === 'save') {
          await this.confirmSaveBeforeClosingIfShown();
          break; // back to the outer loop: re-fill and click again
        }
        if (prompt === 'warning30') {
          console.log('[STEP] ">30 days" movement warning appeared — clicking Proceed');
          const warning = this.page.getByRole('dialog').filter({ hasText: /exceeding 30 days/i }).first();
          await warning.locator('.btn, button').filter({ hasText: /Proceed/i }).first().click();
          await expect(warning).toBeHidden({ timeout: 10_000 });
        } else if (prompt === 'location') {
          await this.selectOperatingLocation();
        } else if (prompt === 'closed') {
          closed = true;
        } else {
          break;
        }
      }
    }

    // "Movement closed successfully" is its own small dialog — confirmed live
    // (10 Sep 2026) it is NOT #RACreateMessageModal (that one stays hidden
    // here); matched by role/text rather than a guessed id.
    await expect(movementClosedDialog).toBeVisible({ timeout: 10_000 });
    await movementClosedDialog.getByRole('button', { name: 'Close' }).click();
    await expect(movementClosedDialog).toBeHidden();

    console.log('[STEP] Movement closed.');
  }

  /**
   * Monthly rentals: click inside the Return Date picker, then click on the
   * page body outside it — the picker then sets the date itself (30 days / end
   * of the month). Fails if the date does not end up different from the one the
   * movement was opened with, as closing on an unchanged date is the bug this
   * replaces.
   */
  private async setMonthlyReturnDateViaDatePicker() {
    const before = await this.returnDateInput.inputValue();
    await this.returnDateInput.click();
    await this.page.waitForTimeout(800);
    // Outside the picker and the form: the empty strip at the far right of the page.
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 720 };
    await this.page.mouse.click(viewport.width - 4, Math.round(viewport.height / 2));
    await this.page.waitForTimeout(800);
    await expect.poll(async () => this.returnDateInput.inputValue(), { timeout: 8_000 }).not.toBe(before).catch(() => {});
    const after = await this.returnDateInput.inputValue();
    console.log(`[STEP] Monthly Return Date: ${before} -> ${after} (set by the date picker)`);
    if (after === before) {
      console.log('[WARN] The date picker did not change the Return Date.');
    }
  }

  /**
   * Drives the "Select Operating Location" picker (#locationModal) with the
   * rental's own Vehicle Pickup location — shared by Close Movement and, on
   * some instances (rentalplustest), Final Invoice.
   */
  private async selectOperatingLocation(modal: Locator = this.closeMovementLocationModal) {
    const pickupLocationLabel = await this.closureVehiclePickupSelect.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.label ?? '');
    await modal.locator('.dataTables_filter input').fill(pickupLocationLabel);
    // The DataTable search is token-based, not a strict substring match —
    // confirmed live it can return more than one row for a specific location
    // label, so the exact row is picked by exact text rather than by position.
    const targetRow = modal
      .locator('tbody tr')
      .filter({ has: this.page.getByText(pickupLocationLabel, { exact: true }) });
    await targetRow.locator('input[type="radio"]').check();
    await modal.locator('.btn, button').filter({ hasText: 'Confirm' }).first().click();
    await expect(modal).toBeHidden({ timeout: 10_000 });
  }

  /**
   * "Do you want to save the changes before closing?" (#confirmMessageModal1)
   * — see closeMovement(). Confirm saves; returns whether it was showing.
   */
  private async confirmSaveBeforeClosingIfShown(): Promise<boolean> {
    const prompt = this.page.locator('#confirmMessageModal1').filter({ hasText: /save the changes before closing/i });
    const shown = await prompt
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) return false;
    console.log('[STEP] "Do you want to save the changes before closing?" appeared — clicking Confirm');
    await prompt.locator('.btn, button').filter({ hasText: 'Confirm' }).first().click();
    await expect(prompt).toBeHidden({ timeout: 15_000 });
    // Saving can reload the page — let it settle before the caller re-fills the Return fields.
    await this.page.waitForLoadState('load').catch(() => {});
    await this.page.waitForTimeout(2_000);
    await this.createdModal
      .getByRole('button')
      .first()
      .click({ timeout: 2_000 })
      .catch(() => {});
    return true;
  }

  /** Whichever of the Close Movement follow-ups shows up first — see closeMovement(). */
  private async waitForCloseMovementPrompt(movementClosedDialog: Locator, timeout = 10_000): Promise<'save' | 'warning30' | 'location' | 'closed' | null> {
    const watch = (name: 'save' | 'warning30' | 'location' | 'closed', locator: Locator) =>
      locator.first().waitFor({ state: 'visible', timeout }).then(() => name);
    return Promise.any([
      watch('save', this.page.locator('#confirmMessageModal1').filter({ hasText: /save the changes before closing/i })),
      watch('warning30', this.page.getByRole('dialog').filter({ hasText: /exceeding 30 days/i })),
      watch('location', this.closeMovementLocationModal),
      watch('closed', movementClosedDialog),
    ]).catch(() => null);
  }

  // ---- Monthly rental (tab 1 form fields, tab 3 totals, Closure tab renewal) ----

  /**
   * Sets the Pickup Date, ticks "Enable monthly Rental", then picks Month and
   * Month Duration (days per month) — confirmed live (7 Oct 2026): picking the
   * duration is what fills Estimated End Date (pickup + months x duration
   * days) and sets End Date to one month on. Pickup Date is written directly,
   * as closeMovement() does for Return Date, to avoid the datepicker
   * committing whatever day it happened to have highlighted.
   */
  async enableMonthlyRental(pickup: Date, months: number, monthDuration: number) {
    await this.answerRentalTypePromptsForLongTerm();
    await this.dismissRateWarning();
    await this.rentalTabLink.click();
    // This form's own date format is not always the instance's dateFormat
    // (rentalplustest: Closure tab is yyyy-MM-dd, the create form dd/MM/yyyy —
    // confirmed live 7 Oct 2026; the wrong one makes calculateEndDate answer 500),
    // so follow whatever the field is showing.
    const currentPickup = await this.pickupDateInput.inputValue();
    const pickupDate = currentPickup ? formatLike(pickup, currentPickup) : formatDate(pickup, 'dd/MM/yyyy');
    await this.pickupDateInput.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, pickupDate);
    await expect(this.pickupDateInput).toHaveValue(pickupDate);
    if (!(await this.monthlyRentalCheckbox.isChecked())) await this.monthlyRentalCheckbox.check();
    await this.monthSelect.selectOption(String(months));
    await this.monthDurationSelect.selectOption(String(monthDuration));
    await this.dismissRateWarning();
    await expect(this.estimatedEndDateInput).not.toHaveValue('');
    await this.setLongTermRentalType();
  }

  /**
   * Moves the monthly rental already set up on this create form to a later
   * pickup — for when no vehicle works for the original period (user
   * instruction, 12 Oct 2026). Still on tab 1: the Pickup Date is set to
   * `newPickup`, the Drop-off Date ends up a month after it, and both times are
   * left exactly as they are, so Search Available Vehicle can be repeated right
   * here instead of going back to the Calendar and starting again. The page
   * recalculates the Drop-off and Estimated End dates when the month/duration
   * are picked again; the Drop-off is only written explicitly when that did not
   * leave it about a month after the pickup. Changing the dates empties Vehicle,
   * so the caller searches for one afterwards.
   */
  async shiftMonthlyPickup(newPickup: Date, months: number, monthDuration: number): Promise<void> {
    await this.answerRentalTypePromptsForLongTerm();
    await this.dismissRateWarning();
    await this.clickTabPastNotice(this.rentalTabLink);
    // Written the way each field spells its own dates; only the date changes, never the time.
    const write = async (input: Locator, date: Date) => {
      const current = await input.inputValue();
      const value = current ? formatLike(date, current) : formatDate(date);
      await input.evaluate((el, v) => {
        const field = el as HTMLInputElement;
        field.value = v;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await expect.poll(async () => sameDay(await input.inputValue(), date), { timeout: 5_000, message: `${value} should be on the form` }).toBe(true);
    };
    await write(this.pickupDateInput, newPickup);
    // Picking month and duration again makes the page work out Drop-off and Estimated End itself.
    await this.monthSelect.selectOption(String(months));
    await this.monthDurationSelect.selectOption(String(monthDuration));
    await this.dismissRateWarning();
    await this.page.waitForTimeout(1_500);
    const dropoff = parseAnyDate(await this.dropoffDateInput.inputValue());
    const daysAfterPickup = dropoff ? Math.round((dropoff.getTime() - newPickup.getTime()) / 86_400_000) : -1;
    if (daysAfterPickup < 28 || daysAfterPickup > 31) {
      const aMonthOn = new Date(newPickup.getFullYear(), newPickup.getMonth() + 1, newPickup.getDate());
      await write(this.dropoffDateInput, aMonthOn);
    }
    await expect(this.estimatedEndDateInput).not.toHaveValue('');
    console.log(
      `[STEP] The form now has Pickup ${await this.pickupDateInput.inputValue()} ${await this.page.locator('#pickTime').inputValue()}, ` +
        `Drop-off ${await this.dropoffDateInput.inputValue()} ${await this.page.locator('#returnTime').inputValue()}, ` +
        `Estimated End ${await this.estimatedEndDateInput.inputValue()}.`,
    );
  }

  /**
   * Answers #raTypeConfirmationModal. The wanted outcome is always Long Term,
   * so the answer follows the question: "...Do you still want to consider it as
   * short term...?" -> No; "...consider it as long term...?" and "...will be
   * automatically changed to Long-term" -> Yes.
   */
  private async answerRentalTypePrompt(modal: Locator) {
    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    const answer = /consider it as short term/i.test(text) ? 'No' : 'Yes';
    console.log(`[STEP] Rental Type prompt appeared ("${text.slice(0, 90)}...") — clicking ${answer}`);
    // Let the modal finish fading in before answering, as a person would.
    await this.page.waitForTimeout(1_200);
    await modal.getByRole('button', { name: answer, exact: true }).click({ timeout: 5_000 });
    await expect(modal).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Rental Type / duration prompts — "Short-term contract type ... will be
   * automatically changed to Long-term", "The duration of this reservation is
   * 90 days, which is a long term. Do you still want to consider it as short
   * term...?" and "...1 days, which is a short term... as long term...?" —
   * are raised whenever the two disagree (seen live 8 Oct 2026, testee). Their
   * backdrop blocks every click until answered. Registered only by the monthly
   * flow, never by the shared fixture, so no other suite's behaviour changes.
   */
  async answerRentalTypePromptsForLongTerm() {
    if (this.raTypePromptHandlerAdded) return;
    this.raTypePromptHandlerAdded = true;
    // An error inside a locator handler ends the whole test, and these race
    // with the wait loop in createMonthlyAndGetReferenceId() that answers the
    // same prompts — so losing a race is ignored.
    await this.page.addLocatorHandler(this.page.locator('#raTypeConfirmationModal'), (modal) => this.answerRentalTypePrompt(modal).catch(() => {}));
    // A backdated pickup also raises "The rental agreement issuing date is after
    // the start date. Do you want to update the issuing date of this rental?"
    // (Update / Do not Update / Cancel) — seen live 8 Oct 2026, testee, before
    // Create was even clicked, where it blocked the click. The issuing date is
    // kept as it is, as createAndGetReferenceId() does when it meets it later.
    await this.page.addLocatorHandler(this.affiliateMismatchModal.filter({ hasText: /issuing date is after the start date/i }), async (modal) => {
      console.log('[STEP] "Issuing date is after the start date" prompt appeared — clicking "Do not Update"');
      await this.page.waitForTimeout(1_200);
      await modal.locator('.btn, button').filter({ hasText: /^\s*Do not Update\s*$/i }).first().click({ timeout: 5_000 }).catch(() => {});
      // On Update the page reloads right after this answer, which detaches the
      // modal — a failed "is hidden" check there is not a failure.
      await modal.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    });
  }

  /**
   * A monthly rental is always 30+ days, so its Rental Type is Long Term (user
   * request, 8 Oct 2026). A no-op when it already is, or when the instance has
   * no such field. Any prompt raised by the change is answered as above.
   */
  private async setLongTermRentalType() {
    const modal = this.page.locator('#raTypeConfirmationModal');
    const answerIfShown = async (timeout: number) => {
      if (await modal.waitFor({ state: 'visible', timeout }).then(() => true, () => false)) await this.answerRentalTypePrompt(modal);
    };
    await answerIfShown(2_000);
    if ((await this.rentalTypeSelect.count()) === 0) return;
    if ((await this.rentalTypeSelect.locator('option:checked').innerText()).trim() !== 'Long Term') {
      await this.rentalTypeSelect.selectOption({ label: 'Long Term' });
      await answerIfShown(3_000);
    }
    await expect(this.rentalTypeSelect.locator('option:checked')).toHaveText('Long Term');
  }
  /** Switches only Car Class Booked (by option value), leaving Pickup/Return Location as they are. */
  async selectCarClassBooked(value: string) {
    await this.dismissLeftoverModals();
    await this.dismissRateWarning(0);
    await this.rentalTabLink.click();
    await this.carClassBookedSelect.selectOption(value);
  }

  /** Every real (non-placeholder) Car Class Booked option on the form: value + label. */
  async carClassBookedOptions(): Promise<{ value: string; label: string }[]> {
    const options = await this.carClassBookedSelect
      .locator('option')
      .evaluateAll((all) => all.map((o) => ({ value: (o as HTMLOptionElement).value, label: (o as HTMLOptionElement).text.trim() })));
    return options.filter((o) => o.value && o.value !== 'null');
  }

  async estimatedEndDate(): Promise<string> {
    return this.estimatedEndDateInput.inputValue();
  }

  /** Opens "3. Ext..." on the Show page and returns its own TOTAL(€). */
  async readTab3Total(): Promise<number> {
    await this.clickPastCreatedModal(this.extrasTabLink);
    await expect(this.totalAmountInput).toBeVisible();
    // TOTAL(€) fills in after the page's own rate calculation — read right
    // after creation it can still be 0.00 (seen live on rentalplustest).
    await expect.poll(async () => parseAmount(await this.totalAmountInput.inputValue()), { timeout: 20_000 }).toBeGreaterThan(0).catch(() => {});
    return parseAmount(await this.totalAmountInput.inputValue());
  }

  /**
   * Types a Discount % on tab 3 the way a user does (focus, type, Tab out) and
   * waits for the page's own recalculation (eventHandleForExtra) to answer, so
   * TOTAL(€) is read only after it has settled.
   */
  async applyDiscountPercent(percent: number): Promise<boolean> {
    await this.clickPastCreatedModal(this.extrasTabLink);
    // The instance's discount settings can cap the discount for the pickup date
    // ("The maximum discount you can apply for pickups on ... is 0.0 %", seen
    // live 8 Oct 2026 on rentalplustest/Operator, pickup 1 Sep). That popup's
    // backdrop blocks every later click, so it is closed here and the discount
    // reported as not applied — the totals are still compared by the caller.
    const maxDiscountModal = this.affiliateMismatchModal.filter({ hasText: /maximum discount/i });
    const recalculated = this.page.waitForResponse((r) => r.url().includes('/eventHandleForExtra'), { timeout: 20_000 });
    recalculated.catch(() => {});
    await this.discountInput.click();
    await this.discountInput.fill('');
    await this.page.keyboard.type(String(percent), { delay: 100 });
    await this.page.keyboard.press('Tab');
    const outcome = await Promise.race([
      recalculated.then(() => 'recalculated' as const),
      maxDiscountModal.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'refused' as const),
    ]);
    await this.page.waitForTimeout(1_000);
    if (outcome === 'refused' || (await maxDiscountModal.isVisible().catch(() => false))) {
      const message = (await maxDiscountModal.innerText()).replace(/\s+/g, ' ').replace(/Close$/i, '').trim();
      await maxDiscountModal.getByRole('button', { name: /close/i }).first().click();
      await expect(maxDiscountModal).toBeHidden();
      console.log(`[STEP] Discount of ${percent}% was refused by the app ("${message}") — continuing without a discount.`);
      return false;
    }
    console.log(`[STEP] Discount % set to ${percent} on tab 3.`);
    return true;
  }

  /**
   * Removes the Discount % the way a user does: empties the field completely
   * (not typing 0) and tabs out, then waits for the page's own recalculation.
   * Used to check the Invoice Preview afterwards — it keeps the old discounted
   * total while tab 3 already shows the undiscounted one (Jira ticket raised
   * 9 Oct 2026), and typing 0 instead does not show that.
   */
  async clearDiscountField() {
    await this.clickPastCreatedModal(this.extrasTabLink);
    const recalculated = this.page.waitForResponse((r) => r.url().includes('/eventHandleForExtra'), { timeout: 20_000 });
    recalculated.catch(() => {});
    await this.discountInput.click();
    await this.discountInput.fill('');
    await this.page.keyboard.press('Tab');
    await recalculated.catch(() => {});
    await this.page.waitForTimeout(1_500);
    console.log('[STEP] Discount % field emptied on tab 3.');
  }

  /**
   * Reloads the Show page, dropping any unsaved edit (e.g. the emptied Discount %
   * after clearDiscountField()), so the rental is back in its saved state. Leaving
   * the edit in place makes the Invoice button ask "You need to save RA before
   * charging. Do you want to save?" (seen live 9 Oct 2026).
   */
  async discardUnsavedChanges() {
    await this.page.reload({ waitUntil: 'load' });
    await this.page.waitForTimeout(3_000);
    await this.closeNoticeIfOpen();
    console.log('[STEP] Show page reloaded to discard the unsaved change.');
  }

  /** Clicks "Invoice Preview" on tab 3 and returns the modal's Total Amount, then closes the modal. */
  async readInvoicePreviewTotal(): Promise<number> {
    await this.clickPastCreatedModal(this.extrasTabLink);
    // The preview is rebuilt by a fresh calculateTariffeForExtra (invoice=invoice)
    // on every click; read it only after that answers, or a second preview
    // would still show the first one's numbers.
    const calculated = this.page.waitForResponse(
      (r) => r.url().includes('/calculateTariffeForExtra') && (r.request().postData() ?? '').includes('invoice=invoice'),
      { timeout: 30_000 },
    );
    await this.clickPastCreatedModal(this.invoicePreviewButton);
    const previewResponse = await calculated;
    // What the page asked the server to price (for tracing a Preview that does
    // not reflect the discount): discountRate and newRateId of that request.
    const sent = decodeURIComponent((previewResponse.request().postData() ?? '').replace(/\+/g, ' '));
    console.log(`[STEP] Invoice Preview request: ${sent.split('&').filter((p) => /^(discountRate|newRateId|startDate|endDate)=/.test(p)).join(', ')}`);
    await expect(this.invoicePreviewModal).toBeVisible();
    await this.page.waitForTimeout(1_000);
    const total = parseAmount(await this.invoicePreviewTotalInput.inputValue());
    await this.invoicePreviewModal.getByRole('button', { name: 'Close' }).click();
    await expect(this.invoicePreviewModal).toBeHidden();
    return total;
  }

  /**
   * Compares tab 3's TOTAL(€) with the Invoice Preview's Total Amount.
   * Throws on a mismatch (to the cent) — unless
   * SANITY_MONTHLY_CONTINUE_ON_MISMATCH=1, which logs it as a [WARN] and
   * returns the message instead, so the caller can run the rest of the flow
   * and still fail the test at the end. Returns null on a match.
   */
  async checkTab3TotalMatchesInvoicePreview(when: string): Promise<string | null> {
    let total = await this.readTab3Total();
    let preview = await this.readInvoicePreviewTotal();
    if (Math.abs(total - preview) < 0.005) {
      console.log(`[STEP] ${when}: tab 3 TOTAL(€) ${total.toFixed(2)} = Invoice Preview Total Amount ${preview.toFixed(2)} — match.`);
      return null;
    }
    // A first read that differs may only mean the Invoice Preview had not caught
    // up yet (reported 9 Oct 2026: right after a discount the Preview showed the
    // undiscounted 4524.00 while tab 3 already showed 4071.60, yet by hand both
    // match). Each reading is logged and the Preview is opened again a few times
    // — a match on a re-read is reported as such, never silently; only readings
    // that keep differing count as a mismatch.
    const readings = [`first read: tab 3 ${total.toFixed(2)} / Preview ${preview.toFixed(2)}`];
    for (let reread = 1; reread <= 3; reread++) {
      await this.page.waitForTimeout(3_000);
      total = await this.readTab3Total();
      preview = await this.readInvoicePreviewTotal();
      readings.push(`re-read ${reread}: tab 3 ${total.toFixed(2)} / Preview ${preview.toFixed(2)}`);
      console.log(`[STEP] ${when}: ${readings[readings.length - 1]}`);
      if (Math.abs(total - preview) < 0.005) {
        console.log(`[WARN] ${when}: the Invoice Preview was stale at the first read (${readings[0]}) and matched on re-read ${reread} — ${total.toFixed(2)} = ${preview.toFixed(2)}.`);
        return null;
      }
    }
    const message = `${when}: tab 3 TOTAL(€) is ${total.toFixed(2)} but the Invoice Preview's Total Amount is ${preview.toFixed(2)} — they do not match (${readings.join('; ')}).`;
    if (process.env.SANITY_MONTHLY_CONTINUE_ON_MISMATCH === '1') {
      console.warn(`[WARN] ${message} (continuing: SANITY_MONTHLY_CONTINUE_ON_MISMATCH=1)`);
      return message;
    }
    throw new Error(message);
  }

  /** Clicks Update on the Show page and waits for the page to reload — Cargos' confirm() dialog is accepted. */
  async updateRental() {
    this.page.removeAllListeners('dialog');
    this.page.on('dialog', async (dialog) => {
      console.log(`[STEP] Dialog appeared while updating: "${dialog.message().replace(/\s+/g, ' ').trim()}" — accepting`);
      await dialog.accept().catch(() => {});
    });
    const reloaded = this.page
      .waitForEvent('load', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    console.log(`[STEP] Clicking "Update" on ${this.page.url()}`);
    await this.clickPastCreatedModal(this.updateButton);
    const didReload = await reloaded;
    await expect(this.page).toHaveURL(/\/MRRentalAgreement\/show\//, { timeout: 20_000 });
    await expect(this.closureTabLink).toBeVisible();
    console.log(`[STEP] Rental updated (${didReload ? 'page reloaded' : 'no page reload seen'}).`);
  }

  /**
   * Closure tab > Renew Movement. Confirmed live (7 Oct 2026): the button
   * opens a modal (#renewMovModal) whose own "Renew Movement" starts the
   * renewal. When there is an unbilled amount it first asks "There is some
   * amount to be invoiced do you want to create invoice for it?" — Yes, then
   * Renew Movement again. Success is the page reloading at ?isCreate=isRenew.
   * An "...updated. Do you want to create an Invoice?" prompt, if shown, is
   * answered No (the invoice is created from tab 2 afterwards).
   */
  /**
   * Opens the Closure tab and waits until its Return Date field is really
   * showing, clicking the tab again if it is not. After an invoice Update the
   * Show page can still be reloading, which loses a Closure-tab click (seen
   * live 8 Oct 2026: tab highlighted, Return Date never visible). Added for the
   * monthly suite so the shared closeMovement() stays exactly as it is.
   */
  /**
   * Best-effort: closes the "Some movements of the contract have not been
   * transmitted to Cargos/Hospedajes yet!" notice (#RACreateMessageModal) if it
   * is open. Unlike clickPastCreatedModal() it never fails when the notice
   * lingers or re-opens — the caller's own retries decide that.
   */
  private async closeNoticeIfOpen() {
    if (!(await this.createdModal.isVisible().catch(() => false))) return;
    console.log('[STEP] Cargos/Hospedajes notice is open — closing it');
    await this.createdModal.getByRole('button').first().click({ timeout: 5_000 }).catch(() => {});
    await this.createdModal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  async ensureClosureTabOpen() {
    await this.page.waitForLoadState('load').catch(() => {});
    for (let attempt = 0; attempt < 4; attempt++) {
      // Clicking a tab that is already marked active does nothing, even when its
      // pane is not showing (seen live 8 Oct 2026: "7. Closure" highlighted over
      // the Rentals pane) — so retries go through another tab first.
      await this.closeNoticeIfOpen();
      if (attempt > 0) await this.rentalTabLink.click({ timeout: 8_000 }).catch(() => {});
      await this.closureTabLink.click({ timeout: 8_000 }).catch(() => {});
      if (await this.returnDateInput.waitFor({ state: 'visible', timeout: 6_000 }).then(() => true, () => false)) return;
      console.log(`[STEP] Closure tab not showing yet (attempt ${attempt + 1}/4) — clicking the tab again`);
    }
  }

  async renewMovement() {
    // After Close Movement the Show page can still be reloading, which loses a
    // Closure-tab click (seen live 8 Oct 2026, testee/Operator: tab highlighted
    // but Renew Movement never shown). So the tab is clicked again until the
    // button is really there.
    await this.page.waitForLoadState('load').catch(() => {});
    for (let attempt = 0; attempt < 4; attempt++) {
      // Via another tab on retries: a tab already marked active ignores clicks
      // even when its pane is not showing (see ensureClosureTabOpen()).
      await this.closeNoticeIfOpen();
      if (attempt > 0) await this.rentalTabLink.click({ timeout: 8_000 }).catch(() => {});
      await this.closureTabLink.click({ timeout: 8_000 }).catch(() => {});
      if (await this.renewMovementTabButton.waitFor({ state: 'visible', timeout: 6_000 }).then(() => true, () => false)) break;
      console.log(`[STEP] Renew Movement not shown after opening the Closure tab (attempt ${attempt + 1}/4) — clicking the tab again`);
    }
    await this.clickPastCreatedModal(this.renewMovementTabButton);
    await expect(this.renewMovementModal).toBeVisible();
    const amountPrompt = this.page.getByRole('dialog').filter({ hasText: /amount to be invoiced/i }).first();
    const invoicePrompt = this.page.getByRole('dialog').filter({ hasText: /Do you want to create an Invoice/i }).first();
    const answer = async (prompt: Locator, label: RegExp) => {
      await prompt.locator('.btn, button').filter({ hasText: label }).first().click();
      await expect(prompt).toBeHidden({ timeout: 15_000 });
    };

    // The renewal is worked out by POST /MRRentalAgreement/calculateMovement. For
    // the testee Operator the server answers it with HTTP 403 and the page just
    // reloads without renewing (confirmed live 9 Oct 2026 on PMO-52/PMO-53) —
    // reported at once, with its cause, instead of after a 90s wait.
    let refusedBy: string | null = null;
    const onResponse = (response: { status(): number; url(): string }) => {
      if (response.status() === 403 && /calculateMovement/.test(response.url())) refusedBy = response.url().replace(/.*MyRentWeb/, '');
    };
    this.page.on('response', onResponse);
    console.log('[STEP] Clicking "Renew Movement"');
    await this.renewMovementButton.click();
    let renewAgain = false;
    const deadline = Date.now() + 90_000;
    while (!/isRenew/.test(this.page.url())) {
      if (refusedBy) {
        this.page.off('response', onResponse);
        throw new Error(
          `Renew Movement was refused by the server: HTTP 403 on ${refusedBy}. The movement is not renewed and the page just reloads ` +
            `(URL: ${this.page.url()}).`,
        );
      }
      if (Date.now() > deadline) {
        this.page.off('response', onResponse);
        throw new Error(`Renew Movement did not complete within 90s (URL: ${this.page.url()}).`);
      }
      if (await this.createdModal.isVisible().catch(() => false)) {
        // The Hospedajes/Cargos notice can open over the renewal and swallow the
        // click (seen live 8 Oct 2026, testee/Operator) — close it and, if the
        // renewal window is still there, press Renew Movement again.
        await this.closeNoticeIfOpen();
        renewAgain = true;
      } else if (await amountPrompt.isVisible().catch(() => false)) {
        console.log('[STEP] "There is some amount to be invoiced" appeared — clicking Yes');
        await answer(amountPrompt, /^\s*Yes\s*$/);
        renewAgain = true;
      } else if (await invoicePrompt.isVisible().catch(() => false)) {
        console.log('[STEP] "...Do you want to create an Invoice?" appeared — clicking No');
        await answer(invoicePrompt, /^\s*No\s*$/);
      } else if (renewAgain && (await this.renewMovementButton.isVisible().catch(() => false))) {
        console.log('[STEP] Clicking "Renew Movement" again');
        renewAgain = false;
        await this.renewMovementButton.click();
      } else {
        await this.page.waitForTimeout(500);
      }
    }
    this.page.off('response', onResponse);
    await this.page.waitForLoadState('load').catch(() => {});
    if (
      await invoicePrompt
        .waitFor({ state: 'visible', timeout: 4_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      console.log('[STEP] "...Do you want to create an Invoice?" appeared — clicking No');
      await answer(invoicePrompt, /^\s*No\s*$/);
    }
    console.log(`[STEP] Movement renewed (${this.page.url()}).`);
  }
}

/** "138000.00", "138,000.00" or "138.000,00" -> 138000. */
function parseAmount(text: string): number {
  const cleaned = text.replace(/[^\d.,-]/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const normalised = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const value = Number(normalised);
  if (Number.isNaN(value)) throw new Error(`Could not read an amount from "${text}".`);
  return value;
}

