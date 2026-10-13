import { test, expect } from '../../fixtures/testWithCrashLogging';
import { HomePage } from '../../pages/HomePage';
import { CalendarPage } from '../../pages/CalendarPage';
import { QuotationPage } from '../../pages/QuotationPage';
import { ReservationPage } from '../../pages/ReservationPage';
import { RentalAgreementPage } from '../../pages/RentalAgreementPage';
import { planSteps, sanityStep } from '../../fixtures/sanityStep';
import { fillCustomerAndPaymentDetails } from '../../utils/quotationTestData';
import { fillStandardBookingDetails } from '../../utils/rentalTestData';
import { currentInstance, optionLabel } from '../../utils/instances';
import { CALENDAR_CAR_CLASS, RA_LOCATION } from '../../utils/testData';

const MAX_VEHICLE_ATTEMPTS = 3;

// Step titles as shown in the dashboard's results table.
const STEPS = {
  QUOTATION: 'Quotation from a Calendar cell',
  RESERVATION: 'Reservation from a Calendar cell',
  RENTAL_AGREEMENT: `Rental Agreement from an available ${optionLabel(CALENDAR_CAR_CLASS)} vehicle at ${optionLabel(RA_LOCATION)}`,
} as const;

/**
 * All three calendar-planning creation flows in ONE test, one browser
 * session, one login — user request (3 Sep 2026): each of the 3 flows used
 * to be its own spec file, and since every test gets its own fresh browser
 * context (Playwright's own per-test isolation), running all three back to
 * back opened the visible browser (and logged in) 3 separate times per run —
 * 6 with the dashboard's own retry-on-failure. Quotation and Reservation
 * don't need a genuinely available vehicle to create (Quotation is
 * documented elsewhere as "only an estimate"; Reservation likewise doesn't
 * block on it here) — only Rental Agreement does, so only it keeps the
 * real availability check, retry-across-vehicles loop, and the CDAV/PMO
 * restriction the other creation flows also use.
 */
test('create a quotation, a reservation, and a rental agreement from the Calendar in one session', async ({ page }) => {
  test.setTimeout(900_000);

  planSteps(Object.values(STEPS));
  const homePage = new HomePage(page);
  const calendarPage = new CalendarPage(page);

  // Any available-looking cell, no availability check.
  await sanityStep(STEPS.QUOTATION, async () => {
    await homePage.openCalendarPlanningViaMenu();
    await calendarPage.openFirstLookingAvailableCellForToday();
    await calendarPage.clickQuotation();
    await expect(page).toHaveURL(/\/preventivi\/create/);

    const quotationPage = new QuotationPage(page);
    await fillCustomerAndPaymentDetails(quotationPage);
    const quotationId = await quotationPage.createAndGetQuotationId();
    expect(quotationId).toMatch(/^\S+$/);
    if (await quotationPage.quotationCreatedModal.isVisible().catch(() => false)) {
      await quotationPage.quotationCreatedCloseButton.click();
    }

    console.log(`[EVIDENCE] Quotation created successfully: ${quotationId}`);
  });

  // Any available-looking cell, no availability check.
  await sanityStep(STEPS.RESERVATION, async () => {
    await homePage.openCalendarPlanningViaMenu();
    await calendarPage.openFirstLookingAvailableCellForToday();
    await calendarPage.clickReservation();
    await expect(page).toHaveURL(/\/MRReservation\/create/);

    const reservationPage = new ReservationPage(page);
    await fillStandardBookingDetails(reservationPage);
    const reservationId = await reservationPage.createAndGetReferenceId();
    expect(reservationId).toMatch(/^\S+$/);
    if (await reservationPage.createdModal.isVisible().catch(() => false)) {
      await reservationPage.createdModalCloseButton.click();
    }

    console.log(`[EVIDENCE] Reservation created successfully: ${reservationId}`);
  });

  // Needs a genuinely available vehicle of the instance's RA Car Class at its RA Location (CDAV at PMO on testee).
  await sanityStep(STEPS.RENTAL_AGREEMENT, async () => {
    let raReferenceId: string | undefined;
    let usedVehicle = '';
    let nextCellIndex = 0;

    for (let attempt = 1; attempt <= MAX_VEHICLE_ATTEMPTS; attempt++) {
      await homePage.openCalendarPlanningViaMenu();
      if (currentInstance.filterRaCalendar !== false) await calendarPage.filterToRentalAgreementClassAndLocation();
      const { cellIndex, vehicle } = await calendarPage.openAvailableVehicleModalForToday(nextCellIndex);
      nextCellIndex = cellIndex + 1;

      await calendarPage.clickRentalAgreement();
      await expect(page).toHaveURL(/\/MRRentalAgreement\/create/);

      const rentalAgreementPage = new RentalAgreementPage(page);
      await fillStandardBookingDetails(rentalAgreementPage);

      try {
        raReferenceId = await rentalAgreementPage.createAndGetReferenceId();
        usedVehicle = vehicle;
        break;
      } catch (error) {
        if (attempt === MAX_VEHICLE_ATTEMPTS) throw error;
        console.log(
          `[STEP] Vehicle ${vehicle} couldn't be used for a Rental Agreement — ` +
            `retrying with the next available vehicle (attempt ${attempt + 1}/${MAX_VEHICLE_ATTEMPTS})`,
        );
      }
    }

    expect(raReferenceId).toMatch(/^\S+-\S+$/);

    console.log(`[EVIDENCE] Rental agreement created successfully: ${raReferenceId} (vehicle ${usedVehicle})`);
  });
});
