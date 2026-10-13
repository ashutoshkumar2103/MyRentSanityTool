import { test as base, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { credentialsFor } from '../utils/env';
import { appUrl } from '../utils/instances';
import { POPUP_SELECTOR } from '../utils/formHelpers';
import { AUTH_STATE_PATH, RUN_AS } from '../playwright.config';

/**
 * A drop-in replacement for `test` from '@playwright/test' that wires up
 * crash/error listeners on every test's `page`. Import `test`/`expect` from
 * here instead of '@playwright/test' in every spec so a crash or a silent
 * server/JS error surfaces as an obvious, tagged line in the log — a manual
 * tester watching `list`-reporter output (e.g. over PuTTY) shouldn't have to
 * open a trace file just to learn "something broke", only to find out why.
 *
 * Tags used below (grep-able): [PAGE CRASHED] [PAGE ERROR] [CONSOLE ERROR]
 * [HTTP 5xx] [REQUEST FAILED]
 */
/**
 * Overrides viewport/deviceScaleFactor/launchOptions to make a `--headed` run
 * use the real, full screen (`viewport: null` + `--start-maximized`) while
 * headless runs keep a fixed 1280x720 — deliberately done as fixture
 * overrides here rather than as static values in playwright.config.ts.
 * Confirmed live (2 Sep 2026) that playwright.config.ts is evaluated TWICE:
 * once in the main CLI process (whose `process.argv` does include `--headed`)
 * and again inside each test worker process (whose own `process.argv` is
 * just Playwright's internal `workerProcessEntry.js`, with no CLI flags at
 * all) — and it's the worker's copy that actually launches the browser, so a
 * `process.argv.includes('--headed')` check in the config silently resolves
 * to `false` there regardless of the real CLI flag, which is exactly what
 * broke this the first time (maximize/single-viewport stopped applying to
 * headed runs). `testInfo`/`workerInfo`'s own `.project.use.headless`, by
 * contrast, is confirmed live to correctly carry the CLI override into the
 * worker (explicitly `false` when `--headed` is passed, absent otherwise),
 * so fixtures — which run inside the worker with access to that — are the
 * reliable place to key off of it.
 */
export const test = base.extend<{ page: Page }>({
  viewport: async ({}, use, testInfo) => {
    const headed = testInfo.project.use.headless === false;
    await use(headed ? null : { width: 1280, height: 720 });
  },

  deviceScaleFactor: async ({}, use, testInfo) => {
    const headed = testInfo.project.use.headless === false;
    // Playwright rejects a non-null deviceScaleFactor paired with a null
    // viewport (confirmed live), so this must flip alongside viewport above.
    await use(headed ? undefined : 1);
  },

  launchOptions: async ({ launchOptions }, use, workerInfo) => {
    const headed = workerInfo.project.use.headless === false;
    await use(headed ? { ...launchOptions, args: [...(launchOptions.args ?? []), '--start-maximized'] } : launchOptions);
  },

  /**
   * Headless 'sanity' runs still start pre-authenticated via global-setup.ts's
   * own (invisible, separate) login — fast, and there's no one watching
   * anyway. A `--headed` 'sanity' run skips that: injecting cookies before
   * the page ever loads would make the visible browser jump straight to an
   * already-logged-in page, which is exactly the "how did that happen, is it
   * actually logging in?" complaint this fixes — the `page` fixture below
   * performs a real, watchable login instead, in the same window, when this
   * is undefined. Scoped to 'sanity' specifically: the 'no-auth' project
   * (login.spec.ts) tests the login flow itself and must always start
   * genuinely unauthenticated regardless of headed/headless, or its own
   * login attempt would find itself already signed in.
   */
  storageState: async ({}, use, testInfo) => {
    const headed = testInfo.project.use.headless === false;
    const usesPersistedAuth = testInfo.project.name === 'sanity' && !headed;
    await use(usesPersistedAuth ? AUTH_STATE_PATH : undefined);
  },

  page: async ({ page }, use, testInfo) => {
    // MyRent embeds a Jivochat widget ("Send us a message") whose opened panel
    // sits over the lower right of the page and swallows clicks. Whenever its ×
    // (#jivo_close_button) is on screen while an action is waiting, click it and
    // let the action carry on — user instruction, 9 Oct 2026. Acts only when the
    // panel is open, so nothing changes where it never opens.
    await page.addLocatorHandler(page.locator('#jivo_close_button').first(), async (closeButton) => {
      console.log('[STEP] Jivochat panel was open — closing it');
      await closeButton.click({ timeout: 3_000 }).catch(() => {});
    });
    // Listeners go on before any navigation — including the visible login
    // below — so a crash/error during login itself is caught too, not just
    // ones during the test body.
    page.on('crash', () => {
      console.error(`[PAGE CRASHED] ${timestamp()} url=${page.url()}`);
    });

    page.on('pageerror', (error) => {
      console.error(`[PAGE ERROR] ${timestamp()} url=${page.url()} — ${error.message}`);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[CONSOLE ERROR] ${timestamp()} url=${page.url()} — ${msg.text()}`);
      }
    });

    page.on('requestfailed', (request) => {
      // Aborted requests (e.g. a page navigation cancelling an in-flight AJAX
      // call) are normal noise, not failures — skip those.
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      console.error(
        `[REQUEST FAILED] ${timestamp()} ${request.method()} ${request.url()} — ${request.failure()?.errorText}`,
      );
    });

    page.on('response', (response) => {
      if (response.status() >= 500) {
        console.error(`[HTTP ${response.status()}] ${timestamp()} ${response.url()}`);
      }
    });

    registerKnownPopupHandlers(page);

    // Every 'sanity' spec used to start with its own `page.goto('/MyRentWeb/user/home')`
    // + `homePage.expectLoaded()` — that's now done here instead, once, so it
    // applies identically whether this ends in a real login (headed) or
    // pre-injected cookies (headless). Confirmed live (2 Sep 2026) why specs
    // can't keep doing it themselves on top of this: a spec's own follow-up
    // `page.goto()` to that same URL, fired immediately after the headed
    // login already landed there, raced Chromium's still-settling network
    // activity and got cancelled outright (`net::ERR_ABORTED`) — which,
    // being untagged, wasn't recognized as a diagnosed failure, so the
    // dashboard silently reran the whole suite and repeated the exact same
    // crash, showing what looked like the login page opening twice with the
    // real test never once being reached.
    if (testInfo.project.name === 'sanity') {
      const homePage = new HomePage(page);
      if (testInfo.project.use.headless === false) {
        const { username, password, companyCode } = credentialsFor(RUN_AS);
        console.log(`[STEP] Logging in as "${username}" (visible browser — no pre-authenticated session)`);
        const loginPage = new LoginPage(page);
        await loginPage.open();
        await loginPage.login(username, password, companyCode);
        await homePage.expectLoaded();
        console.log('[STEP] Logged in successfully.');
        // Confirmed live (2 Sep 2026): arriving here via the login redirect
        // specifically (as opposed to a direct page.goto(), which is what
        // storageState-based headless runs do) leaves the top nav's own
        // mega-menu JS not yet bound — `accountName` above is satisfied well
        // before that finishes, so a hover on e.g. CRM right after login
        // silently no-ops (the dropdown never gets its "open" class) even
        // though the exact same hover works immediately after a plain goto.
        // The home page has its own continuous polling AJAX (confirmed live:
        // `networkidle` never actually resolves here), so this is bounded
        // and swallowed rather than awaited outright — it's used purely to
        // burn a little real wall-clock time, not as a true readiness signal.
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      } else {
        // domcontentloaded, like BasePage.goto(): the home page's third-party
        // scripts can hold up `load` for 30s+ (confirmed live on giffitest,
        // 6 Oct 2026); expectLoaded() below is the real readiness check.
        await page.goto(appUrl('/user/home'), { waitUntil: 'domcontentloaded' });
        await homePage.expectLoaded();
      }
    }

    await use(page);
  },
});

const OPEN_CONTRACT_WARNING = /another open contract/i;

/**
 * Informational popups some instances show mid-form, which a manual tester
 * just clicks through. Registered via page.addLocatorHandler(), so they're
 * only acted on when one is actually on screen and in the way of the next
 * action — no waiting, nothing changes on instances that never show them.
 *
 * - "Customer Info": a customer's own notes, opened right after picking a
 *   customer that has some (confirmed live, 6 Oct 2026, esgrenttest) — its
 *   backdrop blocked the Quotation's Create click.
 * - "There is another open contract for this driver1. Do you wish to
 *   continue?": user instruction (6 Oct 2026) is to click OK and carry on.
 *   Handled both as a Bootstrap modal and as a native confirm(), since which
 *   one an instance uses isn't known. RentalAgreementPage replaces the
 *   dialog listener with its own accept-everything one while it creates.
 */
function registerKnownPopupHandlers(page: Page): void {
  const customerInfo = page.locator(POPUP_SELECTOR, { hasText: 'Customer Info' });
  page.addLocatorHandler(customerInfo, async (modal) => {
    console.log('[STEP] "Customer Info" popup appeared — closing it');
    await modal.getByRole('button', { name: 'Close' }).first().click();
  });

  // MULTITENANT: the Rental Agreement form can raise #custDriverMessageModal (a message about the
  // selected customer/driver) whose backdrop swallowed the Create click and sent the vehicle loop
  // through 39 candidates (13 Oct 2026). Its text is logged — it says what record data is missing —
  // and it is closed so the click can go on.
  const custDriverMessage = page.locator('#custDriverMessageModal:visible');
  page.addLocatorHandler(custDriverMessage, async (modal) => {
    const text = (await modal.innerText().catch(() => '')).replace(/s+/g, ' ').trim();
    console.log(`[STEP] Customer/driver message popup appeared: "${text.slice(0, 400)}" — closing it`);
    await modal.locator('button, .btn, .close').first().click({ timeout: 5_000 }).catch(() => {});
  });

  // MULTITENANT: after a movement is closed (and on other Cargos events) the app opens #cargosMsg
  // ("Trasmissione Contratto a Cargos", e.g. "TRASMISSIONE FALLITA! ... TIPO VEICOLO" on this test
  // server). It is informational for these tests; its backdrop blocked the sidebar menu (13 Oct 2026).
  const cargosMessage = page.locator('#cargosMsg:visible');
  page.addLocatorHandler(cargosMessage, async (modal) => {
    const text = (await modal.innerText().catch(() => '')).replace(/s+/g, ' ').trim();
    console.log(`[STEP] Cargos message popup appeared: "${text.slice(0, 300)}" — closing it`);
    await modal.getByRole('button', { name: 'Close' }).first().click({ timeout: 5_000 }).catch(() => {});
  });

  const openContract = page.locator(POPUP_SELECTOR, { hasText: OPEN_CONTRACT_WARNING });
  page.addLocatorHandler(openContract, async (modal) => {
    console.log('[STEP] "Another open contract for this driver" warning appeared — clicking OK');
    // OK can reload/navigate the page (seen on a monthly rental's Show page,
    // 7 Oct 2026), detaching the button mid-click — bounded and non-fatal, or
    // the handler's own 30s click timeout fails whatever action it interrupted.
    await modal
      .getByRole('button', { name: /^(OK|Yes|Continue)$/i })
      .first()
      .click({ timeout: 5_000, noWaitAfter: true })
      .catch(() => {});
  });

  page.on('dialog', async (dialog) => {
    if (OPEN_CONTRACT_WARNING.test(dialog.message())) {
      console.log(`[STEP] Dialog appeared: "${dialog.message().replace(/\s+/g, ' ').trim()}" — accepting`);
      await dialog.accept();
    } else {
      // Same outcome as Playwright's default for an unhandled dialog — kept
      // explicit, since registering any listener turns that default off.
      await dialog.dismiss();
    }
  });
}

function timestamp(): string {
  return new Date().toISOString();
}

export { expect };
