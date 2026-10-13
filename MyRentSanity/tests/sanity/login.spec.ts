import { test, expect } from '../../fixtures/testWithCrashLogging';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { env } from '../../utils/env';

test.describe('Login', () => {
  test('administrator can sign in with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);

    await loginPage.open();
    await loginPage.login(env.username, env.password, env.companyCode);

    await homePage.expectLoaded();
    await expect(homePage.roleLabel).toHaveText('Administrator');
  });

  test('sign in then log out returns to the login form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);

    await loginPage.open();
    await loginPage.login(env.username, env.password, env.companyCode);
    await homePage.expectLoaded();

    await homePage.logout();
    await expect(loginPage.usernameInput).toBeVisible();
  });

  // Skipped by default: MyRent locks the account after 6 failed attempts, and this
  // exercises the real "administrator" account, not a disposable test user. Repeated
  // CI runs would eventually lock the shared account out of the testee environment.
  // Run explicitly with: RUN_NEGATIVE_LOGIN_TESTS=1 npm run test:login
  test('invalid password is rejected', async ({ page }) => {
    test.skip(
      !process.env.RUN_NEGATIVE_LOGIN_TESTS,
      'Skipped by default — repeated runs risk locking the shared administrator account after 6 failed attempts. Set RUN_NEGATIVE_LOGIN_TESTS=1 to run it.',
    );

    const loginPage = new LoginPage(page);

    await loginPage.open();
    await loginPage.login(env.username, 'clearly-wrong-password', env.companyCode);

    await expect(loginPage.errorMessage).toContainText('not found');
    await expect(loginPage.usernameInput).toBeVisible();
  });
});
