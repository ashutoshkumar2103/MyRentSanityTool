import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { currentInstance, homeUrlPattern } from '../utils/instances';

export const TOP_NAV_ITEMS = [
  'Dashboard',
  'MyRent',
  'Fleet',
  'Rate',
  'Tools',
  'Administration',
  'CRM',
  'Configurations',
  'B.I.',
  'About',
] as const;

export type TopNavItem = (typeof TOP_NAV_ITEMS)[number];

export class HomePage extends BasePage {
  readonly nav: Locator;
  /** div.user-labels holds two `span.user-name-new` siblings: [0] the account name, [1] the role. */
  readonly userLabels: Locator;
  readonly accountName: Locator;
  readonly roleLabel: Locator;
  readonly userMenuToggle: Locator;
  readonly logoutLink: Locator;
  readonly dashboardOverviewHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.nav = page.locator('div.hor-menu ul.navbar-nav');
    this.userLabels = page.locator('div.user-labels span.user-name-new');
    this.accountName = this.userLabels.nth(0);
    this.roleLabel = this.userLabels.nth(1);
    // Log Out lives in a Bootstrap dropdown (li#userIcon) that must be opened first —
    // it's rendered but display:none/hidden until the toggle is clicked.
    this.userMenuToggle = page.locator('li#userIcon > a.dropdown-toggle');
    this.logoutLink = page.locator('ul#user_dropdown').getByRole('link', { name: 'Log Out' });
    this.dashboardOverviewHeading = page.getByText('Dashboard Overview');
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(homeUrlPattern());
    await expect(this.accountName).toBeVisible();
  }

  navItem(name: TopNavItem): Locator {
    // Top-level menu links carry a Font Awesome caret icon whose CSS-generated
    // content Chromium folds into the accessible name, so exact role-name matches
    // fail. Match on the direct-child anchor's text instead, and scope to `> li > a`
    // so nested submenu items with the same label (e.g. "Fleet", "Rate") are excluded.
    return this.nav.locator('> li > a').filter({ hasText: name });
  }

  async openNavItem(name: TopNavItem) {
    await this.navItem(name).click();
  }

  /**
   * The user-menu dropdown is the same kind of Bootstrap toggle as the CRM
   * tab switch and menu hovers elsewhere in this codebase — opening it isn't
   * guaranteed to apply synchronously with the toggle click, so a bare
   * click-then-click can race it. Retrying the toggle click, same pattern as
   * CustomerPage.switchToNotesOtherInfoTab(), is cheap insurance against that.
   */
  async logout() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.userMenuToggle.click();
      try {
        await expect(this.logoutLink).toBeVisible({ timeout: 5_000 });
        await this.logoutLink.click();
        return;
      } catch {
        console.log(`[STEP] Attempt ${attempt}/3 to open the user menu didn't show "Log Out" — retrying`);
      }
    }
    throw new Error('Could not open the user menu to log out after 3 attempts.');
  }

  /**
   * Hovers "MyRent" and retries if whatever should be revealed under it
   * isn't actually there yet — same Bootstrap mega-menu timing race already
   * fixed for CRM > Customers (openNewCustomerViaMenu()) and the user-menu
   * dropdown (logout()): hovering the top-level item doesn't guarantee its
   * menu content is genuinely open and stable by the time the next action
   * runs. Confirmed live (3 Sep 2026) this can hit any of MyRent's own
   * submenus, not just one — openCalendarPlanningViaMenu() failed this exact
   * way in a real run, and it had never gotten this hardening before.
   *
   * Also dismisses any currently-open Bootstrap modal before each attempt —
   * confirmed live (25 Sep 2026) a just-created entity's success modal (e.g.
   * Reservation/Rental Agreement's shared #RACreateMessageModal) can still be
   * open, or can appear asynchronously right as this starts, and its backdrop
   * blocks the hover itself. That first hover used to sit outside this retry
   * loop's own try/catch, so a blocked hover threw immediately instead of
   * retrying — moved inside so every attempt gets the same dismiss-then-hover
   * treatment.
   */
  private async dismissAnyOpenModal(): Promise<void> {
    const openModal = this.page.locator('.modal.in, .modal.show').first();
    if (!(await openModal.isVisible().catch(() => false))) return;
    const closeButton = openModal.locator('.close, button[data-dismiss="modal"]').first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(openModal).toBeHidden().catch(() => {});
  }

  private async hoverMyRentThenAct(action: () => Promise<void>): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.dismissAnyOpenModal();
      try {
        await this.navItem('MyRent').hover();
        await action();
        return;
      } catch {
        console.log(`[STEP] Attempt ${attempt}/3 to open the MyRent menu didn't take — retrying`);
      }
    }
    throw new Error('Could not open the MyRent menu after 3 attempts.');
  }

  /** Hovers MyRent > Quotation (a nested hover-dropdown) and clicks "New". */
  async openNewQuotationViaMenu() {
    const quotationSubmenu = this.page.locator('li.dropdown-submenu:has(> a:text-is("Quotation"))');
    await this.hoverMyRentThenAct(async () => {
      // Hovering the <li> container doesn't reliably open the nested
      // dropdown — the hover-dropdown plugin needs the pointer on the <a> itself.
      await quotationSubmenu.locator('> a').hover({ timeout: 5_000 });
      // Same issue as navItem() above: "New" also carries a Font Awesome icon
      // whose CSS-generated content pollutes the computed accessible name, so
      // getByRole('link', { name: 'New' }) matches nothing even though it's
      // visibly on screen. Match by text instead.
      await quotationSubmenu.locator('a').filter({ hasText: 'New' }).click({ timeout: 5_000 });
    });
  }

  /** Hovers MyRent > Quotation (a nested hover-dropdown) and clicks "List", landing on the Quotation List page. */
  async openQuotationListViaMenu() {
    const quotationSubmenu = this.page.locator('li.dropdown-submenu:has(> a:text-is("Quotation"))');
    await this.hoverMyRentThenAct(async () => {
      await quotationSubmenu.locator('> a').hover({ timeout: 5_000 });
      await quotationSubmenu.locator('a:text-is("List")').click({ timeout: 5_000 });
    });
  }

  /** Hovers MyRent and clicks "Calendar Planning" — a direct link, not a nested submenu. */
  async openCalendarPlanningViaMenu() {
    await this.hoverMyRentThenAct(async () => {
      await this.nav.locator('li.mega-menu-dropdown a').filter({ hasText: 'Calendar Planning' }).click({ timeout: 5_000 });
    });
  }

  /**
   * Hovers MyRent > Rental (a nested hover-dropdown) and clicks "New".
   * MyRent's top-nav calls the Reservation entity "Rental" — see the
   * entity-naming table in the README. Some instances rename these submenus
   * (noleggiaretest: "Reservation" / "Rental Agreement"), so the names come
   * from InstanceProfile.menu (utils/instances.ts).
   */
  async openNewReservationViaMenu() {
    // .first(): rentalplustest's menu has 3 submenus with this name (9 Oct 2026),
    // which made the locator ambiguous; the first is the one under MyRent. On
    // instances with exactly one it is the same element as before.
    const rentalSubmenu = this.page.locator(`li.dropdown-submenu:has(> a:text-is("${currentInstance.menu.reservation}"))`).first();
    await this.hoverMyRentThenAct(async () => {
      await rentalSubmenu.locator('> a').hover({ timeout: 5_000 });
      await rentalSubmenu.locator('a').filter({ hasText: 'New' }).click({ timeout: 5_000 });
    });
  }

  /**
   * Hovers MyRent > Rental (a nested hover-dropdown) and clicks "List",
   * landing on the Reservation List page. MyRent's top-nav calls the
   * Reservation entity "Rental" — see openNewReservationViaMenu() above.
   */
  async openReservationListViaMenu() {
    // .first(): see openNewReservationViaMenu().
    const rentalSubmenu = this.page.locator(`li.dropdown-submenu:has(> a:text-is("${currentInstance.menu.reservation}"))`).first();
    await this.hoverMyRentThenAct(async () => {
      await rentalSubmenu.locator('> a').hover({ timeout: 5_000 });
      await rentalSubmenu.locator('a:text-is("List")').click({ timeout: 5_000 });
    });
  }

  /** Hovers MyRent > Board Rental (a nested hover-dropdown) and clicks "New". */
  async openNewRentalAgreementViaMenu() {
    const boardRentalSubmenu = this.page.locator(`li.dropdown-submenu:has(> a:text-is("${currentInstance.menu.rentalAgreement}"))`);
    await this.hoverMyRentThenAct(async () => {
      await boardRentalSubmenu.locator('> a').hover({ timeout: 5_000 });
      await boardRentalSubmenu.locator('a').filter({ hasText: 'New' }).click({ timeout: 5_000 });
    });
  }

  /**
   * Hovers MyRent > Board Rental (a nested hover-dropdown) and clicks "List",
   * landing on the Rental Agreement List page. The Board Rental submenu also
   * has a "Cargos List" link, which also contains the substring "List" — the
   * exact text match below is what keeps this on the right one.
   */
  async openRentalAgreementListViaMenu() {
    const boardRentalSubmenu = this.page.locator(`li.dropdown-submenu:has(> a:text-is("${currentInstance.menu.rentalAgreement}"))`);
    await this.hoverMyRentThenAct(async () => {
      await boardRentalSubmenu.locator('> a').hover({ timeout: 5_000 });
      await boardRentalSubmenu.locator('a:text-is("List")').click({ timeout: 5_000 });
    });
  }

  /**
   * Hovers CRM > Customers (a nested hover-dropdown) and clicks "New". Same
   * Bootstrap-dropdown timing issue as logout() and CustomerPage's tab
   * switch: hovering the top-level "CRM" item doesn't guarantee the nested
   * "Customers" submenu is actually open and stable yet, so retrying the
   * outer hover is cheap insurance against the nested one racing it.
   */
  async openNewCustomerViaMenu() {
    const customersSubmenu = this.page.locator('li.dropdown-submenu:has(> a:text-is("Customers"))');
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.navItem('CRM').hover();
      try {
        await customersSubmenu.locator('> a').hover({ timeout: 5_000 });
        await customersSubmenu.locator('a').filter({ hasText: 'New' }).click();
        return;
      } catch {
        console.log(`[STEP] Attempt ${attempt}/3 to open the CRM > Customers menu didn't take — retrying`);
      }
    }
    throw new Error('Could not open the CRM > Customers menu after 3 attempts.');
  }

  /**
   * Hovers Administration > Fines Management (a nested hover-dropdown) and
   * clicks "Fine" — same Bootstrap-dropdown timing issue as
   * openNewCustomerViaMenu(). Lands on the Fine List page
   * (`/MyRentWeb/MRFine/index`), not a create form — see `FineListPage`.
   */
  async openFineManagementFineViaMenu() {
    const finesManagementSubmenu = this.page.locator('li.dropdown-submenu:has(> a:text-is("Fines Management"))');
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.navItem('Administration').hover();
      try {
        await finesManagementSubmenu.locator('> a').hover({ timeout: 5_000 });
        // Exact text match — the submenu also has "Fine Authority", "Process
        // Fines" and "Massive fines import", all of which contain "Fine".
        await finesManagementSubmenu.locator('a:text-is("Fine")').click({ timeout: 5_000 });
        return;
      } catch {
        console.log(`[STEP] Attempt ${attempt}/3 to open the Administration > Fines Management menu didn't take — retrying`);
      }
    }
    throw new Error('Could not open the Administration > Fines Management menu after 3 attempts.');
  }
}
