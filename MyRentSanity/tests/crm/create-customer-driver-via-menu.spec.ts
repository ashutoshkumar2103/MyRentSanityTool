import { test, expect } from '../../fixtures/testWithCrashLogging';
import { HomePage } from '../../pages/HomePage';
import { CustomerPage } from '../../pages/CustomerPage';
import { planSteps, sanityStep } from '../../fixtures/sanityStep';
import { NEW_CUSTOMER_DETAILS, NEW_CUSTOMER_DRIVER_INFO } from '../../utils/testData';

// Step titles as shown in the dashboard's results table.
const STEPS = {
  OPEN_FORM: 'Open CRM > Customers > New',
  FILL_DETAILS: 'Fill customer identity, address and birth details',
  FILL_DRIVER_INFO: 'Fill Driver Information (license + second document)',
  CREATE: 'Create the customer/driver',
} as const;

test('create a Person Entity customer/driver via CRM > Customers > New and print its ID', async ({ page }) => {
  // This flow's own CRM hover-menu navigation is slow/flaky on the remote
  // server (confirmed live: one run took ~14s just retrying the hover, another
  // took ~44s to land on the create page), and the form itself now has two
  // extra Issue-By modal round-trips on top of the usual field fills — the
  // whole thing measured ~96s end-to-end in one run, past the global 60s
  // default.
  test.setTimeout(150_000);

  planSteps(Object.values(STEPS));
  const homePage = new HomePage(page);
  const customerPage = new CustomerPage(page);

  await sanityStep(STEPS.OPEN_FORM, async () => {
    await homePage.openNewCustomerViaMenu();
    await expect(page).toHaveURL(/\/MRBusinessPartner\/create/);

    console.log('[EVIDENCE] Create Customer form opened.');
  });

  await sanityStep(STEPS.FILL_DETAILS, async () => {
    await customerPage.fillDetails(NEW_CUSTOMER_DETAILS);

    console.log(`[EVIDENCE] Filled details for ${NEW_CUSTOMER_DETAILS.firstName} ${NEW_CUSTOMER_DETAILS.lastName}.`);
  });

  await sanityStep(STEPS.FILL_DRIVER_INFO, async () => {
    await customerPage.fillDriverInformation(NEW_CUSTOMER_DRIVER_INFO);

    console.log(`[EVIDENCE] Driver license ${NEW_CUSTOMER_DRIVER_INFO.licenseNumber} and second document filled.`);
  });

  await sanityStep(STEPS.CREATE, async () => {
    const id = await customerPage.createAndGetId();
    expect(id).toMatch(/^\d+$/);

    console.log(`[EVIDENCE] Customer created successfully: id ${id}`);
  });
});
