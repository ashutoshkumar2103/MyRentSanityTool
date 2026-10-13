import { test, expect } from '../../fixtures/testWithCrashLogging';
import { HomePage } from '../../pages/HomePage';
import { RentalAgreementListPage } from '../../pages/RentalAgreementListPage';
import { FineListPage } from '../../pages/FineListPage';
import { FinePage } from '../../pages/FinePage';
import { planSteps, sanityStep } from '../../fixtures/sanityStep';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Step titles as shown in the dashboard's results table.
const STEPS = {
  PICK_RENTAL: 'Pick an open Rental Agreement',
  OPEN_FORM: 'Open Fines Management > Fine > New',
  SEARCH: 'Search the rental by plate + Infraction Date',
  FILL_DETAILS: 'Fill Infraction details',
  CREATE: 'Create the Fine',
} as const;

test('Fine Creation: create a Fine against an already-open Rental Agreement', async ({ page }) => {
  // Confirmed live (5 Oct 2026): ~36s as Administrator, but 88-96s as
  // Operator — the RA list and Fines menu navigation alone took ~47s there —
  // so the global 60s default timed it out right after the Fine was created.
  test.setTimeout(150_000);

  // MULTITENANT: the Operator's Fine List page has no "New Fine" button at all (checked live
  // 13 Oct 2026 — the role cannot raise fines), so there is nothing to test for that role. The
  // test is reported as skipped, with this reason, rather than failing on a missing button.
  if (process.env.MT_RUN_AS === 'operator') {
    const fineList = new FineListPage(page);
    await fineList.open();
    const canCreate = await fineList.newFineLink.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    test.skip(!canCreate, 'The Operator role has no "New Fine" button on the Fine List page (no permission to create fines), so Fine Creation is Administrator-only here.');
  }

  planSteps(Object.values(STEPS));
  const finePage = new FinePage(page);

  const rental = await sanityStep(STEPS.PICK_RENTAL, async () => {
    const rentalAgreementListPage = new RentalAgreementListPage(page);
    await rentalAgreementListPage.open();
    await expect(rentalAgreementListPage.firstRow).toBeVisible();
    const summary = await rentalAgreementListPage.getFirstRentalSummary();
    console.log(
      `[STEP] Picked Rental Agreement "${summary.referenceId}" — plate "${summary.plate}", ` +
        `${summary.dateOut.toISOString()} to ${summary.dateIn.toISOString()}`,
    );

    console.log(`[EVIDENCE] Using ${summary.referenceId}, plate ${summary.plate}.`);
    return summary;
  });

  // Infraction Date must fall inside the rental window — the midpoint
  // between Date OUT and Date IN always does, regardless of how long (or
  // short) the rental is.
  const infractionDate = new Date((rental.dateOut.getTime() + rental.dateIn.getTime()) / 2);
  const emissionDate = infractionDate;
  const notificationDate = emissionDate;
  const expirationDate = addDays(notificationDate, 2);
  const pointsDeleted = 50 + Math.floor(Math.random() * 151); // 50-200 inclusive

  await sanityStep(STEPS.OPEN_FORM, async () => {
    const homePage = new HomePage(page);
    await homePage.openFineManagementFineViaMenu();
    await expect(page).toHaveURL(/\/MRFine\/index/);

    const fineListPage = new FineListPage(page);
    await fineListPage.clickNewFine();
    await expect(page).toHaveURL(/\/MRFine\/create/);

    console.log('[EVIDENCE] Create Fine form opened.');
  });

  await sanityStep(STEPS.SEARCH, async () => {
    await finePage.search(rental.plate, infractionDate);

    console.log(`[EVIDENCE] Matched plate ${rental.plate} on ${infractionDate.toISOString().slice(0, 10)}.`);
  });

  await sanityStep(STEPS.FILL_DETAILS, async () => {
    await finePage.fillInfractionDetails({
      emissionDate,
      fineOrgSearchTerm: 'pol',
      notificationDate,
      violatedLaw: 'Art L3321',
      expirationDate,
      pointsDeleted,
    });

    console.log(`[EVIDENCE] Violated Law Art L3321, ${pointsDeleted} points deleted.`);
  });

  await sanityStep(STEPS.CREATE, async () => {
    const result = await finePage.create();
    if (!result.created) {
      throw new Error(`Fine was not created — page did not reach a "show" URL. Reported error: ${result.error}`);
    }
    expect(result.fineId).toMatch(/^\d+$/);

    console.log(`[EVIDENCE] Fine created successfully: id ${result.fineId} (for ${rental.referenceId})`);
  });
});
