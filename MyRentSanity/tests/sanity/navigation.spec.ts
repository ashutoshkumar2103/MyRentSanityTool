import { test, expect } from '../../fixtures/testWithCrashLogging';
import { HomePage, TOP_NAV_ITEMS } from '../../pages/HomePage';
import { appUrl } from '../../utils/instances';

test.describe('Top navigation smoke checks', () => {
  // A single test that loads the dashboard once and checks every top-level menu
  // item, rather than one test per item: this dashboard is a heavy legacy page
  // (charts, Google Maps, DataTables), and reloading it once per nav item was
  // slow enough to start timing out. expect.soft keeps checking every item even
  // after one fails, so a single missing menu entry doesn't hide the others.
  test('dashboard loads and all top-level menu items are visible', async ({ page }) => {
    await page.goto(appUrl('/user/home'), { waitUntil: 'domcontentloaded' });

    const homePage = new HomePage(page);
    await homePage.expectLoaded();
    await expect(homePage.dashboardOverviewHeading).toBeVisible();

    for (const item of TOP_NAV_ITEMS) {
      await expect.soft(homePage.navItem(item), `"${item}" menu item should be visible`).toBeVisible();
    }
  });
});
