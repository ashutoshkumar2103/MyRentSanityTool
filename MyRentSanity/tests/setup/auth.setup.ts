import { test as setup } from '../../fixtures/testWithCrashLogging';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { env } from '../../utils/env';
import { AUTH_STATE_PATH } from '../../playwright.config';

setup('authenticate as administrator', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);

  await loginPage.open();
  await loginPage.login(env.username, env.password, env.companyCode);
  await homePage.expectLoaded();

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
