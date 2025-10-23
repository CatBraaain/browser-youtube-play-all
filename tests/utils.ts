import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

export class EventWatcher {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  public async setInitScript(eventName: string) {
    await this.page.addInitScript(
      ({ eventName, flagName }: { eventName: string; flagName: string }) => {
        (window as any)[flagName] = false;
        window.addEventListener(eventName, () => {
          (window as any)[flagName] = true;
        });
      },
      { eventName, flagName: this.getFlagName(eventName) },
    );
  }

  public async expect(expectation: {
    eventName: string;
    fired: boolean;
    timeout?: number;
  }) {
    const { eventName, fired, timeout = 3000 } = expectation;
    if (fired) {
      await expect(
        this.waitForFired(eventName, timeout),
      ).resolves.not.toThrow();
    } else {
      await expect(this.waitForFired(eventName, timeout)).rejects.toThrow(
        "Timeout",
      );
    }
  }

  public async waitForFired(eventName: string, timeout: number = 3000) {
    const flagName = this.getFlagName(eventName);
    const res = await this.page.waitForFunction(
      (flagName) => (window as any)[flagName] === true,
      flagName,
      { timeout: timeout === 0 ? 1 : timeout },
    );
    await this.resetFlag(flagName);
    return res;
  }

  private getFlagName(eventName: string) {
    return `__${eventName}_fired`;
  }

  private async resetFlag(flagName: string) {
    await this.page.evaluate((flagName) => {
      (window as any)[flagName] = false;
    }, flagName);
  }
}

export const ytTest = test.extend<{ eventWatcher: EventWatcher }>({
  eventWatcher: async ({ page }, use) => {
    const eventWatcher = new EventWatcher(page);
    await eventWatcher.setInitScript("yt-navigate-start");
    await eventWatcher.setInitScript("yt-navigate-finish");

    await use(eventWatcher);
  },
});
