import { test, expect } from '../../fixtures/testWithCrashLogging';
import { QuotationListPage } from '../../pages/QuotationListPage';
import { QuotationPage } from '../../pages/QuotationPage';
import { ReservationListPage } from '../../pages/ReservationListPage';
import { ReservationPage } from '../../pages/ReservationPage';
import { RentalAgreementListPage } from '../../pages/RentalAgreementListPage';
import { RentalAgreementPage } from '../../pages/RentalAgreementPage';
import { HomePage } from '../../pages/HomePage';
import { planSteps, sanityStep } from '../../fixtures/sanityStep';
import { fillStandardQuotationDetails } from '../../utils/quotationTestData';
import { currentInstance } from '../../utils/instances';
import { createRentalAgreementWithAvailableVehicle, fillCarClassAndLocations, fillStandardBookingDetails } from '../../utils/rentalTestData';

/**
 * One continuous session covering every "New" entry point this suite checks —
 * List page button and top-nav menu hover, for all three entities — plus the
 * known Duplicate-with-Included-Service crash, run last. User request (25 Sep
 * 2026): previously seven separate spec files, each logging in fresh; one
 * login now, reused across all seven steps, since List/Menu navigation works
 * identically mid-session as it does from a fresh load. Order: Quotation
 * (List, Menu), Reservation (List, Menu), Rental Agreement (List, Menu), then
 * the Duplicate crash-exploration last — that one is a genuine, consistently-
 * reproducing server bug (see its own step below), so keeping it last means a
 * real regression in any of the other six steps is never masked by it.
 *
 * Trade-off worth knowing: this is one Playwright test (test.step() per
 * phase, not separate test() blocks — a second test() would start its own
 * fresh browser context/login, defeating the point). One test means one
 * pass/fail outcome, so as long as the Duplicate crash exists, this suite
 * reports FAILED every run regardless of whether the six real coverage steps
 * ahead of it succeeded — check the live log / step list for that detail,
 * not just the overall badge.
 *
 * A List-page step's own success modal being left open when the next step is
 * a Menu one (hovering the top-nav doesn't navigate away, so it doesn't
 * clear on its own) is handled by HomePage's own hoverMyRentThenAct() —
 * dismisses any open Bootstrap modal before each hover attempt — not
 * repeated here.
 */

// Step titles as shown in the dashboard's results table — worded for a
// non-technical reader: which entity, and which entry point it was opened from.
const STEPS = {
  QUOTATION_LIST: 'Quotation via List page "New" button',
  QUOTATION_MENU: 'Quotation via Menu hover',
  RESERVATION_LIST: 'Reservation via List page "New" button',
  RESERVATION_MENU: 'Reservation via Menu hover',
  RA_LIST: 'Rental Agreement via List page "New" button',
  RA_MENU: 'Rental Agreement via Menu hover',
  DUPLICATE: 'Quotation with Included Service, then Duplicate (known crash)',
} as const;

test('create every entity via List and Menu, then reproduce the Duplicate crash', async ({ page }) => {
  // Two Rental Agreement phases, each individually bounded at 20 minutes
  // worst-case (see createRentalAgreementWithAvailableVehicle()), plus five
  // lighter phases — generous headroom for all seven run back to back in one
  // test.
  test.setTimeout(50 * 60_000);

  const skipDuplicate = currentInstance.skipDuplicateStep === true;
  planSteps(Object.values(STEPS).filter((title) => !(skipDuplicate && title === STEPS.DUPLICATE)));
  const homePage = new HomePage(page);

  await sanityStep(STEPS.QUOTATION_LIST, async () => {
    await homePage.openQuotationListViaMenu();
    const listPage = new QuotationListPage(page);
    await listPage.clickNewQuotation();
    await expect(page).toHaveURL(/\/preventivi\/create/);

    const quotationPage = new QuotationPage(page);
    await fillStandardQuotationDetails(quotationPage);

    const quotationId = await quotationPage.createAndGetQuotationId();
    expect(quotationId).toMatch(/^\S+$/);

    console.log(`[EVIDENCE] Quotation created successfully: ${quotationId}`);
  });

  await sanityStep(STEPS.QUOTATION_MENU, async () => {
    await homePage.openNewQuotationViaMenu();
    await expect(page).toHaveURL(/\/preventivi\/create/);

    const quotationPage = new QuotationPage(page);
    await fillStandardQuotationDetails(quotationPage);

    const quotationId = await quotationPage.createAndGetQuotationId();
    expect(quotationId).toMatch(/^\S+$/);

    await quotationPage.editAndAdvancePaymentType();

    console.log(`[EVIDENCE] ${quotationId}, Payment Type update saved.`);
  });

  await sanityStep(STEPS.RESERVATION_LIST, async () => {
    await homePage.openReservationListViaMenu();
    const listPage = new ReservationListPage(page);
    await listPage.clickNewReservation();
    await expect(page).toHaveURL(/\/MRReservation\/create/);
    // Confirmed live (31 Aug 2026): without this, filling fields can race the
    // page's own widget init (tabs, datepickers). Bounded rather than awaited
    // outright — confirmed live (25 Sep 2026) this page's own background
    // polling can keep it from ever reaching true network idle, the same
    // known behavior already documented for the home page in
    // testWithCrashLogging.ts. Used purely to burn a little real wall-clock
    // time, not as a strict readiness gate.
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    const reservationPage = new ReservationPage(page);
    await fillCarClassAndLocations(reservationPage);
    await fillStandardBookingDetails(reservationPage);

    const referenceId = await reservationPage.createAndGetReferenceId();
    expect(referenceId).toMatch(/^\S+$/);

    console.log(`[EVIDENCE] Reservation created successfully: ${referenceId}`);
  });

  await sanityStep(STEPS.RESERVATION_MENU, async () => {
    await homePage.openNewReservationViaMenu();
    await expect(page).toHaveURL(/\/MRReservation\/create/);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    const reservationPage = new ReservationPage(page);
    await fillCarClassAndLocations(reservationPage);
    await fillStandardBookingDetails(reservationPage);

    const referenceId = await reservationPage.createAndGetReferenceId();
    expect(referenceId).toMatch(/^\S+$/);

    await reservationPage.editAndAdvancePaymentType();

    console.log(`[EVIDENCE] ${referenceId}, Payment Type update saved.`);
  });

  await sanityStep(STEPS.RA_LIST, async () => {
    await homePage.openRentalAgreementListViaMenu();
    const listPage = new RentalAgreementListPage(page);
    await listPage.clickNewRentalAgreement();
    await expect(page).toHaveURL(/\/MRRentalAgreement\/create/);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    const rentalAgreementPage = new RentalAgreementPage(page);
    await fillStandardBookingDetails(rentalAgreementPage);

    const referenceId = await createRentalAgreementWithAvailableVehicle(rentalAgreementPage);
    expect(referenceId).toMatch(/^\S+-\S+$/);

    await rentalAgreementPage.closeMovement();

    console.log(`[EVIDENCE] Rental agreement created successfully: ${referenceId}, Movement closed.`);
  });

  await sanityStep(STEPS.RA_MENU, async () => {
    await homePage.openNewRentalAgreementViaMenu();
    await expect(page).toHaveURL(/\/MRRentalAgreement\/create/);
    // This 11-tab wizard fires a lot more init work on load (tinyMCE,
    // datepickers, several widgets) than Quotation's form — filling Customer
    // immediately can race the page's own AJAX customer-search call into
    // never firing. Bounded, not awaited outright — same reasoning as
    // Reservation via List above.
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    const rentalAgreementPage = new RentalAgreementPage(page);
    await fillStandardBookingDetails(rentalAgreementPage);

    const referenceId = await createRentalAgreementWithAvailableVehicle(rentalAgreementPage);
    expect(referenceId).toMatch(/^\S+-\S+$/);

    await rentalAgreementPage.editAndAdvancePaymentType();
    await rentalAgreementPage.closeMovement();

    console.log(`[EVIDENCE] ${referenceId}, Movement closed.`);
  });

  // Genuine, consistently-reproducing server bug (user request, 17 Sep 2026):
  // Duplicate 500s for any quotation with an Included Service attached. Kept
  // deliberately last, in the same session, so its expected failure can never
  // pre-empt the six real coverage steps above it.
  if (skipDuplicate) {
    console.log(`[STEP] Skipping Duplicate step on ${currentInstance.id} (runs on testee only)`);
    return;
  }
  await sanityStep(STEPS.DUPLICATE, async () => {
    await homePage.openQuotationListViaMenu();
    const listPage = new QuotationListPage(page);
    await listPage.clickNewQuotation();
    await expect(page).toHaveURL(/\/preventivi\/create/);

    const quotationPage = new QuotationPage(page);
    await fillStandardQuotationDetails(quotationPage);

    console.log('[STEP] Switching to "Other Info" tab to add an Included Service');
    await page.locator('a[href="#tab2"]').click();

    await page.locator('#getServiceList').click();
    const servicesModal = page.locator('#includedServiceModal');
    await expect(servicesModal).toBeVisible();

    const firstServiceCheckbox = servicesModal.locator('#services_list_table input[type="checkbox"][name="selectServices"]').first();
    const firstServiceName = await servicesModal.locator('#services_list_table tbody tr').first().locator('td').first().innerText();
    console.log(`[STEP] Selecting service "${firstServiceName.trim()}" and clicking Confirm`);
    await firstServiceCheckbox.check();
    await servicesModal.locator('#addServicesInRow').click();
    await expect(servicesModal).toBeHidden();

    await expect(page.locator('#services_list_table')).toContainText(firstServiceName.trim());

    // Back to the Quotation tab so the Create button is reachable.
    await page.locator('a[href="#tab1"]').click();

    const quotationId = await quotationPage.createAndGetQuotationId();
    expect(quotationId).toMatch(/^\S+$/);

    // Close the success popup (its backdrop blocks the Duplicate link otherwise).
    await quotationPage.quotationCreatedCloseButton.click();
    await expect(quotationPage.quotationCreatedModal).toBeHidden();

    console.log(`[STEP] Clicking "Duplicate" on ${page.url()}`);
    const duplicateLink = page.getByRole('link', { name: 'Duplicate' });
    const [duplicateResponse] = await Promise.all([
      page.waitForResponse((res) => /\/preventivi\/duplicate\/\d+/.test(res.url()) && res.request().method() === 'GET'),
      duplicateLink.click(),
    ]);

    if (!duplicateResponse.ok()) {
      console.error(
        `[STEP FAILED] "Duplicate" crashed with HTTP ${duplicateResponse.status()} on ${duplicateResponse.url()}. ` +
          `Quotation ${quotationId} had one Included Service ("${firstServiceName.trim()}") attached via the ` +
          'Other Info tab. The server returns a generic "An error has occurred" page (no stack trace exposed) ' +
          'for this request, reproduced consistently on repeated attempts.',
      );
    } else {
      console.log(`[STEP] Duplicate succeeded (HTTP ${duplicateResponse.status()}), landed on ${page.url()}`);
    }

    expect(
      duplicateResponse.ok(),
      `Duplicate returned HTTP ${duplicateResponse.status()} for a quotation with an Included Service attached — see [STEP FAILED] log above`,
    ).toBeTruthy();
  });
});
