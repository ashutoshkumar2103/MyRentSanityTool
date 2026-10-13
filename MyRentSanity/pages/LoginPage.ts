import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { appUrl, currentInstance } from '../utils/instances';

export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly companyCodeInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('#j_username');
    this.passwordInput = page.locator('#j_password');
    this.companyCodeInput = page.locator('#company');
    this.signInButton = page.locator('#submitBtn');
    this.errorMessage = page.locator('div.flashMessage');
  }

  async open() {
    // `?lang=en` on the login page switches the whole session to English —
    // see InstanceProfile.forceEnglish in utils/instances.ts.
    await this.goto(appUrl(currentInstance.forceEnglish ? '/user/home?lang=en' : '/user/home'));
    await expect(this.usernameInput).toBeVisible();
  }

  async login(username: string, password: string, companyCode: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.companyCodeInput.fill(companyCode);
    await this.signInButton.click();
  }
}
