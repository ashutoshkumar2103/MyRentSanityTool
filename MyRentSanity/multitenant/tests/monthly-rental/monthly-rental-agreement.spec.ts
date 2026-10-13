import { test, expect } from '../../fixtures/testWithCrashLogging';
import { HomePage } from '../../pages/HomePage';
import { CalendarPage } from '../../pages/CalendarPage';
import { RentalAgreementPage } from '../../pages/RentalAgreementPage';
import { planSteps, sanityStep } from '../../fixtures/sanityStep';
import {
  MONTHLY_RENTAL_DISCOUNT_PERCENT,
  MONTHLY_RENTAL_MONTHS,
  MONTHLY_RENTAL_MONTH_DURATION_DAYS,
  createMonthlyRentalAgreementFromCalendar,
  monthlyRentalPickupDate,
} from '../../utils/monthlyRentalTestData';

// Step titles as shown in the dashboard's results table. Each one depends on
// the one before it, so a failure leaves every later step "Not run".
const STEPS = {
  CREATE: `Create a monthly Rental Agreement (${MONTHLY_RENTAL_MONTHS} months x ${MONTHLY_RENTAL_MONTH_DURATION_DAYS} days, pickup a month ago)`,
  CHECK_CREATED: 'Tab 3 TOTAL(€) matches the Invoice Preview',
  DISCOUNT: `Apply a ${MONTHLY_RENTAL_DISCOUNT_PERCENT}% discount — TOTAL(€) still matches the Invoice Preview`,
  UPDATE: 'Update the rental — TOTAL(€) still matches the Invoice Preview',
  REMOVE_DISCOUNT: 'Remove the discount (empty the Discount % field, no Update) — TOTAL(€) still matches the Invoice Preview',
  INVOICE_CLOSE: 'Create the Final Invoice and close the movement',
  RENEW: 'Renew the movement from the Closure tab',
  CHECK_RENEWED: 'After renewal — TOTAL(€) still matches the Invoice Preview',
  INVOICE_CLOSE_AGAIN: 'Create the Final Invoice and close the renewed movement',
} as const;

test('monthly rental: totals match the Invoice Preview, then invoice, close and renew', async ({ page }) => {
  // Create tries several Car Classes (each a Search Available Vehicle round
  // trip) and the rest is two invoice/close cycles plus a renewal.
  test.setTimeout(20 * 60_000);

  // Renewing is done for the Administrator only (user instruction, 9 Oct 2026):
  // the testee Operator's renewal is refused by the server (HTTP 403 on
  // calculateMovement). Operator runs everything else, up to and including the
  // first Final Invoice and closure, and skips the renewal and the steps that
  // need a renewed movement.
  const renews = process.env.MT_RUN_AS !== 'operator';
  const renewalSteps = [STEPS.RENEW, STEPS.CHECK_RENEWED, STEPS.INVOICE_CLOSE_AGAIN];
  planSteps(Object.values(STEPS).filter((title) => renews || !renewalSteps.includes(title as (typeof renewalSteps)[number])));
  if (!renews) console.log('[STEP] Operator run: the renewal steps are skipped (Administrator only).');
  const homePage = new HomePage(page);
  const calendarPage = new CalendarPage(page);
  const rentalAgreementPage = new RentalAgreementPage(page);
  let rentalAgreementId = '';
  // Only ever filled when SANITY_MONTHLY_CONTINUE_ON_MISMATCH=1 — otherwise the
  // first mismatch throws and ends the run, as the flow is specified.
  const mismatches: string[] = [];
  const recordMismatch = (message: string | null) => {
    if (message) mismatches.push(message);
  };

  await sanityStep(STEPS.CREATE, async () => {
    rentalAgreementId = await createMonthlyRentalAgreementFromCalendar(page, homePage, calendarPage, rentalAgreementPage);
    expect(rentalAgreementId).toMatch(/^\S+-\S+$/);

    console.log(`[EVIDENCE] Monthly rental agreement created: ${rentalAgreementId} (pickup ${monthlyRentalPickupDate()}).`);
  });

  await sanityStep(STEPS.CHECK_CREATED, async () => {
    recordMismatch(await rentalAgreementPage.checkTab3TotalMatchesInvoicePreview(`${rentalAgreementId} after creation`));
    console.log(`[EVIDENCE] ${rentalAgreementId}: tab 3 TOTAL(€) checked against the Invoice Preview after creation.`);
  });

  let discountApplied = false;
  await sanityStep(STEPS.DISCOUNT, async () => {
    const applied = await rentalAgreementPage.applyDiscountPercent(MONTHLY_RENTAL_DISCOUNT_PERCENT);
    discountApplied = applied;
    const label = applied ? `with a ${MONTHLY_RENTAL_DISCOUNT_PERCENT}% discount` : `(${MONTHLY_RENTAL_DISCOUNT_PERCENT}% discount refused by the app, none applied)`;
    recordMismatch(await rentalAgreementPage.checkTab3TotalMatchesInvoicePreview(`${rentalAgreementId} ${label}`));
    console.log(`[EVIDENCE] ${rentalAgreementId}: tab 3 TOTAL(€) checked against the Invoice Preview ${label}.`);
  });

  await sanityStep(STEPS.UPDATE, async () => {
    await rentalAgreementPage.updateRental();
    recordMismatch(await rentalAgreementPage.checkTab3TotalMatchesInvoicePreview(`${rentalAgreementId} after updating the rental`));
    console.log(`[EVIDENCE] ${rentalAgreementId}: tab 3 TOTAL(€) checked against the Invoice Preview after Update.`);
  });

  // Known defect (Jira ticket raised 9 Oct 2026): with a saved discount, emptying
  // the Discount % field makes tab 3 show the undiscounted TOTAL(€) while the
  // Invoice Preview keeps the old discounted one until Update. This step is meant
  // to FAIL until that is fixed, and to pass once it is — so it is a failing step
  // of its own: the failure is kept, the remaining steps still run (the Show page
  // is reloaded first, which drops the unsaved removal so they see the saved 10%
  // discount as before), and the test fails at the end. Skipped when the app refused the discount (nothing to remove).
  let removalFailure: string | null = null;
  try {
    await sanityStep(STEPS.REMOVE_DISCOUNT, async () => {
      if (!discountApplied) {
        console.log(`[STEP] ${rentalAgreementId}: no discount was applied (the app refused it), so there is none to remove — step skipped.`);
        return;
      }
      await rentalAgreementPage.clearDiscountField();
      const message = await rentalAgreementPage.checkTab3TotalMatchesInvoicePreview(`${rentalAgreementId} with the discount removed (field emptied, not saved)`);
      if (message) throw new Error(message);
      console.log(`[EVIDENCE] ${rentalAgreementId}: tab 3 TOTAL(€) matches the Invoice Preview after the discount was removed.`);
    });
  } catch (error) {
    removalFailure = error instanceof Error ? error.message : String(error);
  }
  if (discountApplied) await rentalAgreementPage.discardUnsavedChanges();

  // createInvoice() is tab 2 > Invoice > Create an Invoice > Final Invoice >
  // Update; closeMovement() takes care of the ">30 days" warning and the
  // drop-off location picker if they appear.
  await sanityStep(STEPS.INVOICE_CLOSE, async () => {
    await rentalAgreementPage.createInvoice();
    await rentalAgreementPage.ensureClosureTabOpen();
    await rentalAgreementPage.closeMovement({ monthly: true });
    console.log(`[EVIDENCE] ${rentalAgreementId}: Final Invoice created, Movement closed.`);
  });

  if (renews) {
    await sanityStep(STEPS.RENEW, async () => {
      await rentalAgreementPage.renewMovement();
      console.log(`[EVIDENCE] ${rentalAgreementId}: Movement renewed.`);
    });

    await sanityStep(STEPS.CHECK_RENEWED, async () => {
      recordMismatch(await rentalAgreementPage.checkTab3TotalMatchesInvoicePreview(`${rentalAgreementId} after renewal`));
      console.log(`[EVIDENCE] ${rentalAgreementId}: tab 3 TOTAL(€) checked against the Invoice Preview after renewal.`);
    });

    await sanityStep(STEPS.INVOICE_CLOSE_AGAIN, async () => {
      await rentalAgreementPage.createInvoice();
      await rentalAgreementPage.ensureClosureTabOpen();
      await rentalAgreementPage.closeMovement({ monthly: true });
      console.log(`[EVIDENCE] ${rentalAgreementId}: Final Invoice created, renewed Movement closed.`);
    });
  }

  if (removalFailure) mismatches.push(removalFailure);
  expect(mismatches, `Totals did not match the Invoice Preview:\n${mismatches.join('\n')}`).toEqual([]);
});
