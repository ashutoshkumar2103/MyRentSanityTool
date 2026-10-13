import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import type { Role } from './utils/env.ts';
import { DEFAULT_INSTANCE_ID, currentInstance } from './utils/instances';

// Which account global-setup.ts logs in as, and which stored session the
// 'sanity' project below reuses — set by the automation dashboard/CLI's
// "Run as" role option (SANITY_RUN_AS env var on the spawned Playwright
// process). Defaults to administrator for a plain `npm test`.
export const RUN_AS: Role = process.env.SANITY_RUN_AS === 'operator' ? 'operator' : 'administrator';
// testee keeps its original paths; every other instance (SANITY_INSTANCE, see
// utils/instances.ts) gets its own folder, so a session saved for one
// instance is never reused against another.
const AUTH_DIR = currentInstance.id === DEFAULT_INSTANCE_ID ? 'playwright/.auth' : `playwright/.auth/${currentInstance.id}`;
export const AUTH_STATE_PATH = RUN_AS === 'operator' ? `${AUTH_DIR}/operator.json` : `${AUTH_DIR}/admin.json`;

// Every timeout below scales by the instance's timeoutMultiplier (1 on
// testee, so unchanged there) — see InstanceProfile in utils/instances.ts.
export default defineConfig({
  testDir: './tests',
  // Authenticates once and writes AUTH_STATE_PATH — see global-setup.ts for
  // why this is a globalSetup script rather than a 'setup' project.
  globalSetup: './global-setup.ts',
  // MyRent's dashboard is a heavy legacy page (jQuery/Metronic widgets, charts,
  // Google Maps, several polling AJAX calls) — give it real headroom rather than
  // the Playwright default.
  timeout: 60_000 * currentInstance.timeoutMultiplier,
  expect: { timeout: 15_000 * currentInstance.timeoutMultiplier },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Kept at 1: several headless sessions hitting the same remote test server at
  // once made an already-heavy dashboard slow enough to blow past test timeouts.
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: currentInstance.id === DEFAULT_INSTANCE_ID ? (process.env.MYRENT_BASE_URL ?? currentInstance.baseUrl) : currentInstance.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000 * currentInstance.timeoutMultiplier,
    navigationTimeout: 30_000 * currentInstance.timeoutMultiplier,
    // Safe static defaults for headless runs. A --headed run gets maximized
    // (viewport: null + --start-maximized) instead — see the viewport /
    // deviceScaleFactor / launchOptions fixture overrides in
    // fixtures/testWithCrashLogging.ts for why that can't live here as a
    // static, argv-sniffed value.
    viewport: { width: 1280, height: 720 },
    launchOptions: {},
  },

  projects: [
    {
      name: 'sanity',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_STATE_PATH,
      },
      testMatch: /.*\.spec\.ts/,
      testIgnore: /login\.spec\.ts/,
    },
    {
      name: 'no-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /login\.spec\.ts/,
    },
  ],
});
