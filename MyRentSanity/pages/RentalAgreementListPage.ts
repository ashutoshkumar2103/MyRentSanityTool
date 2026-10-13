import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { appUrl, currentInstance } from '../utils/instances';

/** Plate + rental window read off one row of the Board RA List table. */
export interface RentalSummary {
  referenceId: string;
  plate: string;
  dateOut: Date;
  dateIn: Date;
}

export class RentalAgreementListPage extends BasePage {
  readonly newRentalAgreementLink: Locator;
  readonly firstRow: Locator;

  constructor(page: Page) {
    super(page);
    // The plain href selector also matches an unrelated icon link elsewhere
    // on the page — the actual button has its own accessible name.
    this.newRentalAgreementLink = page.getByRole('link', { name: currentInstance.menu.newRentalAgreementButton });
    this.firstRow = page.locator('table tbody tr').first();
  }

  async open() {
    await this.goto(appUrl('/MRRentalAgreement/index'));
  }

  async clickNewRentalAgreement() {
    await this.newRentalAgreementLink.click();
  }

  /**
   * Reads Nr./Plate/Date OUT/Date IN off the first row — confirmed live (15
   * Sep 2026) the table has no hidden columns on this list (every `<th>`/`<td>`
   * is visible), so these are plain 1-based `nth-child` positions matching the
   * on-screen "Nr." / "Plate" / "Date OUT" / "Date IN" headers, not derived
   * from a header-text lookup. Used to pick "some real, already-open rental"
   * for flows (e.g. Fine creation) that need a genuine plate + rental window
   * rather than fabricated data.
   */
  async getFirstRentalSummary(): Promise<RentalSummary> {
    const cells = this.firstRow.locator('td');
    const referenceId = (await cells.nth(0).innerText()).trim();
    const plate = (await cells.nth(3).innerText()).trim();
    const dateOutText = (await cells.nth(7).innerText()).trim();
    const dateInText = (await cells.nth(9).innerText()).trim();
    // "YYYY-MM-DD HH:mm" isn't ISO 8601 as-is (needs a "T") for Date to parse
    // it reliably instead of falling back to browser-specific parsing.
    const dateOut = new Date(dateOutText.replace(' ', 'T'));
    const dateIn = new Date(dateInText.replace(' ', 'T'));
    return { referenceId, plate, dateOut, dateIn };
  }
}
