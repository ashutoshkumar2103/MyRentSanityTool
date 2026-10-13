import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { appUrl } from '../utils/instances';

/**
 * The Fine List page (`/MyRentWeb/MRFine/index`) — what "Administration >
 * Fines Management > Fine" in the top nav actually opens (see
 * `HomePage.openFineManagementFineViaMenu()`), not a create form directly.
 */
export class FineListPage extends BasePage {
  readonly newFineLink: Locator;

  constructor(page: Page) {
    super(page);
    this.newFineLink = page.getByRole('link', { name: 'New Fine' });
  }

  async open() {
    await this.goto(appUrl('/MRFine/index'));
  }

  async clickNewFine() {
    await this.newFineLink.click();
  }
}
