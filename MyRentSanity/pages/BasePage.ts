import { Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string) {
    // Default waitUntil: 'load' never resolves quickly here — the page pulls in
    // a live-chat widget and the Google Maps JS API as third-party scripts, and
    // one of them is frequently slow enough to blow past a 30s navigation
    // timeout. We only need the app's own markup, so wait for DOMContentLoaded.
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }

  async waitForLoad() {
    await this.page.waitForLoadState('domcontentloaded');
  }
}
