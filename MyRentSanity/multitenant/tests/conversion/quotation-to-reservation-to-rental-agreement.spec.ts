import { test, expect } from '../../fixtures/testWithCrashLogging';
import { HomePage } from '../../pages/HomePage';
import { CalendarPage } from '../../pages/CalendarPage';
import { QuotationPage } from '../../pages/QuotationPage';
import { ReservationPage } from '../../pages/ReservationPage';
import { RentalAgreementPage } from '../../pages/RentalAgreementPage';
import { planSteps, sanityStep } from '../../fixtures/sanityStep';
import { fillCustomerAndPaymentDetails } from '../../utils/quotationTestData';
import { createConvertedRentalAgreementWithAvailableVehicle } from '../../utils/rentalTestData';
import { currentInstance } from '../../utils/instances';

// Step titles as shown in the dashboard's results table. Each one depends on
// the one before it, so a failure leaves every later step "Not run".
const STEPS = {
  QUOTATION: 'Quotation from an available Calendar vehicle',
  TO_RESERVATION: 'Convert Quotation into a Reservation',
  TO_RENTAL_AGREEMENT: 'Convert Reservation into a Rental Agreement',
  INVOICE: 'Create Final Invoice for the Rental Agreement',
  CLOSE_MOVEMENT: 'Close the Rental Agreement movement',
} as const;

test('convert a Quotation into a Reservation into a Rental Agreement', async ({ page }) => {
  // Three form submissions plus a vehicle-assignment retry loop — give it real headroom.
  // Raised from 180s (6 Oct 2026): the customer instances (e.g. giffitest)
  // are slower than testee and ran out of time at the Invoice step with every
  // earlier step already passed.
  test.setTimeout(360_000);

  planSteps(Object.values(STEPS));
  const homePage = new HomePage(page);
  const quotationPage = new QuotationPage(page);
  const reservationPage = new ReservationPage(page);
  const rentalAgreementPage = new RentalAgreementPage(page);
  let quotationId = '';
  let reservationId = '';
  let rentalAgreementId = '';

  // A Quotation is only an estimate — it can be created against a vehicle
  // that isn't actually available. Reservation and Rental Agreement further
  // down this chain are real bookings, though, so the vehicle seeding this
  // Quotation must be genuinely available from the start, or the chain will
  // just fail later at the Reservation step instead.
  await sanityStep(STEPS.QUOTATION, async () => {
    await homePage.openCalendarPlanningViaMenu();
    const calendarPage = new CalendarPage(page);
    // See InstanceProfile.filterConversionCalendar — off on testee, which
    // keeps scanning the whole grid as it always has.
    if (currentInstance.filterConversionCalendar) await calendarPage.filterToRentalAgreementClassAndLocation();
    const { vehicle } = await calendarPage.openAvailableVehicleModalForToday();
    await calendarPage.clickQuotation();
    await expect(page).toHaveURL(/\/preventivi\/create/);

    await fillCustomerAndPaymentDetails(quotationPage);
    quotationId = await quotationPage.createAndGetQuotationId();
    expect(quotationId).toMatch(/^\S+$/);

    console.log(`[EVIDENCE] Quotation created successfully: ${quotationId} (vehicle ${vehicle})`);
  });

  // Customer, Driver, Reservation Source and Payment all carry over from the
  // quotation — confirmed live, and deliberately left untouched, not just
  // skipped for convenience: re-searching Driver1 here sends its own
  // already-selected id as an exclusion param on the lookup request, and the
  // server excludes that exact id from the results — searching for "the
  // driver already in this field" then finds nothing to select. Only Rental
  // Type doesn't carry over.
  await sanityStep(STEPS.TO_RESERVATION, async () => {
    await quotationPage.convertToReservation();
    await expect(page).toHaveURL(/\/MRReservation\/create/);

    await reservationPage.selectRentalType('Short Term');
    reservationId = await reservationPage.createAndGetReferenceId();
    expect(reservationId).toMatch(/^\S+$/);

    console.log(`[EVIDENCE] Reservation created successfully: ${reservationId} (from ${quotationId})`);
  });

  // Everything carries over except the vehicle — Quotations and Reservations
  // only ever reserve a class, never a specific plate, so this form always
  // needs one assigned by hand regardless of how the chain got here. Same
  // reasoning as above: nothing else gets touched.
  await sanityStep(STEPS.TO_RENTAL_AGREEMENT, async () => {
    await reservationPage.convertToRentalAgreement();
    await expect(page).toHaveURL(/\/MRRentalAgreement\/create/);

    rentalAgreementId = await createConvertedRentalAgreementWithAvailableVehicle(rentalAgreementPage);
    expect(rentalAgreementId).toMatch(/^\S+-\S+$/);

    console.log(`[EVIDENCE] Rental agreement created successfully: ${rentalAgreementId} (from ${reservationId})`);
  });

  // Invoice the Rental Agreement before closing its movement — see
  // RentalAgreementPage.createInvoice() for the full Create Invoice -> Final
  // Invoice -> Update sequence. Quotation/Reservation have no invoicing step
  // of their own, so this only ever runs against the converted RA.
  await sanityStep(STEPS.INVOICE, async () => {
    const invoice = await rentalAgreementPage.createInvoice();

    console.log(
      invoice === 'created'
        ? `[EVIDENCE] Final Invoice created for ${rentalAgreementId}.`
        : `[EVIDENCE] ${rentalAgreementId} was already invoiced automatically by this instance (no "Create an Invoice" offered).`,
    );
  });

  await sanityStep(STEPS.CLOSE_MOVEMENT, async () => {
    await rentalAgreementPage.closeMovement();

    console.log(`[EVIDENCE] ${rentalAgreementId}, Movement closed.`);
  });
});
