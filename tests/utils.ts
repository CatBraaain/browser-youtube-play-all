import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export class EventWatcher {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  public async setInitScript(eventName: string) {
    const flagName = `__${eventName}Fired`;

    await this.page.addInitScript(
      ({ eventName, flagName }: { eventName: string; flagName: string }) => {
        (window as any)[flagName] = false;
        window.addEventListener(
          eventName,
          () => {
            (window as any)[flagName] = true;
          },
          { once: true },
        );
      },
      { eventName, flagName },
    );
  }

  public async expectFired(eventName: string, timeout: number = 3000) {
    await expect(this.waitForFired(eventName, timeout)).resolves.not.toThrow();
  }

  public async expectNotFired(eventName: string, timeout: number = 3000) {
    await expect(this.waitForFired(eventName, timeout)).rejects.toThrow(
      "Timeout",
    );
  }

  public async waitForFired(eventName: string, timeout: number) {
    const flagName = `__${eventName}Fired`;

    return await this.page.waitForFunction(
      (flagName) => (window as any)[flagName] === true,
      flagName,
      { timeout: timeout === 0 ? 1 : timeout },
    );
  }
}
