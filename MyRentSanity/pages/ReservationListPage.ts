import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { appUrl, currentInstance } from '../utils/instances';

export class ReservationListPage extends BasePage {
  readonly newReservationLink: Locator;

  constructor(page: Page) {
    super(page);
    // The plain href selector also matches an unrelated icon link elsewhere
    // on the page — the actual button has its own accessible name.
    this.newReservationLink = page.getByRole('link', { name: currentInstance.menu.newReservationButton });
  }

  async open() {
    await this.goto(appUrl('/MRReservation/index'));
  }

  async clickNewReservation() {
    await this.newReservationLink.click();
  }
}
