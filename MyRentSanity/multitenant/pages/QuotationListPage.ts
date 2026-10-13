import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { appUrl, currentInstance } from '../utils/instances';

export class QuotationListPage extends BasePage {
  readonly newQuotationLink: Locator;

  constructor(page: Page) {
    super(page);
    this.newQuotationLink = page.getByRole('link', { name: currentInstance.menu.newQuotationButton });
  }

  async open() {
    await this.goto(appUrl('/preventivi/index'));
  }

  async clickNewQuotation() {
    await this.newQuotationLink.click();
  }
}
