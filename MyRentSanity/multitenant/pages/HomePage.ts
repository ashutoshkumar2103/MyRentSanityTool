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

/**
 * MULTITENANT home page. The multitenant app has the NEW interface: no
 * horizontal top menu — the menu is a collapsible left sidebar (#sidebarScrollWrapper,
 * opened with #sidebarToggle) whose sections and submenus are CLICKED open, not
 * hovered. The menu hierarchy itself is unchanged (MyRent > Quotation > New …),
 * so the page's public methods keep the same names as the tenant-based HomePage.
 */
export class HomePage extends BasePage {
  readonly nav: Locator;
  readonly sidebarToggle: Locator;
  /** div.user-labels holds two `span.user-name-new` siblings: [0] the account name, [1] the role. */
  readonly userLabels: Locator;
  readonly accountName: Locator;
  readonly roleLabel: Locator;
  readonly userMenuToggle: Locator;
  readonly logoutLink: Locator;
  readonly dashboardOverviewHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.nav = page.locator('#sidebarScrollWrapper');
    this.sidebarToggle = page.locator('#sidebarToggle');
    this.userLabels = page.locator('div.user-labels span.user-name-new');
    this.accountName = this.userLabels.nth(0);
    this.roleLabel = this.userLabels.nth(1);
    // Log Out lives in a Bootstrap dropdown (li#userIcon) that must be opened first —
    // it's rendered but display:none/hidden until the toggle is clicked.
    this.userMenuToggle = page.locator('#sidebarToggle');
    this.logoutLink = page.locator('a.sidebar-logout-btn');
    this.dashboardOverviewHeading = page.getByText('Dashboard Overview');
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(homeUrlPattern());
    await expect(this.accountName).toBeVisible();
  }

  navItem(name: TopNavItem): Locator {
    // Sidebar entries are matched on their whole text; the first match is the
    // top-level one (the same label can also appear nested further down, e.g. "Fleet").
    // (The only label with a regex-special character is "B.I." — its dot matches itself, which is fine here.)
    return this.nav.locator('li > a').filter({ hasText: new RegExp('^\\s*' + name + '\\s*$') }).first();
  }

  /** The sidebar starts collapsed on every page load — open it if it is not showing yet. */
  private async openSidebar(): Promise<void> {
    // Open = <body class="menu-open">. (Not "is the Dashboard link visible": while collapsed
    // the sidebar is only slid off-screen, so its links still count as visible.)
    const open = this.page.locator('body.menu-open');
    if ((await open.count()) > 0) return;
    await this.sidebarToggle.click({ timeout: 5_000 });
    await expect(open).toHaveCount(1, { timeout: 5_000 });
  }

  /** Opens the sidebar and expands a top-level section (MyRent, CRM, Administration …) unless it is already expanded. */
  private async openSidebarSection(name: TopNavItem): Promise<void> {
    await this.openSidebar();
    const section = this.navItem(name);
    const firstChild = section.locator('xpath=following-sibling::ul[1]//a').first();
    if (!(await firstChild.isVisible().catch(() => false))) await section.click({ timeout: 5_000 });
    await expect(firstChild).toBeVisible({ timeout: 5_000 });
  }

  /** Expands a nested submenu (Quotation, Reservation, Customers …) with a click, unless it is already open. */
  private async expandSubmenu(submenu: Locator): Promise<void> {
    const firstChild = submenu.locator('ul.dropdown-menu a').first();
    if (!(await firstChild.isVisible().catch(() => false))) await submenu.locator('> a').click({ timeout: 5_000 });
    await expect(firstChild).toBeVisible({ timeout: 5_000 });
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
      await this.openSidebar().catch(() => {});
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
        await this.openSidebarSection('MyRent');
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
      await this.expandSubmenu(quotationSubmenu);
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
      await this.expandSubmenu(quotationSubmenu);
      await quotationSubmenu.locator('a:text-is("List")').click({ timeout: 5_000 });
    });
  }

  /** Hovers MyRent and clicks "Calendar Planning" — a direct link, not a nested submenu. */
  async openCalendarPlanningViaMenu() {
    await this.hoverMyRentThenAct(async () => {
      await this.nav.locator('a').filter({ hasText: 'Calendar Planning' }).first().click({ timeout: 5_000 });
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
      await this.expandSubmenu(rentalSubmenu);
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
      await this.expandSubmenu(rentalSubmenu);
      await rentalSubmenu.locator('a:text-is("List")').click({ timeout: 5_000 });
    });
  }

  /** Hovers MyRent > Board Rental (a nested hover-dropdown) and clicks "New". */
  async openNewRentalAgreementViaMenu() {
    const boardRentalSubmenu = this.page.locator(`li.dropdown-submenu:has(> a:text-is("${currentInstance.menu.rentalAgreement}"))`);
    await this.hoverMyRentThenAct(async () => {
      await this.expandSubmenu(boardRentalSubmenu);
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
      await this.expandSubmenu(boardRentalSubmenu);
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
      await this.openSidebarSection('CRM');
      try {
        await this.expandSubmenu(customersSubmenu);
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
      await this.openSidebarSection('Administration');
      try {
        await this.expandSubmenu(finesManagementSubmenu);
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
