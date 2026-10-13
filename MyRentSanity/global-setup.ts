import { chromium } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { env, credentialsFor } from './utils/env';
import { currentInstance } from './utils/instances';
import { AUTH_STATE_PATH, RUN_AS } from './playwright.config';

/**
 * Authenticates once, before any suite runs, and writes the resulting
 * session to AUTH_STATE_PATH for every test to reuse via `storageState`.
 *
 * Deliberately a `globalSetup` script (a plain function Playwright calls
 * once up front) rather than a `setup` *project* with a `dependencies: [...]`
 * link, even though that's the newer, more commonly-recommended pattern:
 * a project's `use.headless` is only a default, and `--headed` on the CLI
 * overrides it — confirmed live (2 Sep 2026, via `DEBUG=pw:browser`, which
 * logs Chromium's actual launch args) that setting `headless: true` on the
 * 'setup' project's own `use` still launched *without* `--headless` once
 * `--headed` was passed for the run overall. A `globalSetup` script isn't a
 * project — it launches its own browser directly via `chromium.launch()`
 * below, so `headless: true` here is unconditional. There's nothing in the
 * login flow worth watching anyway; this is what was popping up as a
 * second, separate visible browser window on every `--headed` run before
 * this fix.
 */
export default async function globalSetup() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: env.baseUrl, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  // This runs outside the test runner, so playwright.config.ts's timeouts
  // don't reach it — mirror its (instance-scaled) action/navigation ones.
  page.setDefaultTimeout(15_000 * currentInstance.timeoutMultiplier);
  page.setDefaultNavigationTimeout(30_000 * currentInstance.timeoutMultiplier);

  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);
  const { username, password, companyCode } = credentialsFor(RUN_AS);
  await loginPage.open();
  await loginPage.login(username, password, companyCode);
  // expectLoaded()'s own assertions only get the bare 5s default out here
  // (confirmed live, 6 Oct 2026: esgrenttest's account name took longer than
  // that to render and failed the whole run before any test started) — wait
  // for it with the real timeout first, so expectLoaded() is a formality.
  await homePage.accountName.waitFor({ state: 'visible' });
  await homePage.expectLoaded();

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
