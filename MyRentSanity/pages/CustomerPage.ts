import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { sameDay } from '../utils/dates';

/**
 * The "Create Customer" form (/MyRentWeb/MRBusinessPartner/create) — MyRent's
 * CRM contact record, which doubles as a Driver record when "Is Driver" is
 * ticked. Two tabs matter here: "Details" (#id1, the default) and
 * "Notes /Other Info" (#id3, holds the two Driver Information document
 * blocks). Field ids below are the form's real ones, confirmed live.
 */
export class CustomerPage extends BasePage {
  readonly detailsTabLink: Locator;
  readonly notesOtherInfoTabLink: Locator;
  readonly notesOtherInfoPane: Locator;
  readonly isCustomerCheckbox: Locator;
  readonly personEntityRadio: Locator;
  readonly isDriverCheckbox: Locator;
  /**
   * The portlet wrapping both Driver Information blocks — shown/hidden by
   * "Is Driver", independently of which tab is active (confirmed live: its
   * own `display` toggles correctly even while its ancestor "Notes /Other
   * Info" tab-pane is itself inactive/hidden). See ensureIsDriverToggleApplied().
   */
  readonly driverInfoPortlet: Locator;
  readonly typeOfCustomerSelect: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly streetInput: Locator;
  readonly streetNumberInput: Locator;
  readonly countryInput: Locator;
  readonly cityInput: Locator;
  readonly provinceInput: Locator;
  readonly postalCodeInput: Locator;
  readonly mobileInput: Locator;
  readonly emailInput: Locator;
  readonly genderMaleRadio: Locator;
  readonly birthNationInput: Locator;
  readonly birthDateInput: Locator;
  readonly birthProvInput: Locator;
  readonly birthPlaceInput: Locator;
  /** First Driver Information block — defaults to "DRIVER'S LICENSE" on a fresh form; left untouched by design. */
  readonly licenseDocumentNumbInput: Locator;
  readonly licenseTypeInput: Locator;
  readonly licenseIssueByInput: Locator;
  readonly licenseReleaseDateInput: Locator;
  readonly licenseExpiryDateInput: Locator;
  /** Second Driver Information block — "Document" here is a free-text field backed by a <datalist>, not a <select>. */
  readonly secondDocumentInput: Locator;
  readonly secondDocumentNumbInput: Locator;
  readonly secondIssueByInput: Locator;
  readonly secondReleaseDateInput: Locator;
  readonly secondExpiryDateInput: Locator;
  /**
   * Both "Issue By" inputs are read-only in the DOM — confirmed live they're
   * populated exclusively through a "CARGOS" lookup modal (opened by the
   * search-icon button next to each), never by typing directly into them.
   * Each modal has its own Country autocomplete (same widget as Country/Birth
   * Nation) and a City field that the page's own `setIssueBy()` handler
   * silently ignores unless Country is Italy (confirmed live from its
   * source) — so only Country needs to be selected before Confirm.
   */
  readonly cargosIssueByButton: Locator;
  readonly issueByCargosCountryInput: Locator;
  readonly issueByCargosConfirmButton: Locator;
  readonly cargosIssueBy1Button: Locator;
  readonly issueBy1CargosCountryInput: Locator;
  readonly issueBy1CargosConfirmButton: Locator;
  readonly createButton: Locator;
  readonly successBanner: Locator;

  constructor(page: Page) {
    super(page);
    this.detailsTabLink = page.locator('a[href="#id1"]');
    this.notesOtherInfoTabLink = page.locator('a[href="#id3"]');
    this.notesOtherInfoPane = page.locator('#id3');
    this.isCustomerCheckbox = page.locator('#isClient');
    this.personEntityRadio = page.locator('#personEntity');
    this.isDriverCheckbox = page.locator('#isDriver');
    this.driverInfoPortlet = page.locator('#ForDriverInfo');
    this.typeOfCustomerSelect = page.locator('#typeOfCustomer');
    this.firstNameInput = page.locator('#name');
    this.lastNameInput = page.locator('#surname');
    this.streetInput = page.locator('#street');
    this.streetNumberInput = page.locator('#number');
    this.countryInput = page.locator('#national');
    this.cityInput = page.locator('#city');
    this.provinceInput = page.locator('#province');
    this.postalCodeInput = page.locator('#postalCode');
    this.mobileInput = page.locator('#phoneNumb1');
    this.emailInput = page.locator('#mail');
    this.genderMaleRadio = page.locator('#genderMale');
    this.birthNationInput = page.locator('#birthNation');
    this.birthDateInput = page.locator('#birthDate');
    this.birthProvInput = page.locator('#birthProv');
    this.birthPlaceInput = page.locator('#birthPlace');
    this.licenseDocumentNumbInput = page.locator('#documentNumb');
    this.licenseTypeInput = page.locator('#drivingLicense');
    this.licenseIssueByInput = page.locator('#issueBy');
    this.licenseReleaseDateInput = page.locator('#releaseDate');
    this.licenseExpiryDateInput = page.locator('#expiryDate');
    this.secondDocumentInput = page.locator('#document21');
    this.secondDocumentNumbInput = page.locator('#documentNumb1');
    this.secondIssueByInput = page.locator('#issueBy1');
    this.secondReleaseDateInput = page.locator('#releaseDate1');
    this.secondExpiryDateInput = page.locator('#expiryDate1');
    this.cargosIssueByButton = page.locator('#cargosIssueBy');
    this.issueByCargosCountryInput = page.locator('#nationalCargosPat');
    this.issueByCargosConfirmButton = page.locator('#issueByManagement button.btn-success');
    this.cargosIssueBy1Button = page.locator('#cargosIssueBy1');
    this.issueBy1CargosCountryInput = page.locator('#nationalCargosDoc1');
    this.issueBy1CargosConfirmButton = page.locator('#issueByManagement1 button.btn-success');
    this.createButton = page.locator('#create');
    this.successBanner = page.locator('.note-success');
  }

  /**
   * Country and Birth Nation share the same custom widget: typing fires a
   * client-side (no network call) filter into a sibling
   * `#<fieldId>autocomplete-list` div, and only a real click on the
   * suggestion actually commits the value — setting the input's value
   * directly leaves the field looking filled but uncommitted. Needs
   * `pressSequentially` specifically: the widget listens for `keypress`,
   * which a plain `.fill()` never fires.
   */
  private async selectFromCountryAutocomplete(input: Locator, listId: string, searchTerm: string, exactLabel: string) {
    await input.fill('');
    await input.pressSequentially(searchTerm);
    const suggestion = this.page.locator(`#${listId} div`).filter({ hasText: exactLabel }).first();
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await suggestion.click();
    // Seen live (7 Oct 2026, rentalplustest): the click can leave the typed text uncommitted — fall back to the keyboard.
    const committed = await expect(input).toHaveValue(exactLabel, { timeout: 3_000 }).then(() => true, () => false);
    if (!committed) {
      await input.press('ArrowDown');
      await input.press('Enter');
    }
    await expect(input).toHaveValue(exactLabel);
  }

  /**
   * Birth Date, Release Date, and Expiry Date (all four of them) are bound to
   * bootstrap-datepicker (`.date-picker` class, confirmed live) — a plain
   * `.fill()` sets the raw DOM value, which looks filled right up until the
   * field loses focus, at which point the widget's own blur handler wipes it
   * back to empty because its *internal* selected-date state was never
   * updated (only real calendar clicks or the widget's own API update that).
   * Confirmed live this is exactly why Birth Date / Release Date / Expiry
   * Date all showed up blank on the created record despite the form
   * appearing filled during the run. Driving the widget's own `setDate` API
   * keeps its internal state in sync, so the value survives blur and submit.
   */
  private async fillDatepicker(input: Locator, isoDate: string) {
    // Test data stays ISO (yyyy-MM-dd). The widget parses a *string* in its own
    // format only, which is not necessarily the instance's dateFormat — an ISO
    // string was misparsed into a nonsense date ("1971-11-11" became
    // "24/03/17" on giffitest, 6 Oct 2026; "2000-06-02" became "21/11/7" on
    // rentalplustest, 9 Oct 2026). A Date object is spelled by the widget itself
    // in whatever format it uses, so it is passed instead, and the result is
    // checked as the same calendar day, not as one particular spelling.
    const [year, month, day] = isoDate.split('-').map(Number);
    const wanted = new Date(year, month - 1, day);
    await input.evaluate(
      (el, [y, m, d]) => {
        (window as any).$(el).datepicker('setDate', new Date(y, m, d));
      },
      [wanted.getFullYear(), wanted.getMonth(), wanted.getDate()],
    );
    await expect
      .poll(async () => sameDay(await input.inputValue(), wanted), { message: `date field should show ${isoDate} (in whatever format it uses)`, timeout: 5_000 })
      .toBe(true);
  }

  /** City autocomplete: its list (getCities) only loads once Country is ITALIA, and arrives on first focus. */
  private async selectItalianCity(city: string) {
    const citiesLoaded = this.page.waitForResponse((res) => res.url().includes('getCities'), { timeout: 10_000 });
    await this.cityInput.click();
    await citiesLoaded;
    // Typed slowly (unlike Country): the city list is rebuilt per keypress and
    // a fast burst leaves it empty (confirmed live, 7 Oct 2026).
    await this.cityInput.fill('');
    await this.cityInput.pressSequentially(city, { delay: 150 });
    const suggestion = this.page.locator('#cityautocomplete-list div').filter({ hasText: city.toUpperCase() }).first();
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await suggestion.click();
    await expect(this.cityInput).toHaveValue(city.toUpperCase());
  }

  async selectCountry(searchTerm: string, exactLabel: string) {
    await this.selectFromCountryAutocomplete(this.countryInput, 'nationalautocomplete-list', searchTerm, exactLabel);
  }

  async selectBirthNation(searchTerm: string, exactLabel: string) {
    await this.selectFromCountryAutocomplete(this.birthNationInput, 'birthNationautocomplete-list', searchTerm, exactLabel);
  }

  async selectTypeOfCustomer(exactLabel: string) {
    await this.typeOfCustomerSelect.selectOption({ label: exactLabel });
  }

  /**
   * Ticks "Is Driver" and confirms it actually took effect — checked, not
   * just assumed — before moving on. Confirmed live: the checkbox itself is
   * always visible/clickable, so `.check()` always "succeeds", but the page's
   * own JS handler that shows the driver-info portlet isn't necessarily
   * bound yet this early in the page's life (its markup renders before all
   * of the page's scattered inline `$(document).ready(...)` scripts finish),
   * so an early click can flip the checkbox's native `checked` state without
   * the portlet ever showing. Checking `driverInfoPortlet`'s own computed
   * `display` directly (rather than Playwright's `toBeVisible()`) matters
   * here specifically because this runs on the Details tab, before switching
   * to Notes/Other Info — the portlet's ancestor tab-pane is inactive at this
   * point, which would make `toBeVisible()` report false regardless of the
   * portlet's own state. Fixing this here, before ever leaving the Details
   * tab, means fillDriverInformation() never has to discover the problem
   * several fields deep and pay for a full tab round-trip to recover from it.
   * A user-observed run still hit the old failure mode (tab2, missing,
   * back to Details, retry, tab2 again) despite this check, even though
   * several repro attempts here (including one logging state after every
   * single field in fillDetails(), headed and headless) never reproduced a
   * reset — most likely because the dashboard's own Node process competes
   * for CPU with the test browser in a way an isolated CLI run doesn't.
   * Since the exact trigger couldn't be pinned down, this now polls for up
   * to 2s (Playwright's own retrying `toHaveCSS`) instead of reading once,
   * so it self-corrects regardless of the precise cause — still far faster
   * than the tab round-trip this replaces.
   */
  private async ensureIsDriverToggleApplied() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.isDriverCheckbox.check();
      try {
        await expect(this.driverInfoPortlet).not.toHaveCSS('display', 'none', { timeout: 2_000 });
        return;
      } catch {}
      console.log(`[STEP] Attempt ${attempt}/3: "Is Driver" didn't show the Driver Information portlet — retrying`);
      await this.isDriverCheckbox.uncheck();
    }
    throw new Error('"Is Driver" never showed the Driver Information portlet after 3 attempts.');
  }

  /**
   * Fills the "Details" tab (#id1, the default tab): keeps "Is Customer"
   * checked (already on by default), selects Person Entity, ticks Is
   * Driver, and fills identity/address/birth fields. Country and Birth
   * Nation go through the autocomplete widget above; City's own equivalent
   * widget only matches a fixed municipality list (confirmed live — it
   * never returned a match for a non-Italian city), so it's deliberately
   * left untouched here rather than guessing at a value it might reject.
   */
  async fillDetails(details: {
    firstName: string;
    lastName: string;
    street: string;
    streetNumber: string;
    countrySearchTerm: string;
    country: string;
    province: string;
    postalCode: string;
    mobile: string;
    email: string;
    birthNationSearchTerm: string;
    birthNation: string;
    birthDate: string;
    birthProv: string;
    birthPlace: string;
    /** Optional — only Country ITALIA has a City list (confirmed live 7 Oct 2026, rentalplustest: a Rental Agreement refuses a customer with no City). */
    city?: string;
    /** Clicks SSN "Compute" after the birth fields are filled — needed where the Rental Agreement rejects a customer without a formally valid Codice Fiscale (rentalplustest). */
    computeTaxCode?: boolean;
  }) {
    await expect(this.isCustomerCheckbox).toBeChecked();
    await this.personEntityRadio.check();
    await this.ensureIsDriverToggleApplied();
    await this.selectTypeOfCustomer('Customer');

    await this.firstNameInput.fill(details.firstName);
    await this.lastNameInput.fill(details.lastName);
    await this.streetInput.fill(details.street);
    await this.streetNumberInput.fill(details.streetNumber);
    // Selecting Country resets Province/Postal Code (confirmed live), so it
    // must run before those two, not after.
    await this.selectCountry(details.countrySearchTerm, details.country);
    if (details.city) {
      // Picking an Italian city fills Province (turns into a <select>) and Postal Code itself.
      await this.selectItalianCity(details.city);
    } else {
      await this.provinceInput.fill(details.province);
      await this.postalCodeInput.fill(details.postalCode);
    }
    await this.mobileInput.fill(details.mobile);
    await this.emailInput.fill(details.email);
    await this.genderMaleRadio.check();
    await this.selectBirthNation(details.birthNationSearchTerm, details.birthNation);
    await this.fillDatepicker(this.birthDateInput, details.birthDate);
    await this.birthProvInput.fill(details.birthProv);
    await this.birthPlaceInput.fill(details.birthPlace);
    if (details.computeTaxCode) {
      await this.page.locator('#taxcode').click();
      await expect(this.page.locator('#updateTaxcode')).not.toHaveValue('', { timeout: 10_000 });
    }

    // Confirmed live (2 Sep 2026): checking right after ticking "Is Driver"
    // isn't the whole story — a run was caught where that check passed, yet
    // the portlet was hidden again by the time fillDriverInformation() got to
    // it, meaning something later in this method (most likely the Country or
    // Birth Nation autocomplete, the two steps with the most page-side JS
    // activity) can still undo it. Re-checking here, one more time, right
    // before this method returns, catches that while still on the Details
    // tab — same cheap, local fix, just also applied at the point that
    // actually matters: immediately before the caller leaves this tab.
    await this.ensureIsDriverToggleApplied();
  }

  /**
   * The tab switch itself is a Bootstrap `data-toggle="tab"` fade — clicking
   * the link doesn't apply the pane's `active`/`in` classes synchronously
   * (confirmed live: right after the click, the pane's classList and
   * `display` are still unchanged), so a bare click-then-fill can race it.
   * `.fill()`'s own auto-wait normally absorbs a short fade like this, but
   * retrying the click itself is cheap insurance against the one case that
   * doesn't: the click landing before whatever wires up the handler is
   * ready, which no amount of waiting *after* a single click recovers from.
   */
  private async switchToNotesOtherInfoTab() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.notesOtherInfoTabLink.click();
      try {
        await expect(this.notesOtherInfoPane).toHaveClass(/\bactive\b/, { timeout: 5_000 });
        return;
      } catch {
        console.log(`[STEP] Attempt ${attempt}/3 to switch to the "Notes /Other Info" tab didn't take — retrying`);
      }
    }
    throw new Error('Could not switch to the "Notes /Other Info" tab after 3 attempts.');
  }

  /**
   * Last-resort backstop for the Driver Information fields' visibility.
   * fillDetails()'s own ensureIsDriverToggleApplied() now catches and fixes
   * the actual cause of this (the "Is Driver" toggle not applying) before
   * ever leaving the Details tab, so this should rarely if ever fire — kept
   * only as cheap insurance. Since the real fix lives upstream, this stays
   * fast on purpose rather than generous: 2s is enough to catch a field
   * that's already there, and anything genuinely stuck needs the full
   * re-assert-and-retry below, not a longer wait for the same check.
   */
  private async ensureDriverInformationVisible() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await expect(this.licenseDocumentNumbInput).toBeVisible({ timeout: 2_000 });
        return;
      } catch {
        console.log(
          `[STEP] Attempt ${attempt}/3: Driver Information fields still hidden — re-asserting "Is Driver" and retrying`,
        );
        await this.detailsTabLink.click();
        await this.isDriverCheckbox.uncheck();
        await this.isDriverCheckbox.check();
        await this.switchToNotesOtherInfoTab();
      }
    }
    throw new Error('Driver Information fields never became visible after re-asserting "Is Driver" 3 times.');
  }

  /**
   * Opens an "Issue By" CARGOS lookup modal, selects Country through its
   * autocomplete, and confirms — the only way to populate a read-only Issue
   * By input (see the field comments above). The Confirm handler only reads
   * the modal's City field when Country is Italy, so nothing is typed there.
   */
  private async setIssueByViaCargosModal(
    openButton: Locator,
    countryInput: Locator,
    countryListId: string,
    confirmButton: Locator,
    resultInput: Locator,
    countrySearchTerm: string,
    countryExactLabel: string,
  ) {
    // Confirmed live (1 Oct 2026, release 26.09.29): the CARGOS lookup button
    // is gone from the Create Customer form and "Issue By" is now a plain
    // editable input — waiting on the button just timed out. Fill the input
    // directly when the button isn't there; the modal path below stays for
    // environments still on the older markup.
    if ((await openButton.count()) === 0) {
      await resultInput.fill(countryExactLabel);
      await expect(resultInput).toHaveValue(countryExactLabel, { timeout: 5_000 });
      return;
    }
    await openButton.click();
    await this.selectFromCountryAutocomplete(countryInput, countryListId, countrySearchTerm, countryExactLabel);
    await confirmButton.click();
    await expect(resultInput).toHaveValue(countryExactLabel, { timeout: 5_000 });
  }

  /**
   * Fills both "Driver Information" blocks on the "Notes /Other Info" tab.
   * The first block's Document select already defaults to "DRIVER'S
   * LICENSE" on a fresh form — deliberately left untouched, matching how
   * this form is normally used. The second block's own "Document" is a
   * free-text input backed by a <datalist> (not a <select>), so it's set
   * directly rather than through an autocomplete-click dance. Issue By on
   * each block goes through the CARGOS modal instead of a plain fill —
   * see setIssueByViaCargosModal().
   */
  async fillDriverInformation(info: {
    licenseNumber: string;
    licenseType: string;
    licenseIssueByCountrySearchTerm: string;
    licenseIssueByCountry: string;
    licenseReleaseDate: string;
    licenseExpiryDate: string;
    secondDocument: string;
    secondDocumentNumber: string;
    secondIssueByCountrySearchTerm: string;
    secondIssueByCountry: string;
    secondReleaseDate: string;
    secondExpiryDate: string;
  }) {
    await this.switchToNotesOtherInfoTab();
    await this.ensureDriverInformationVisible();
    await this.licenseDocumentNumbInput.fill(info.licenseNumber);
    await this.licenseTypeInput.fill(info.licenseType);
    await this.setIssueByViaCargosModal(
      this.cargosIssueByButton,
      this.issueByCargosCountryInput,
      'nationalCargosPatautocomplete-list',
      this.issueByCargosConfirmButton,
      this.licenseIssueByInput,
      info.licenseIssueByCountrySearchTerm,
      info.licenseIssueByCountry,
    );
    await this.fillDatepicker(this.licenseReleaseDateInput, info.licenseReleaseDate);
    await this.fillDatepicker(this.licenseExpiryDateInput, info.licenseExpiryDate);

    await this.secondDocumentInput.fill(info.secondDocument);
    await this.secondDocumentNumbInput.fill(info.secondDocumentNumber);
    await this.setIssueByViaCargosModal(
      this.cargosIssueBy1Button,
      this.issueBy1CargosCountryInput,
      'nationalCargosDoc1autocomplete-list',
      this.issueBy1CargosConfirmButton,
      this.secondIssueByInput,
      info.secondIssueByCountrySearchTerm,
      info.secondIssueByCountry,
    );
    await this.fillDatepicker(this.secondReleaseDateInput, info.secondReleaseDate);
    await this.fillDatepicker(this.secondExpiryDateInput, info.secondExpiryDate);
  }

  /**
   * Returns the numeric id off the resulting Show page's URL
   * (/MRBusinessPartner/show/<id>) — the success banner names the customer,
   * not an id, so the URL is the only place it appears.
   */
  async createAndGetId(): Promise<string> {
    console.log(`[STEP] Clicking "Create" on ${this.page.url()}`);
    await this.createButton.click();

    try {
      await expect(this.page).toHaveURL(/\/MRBusinessPartner\/show\/(\d+)/, { timeout: 20_000 });
    } catch (error) {
      console.error(
        '[STEP FAILED] The page never navigated to a "show" URL after clicking "Create" — the page likely crashed ' +
          'or the server rejected the submission. Check the [PAGE ERROR] / [HTTP 5xx] / [CONSOLE ERROR] / ' +
          `[REQUEST FAILED] lines above this for the cause. Current URL: ${this.page.url()}`,
      );
      throw error;
    }

    await expect(this.successBanner).toContainText(/created/i, { timeout: 10_000 });
    const match = this.page.url().match(/\/MRBusinessPartner\/show\/(\d+)/);
    const id = match![1];
    console.log(`[STEP] Customer created successfully: ${id}`);
    return id;
  }
}
