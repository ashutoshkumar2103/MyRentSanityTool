import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import type { Role } from './utils/env.ts';
import { currentInstance } from './utils/instances';

// MULTITENANT environment — a separate Playwright config from the tenant-based
// one at the repo root. Run with: npx playwright test --config=multitenant/playwright.config.ts
// (the multitenant dashboard routes and CLI do this for you).
//
// Which account global-setup.ts logs in as, and which stored session the
// 'sanity' project reuses — set by the dashboard/CLI "Run as" option
// (MT_RUN_AS on the spawned Playwright process). Defaults to administrator.
export const RUN_AS: Role = process.env.MT_RUN_AS === 'operator' ? 'operator' : 'administrator';
// Sessions are kept per instance under multitenant/.auth, so one saved for an
// instance is never reused against another — and never mixes with the
// tenant-based playwright/.auth folder.
const AUTH_DIR = path.join(__dirname, '.auth', currentInstance.id);
export const AUTH_STATE_PATH = path.join(AUTH_DIR, RUN_AS === 'operator' ? 'operator.json' : 'admin.json');

// Every timeout below scales by the instance's timeoutMultiplier — see
// InstanceProfile in utils/instances.ts.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 60_000 * currentInstance.timeoutMultiplier,
  expect: { timeout: 15_000 * currentInstance.timeoutMultiplier },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Kept at 1: concurrent sessions make this shared legacy test server slow
  // enough to blow past test timeouts.
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: currentInstance.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000 * currentInstance.timeoutMultiplier,
    navigationTimeout: 30_000 * currentInstance.timeoutMultiplier,
    // Safe static defaults for headless runs. A --headed run gets maximized
    // instead — see the viewport / launchOptions fixture overrides in
    // fixtures/testWithCrashLogging.ts.
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
    },
  ],
});
