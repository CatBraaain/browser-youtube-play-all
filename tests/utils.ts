import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

class EventWatcher {
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
    const { eventName, fired, timeout = 5000 } = expectation;
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

  public async waitForFired(eventName: string, timeout: number = 5000) {
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

class ChannelIdFinder {
  constructor(private page: Page) {}

  public async setInitScript() {
    await this.page.addInitScript(
      ({ eventName, globalVar }: { eventName: string; globalVar: string }) => {
        (window as any)[globalVar] = false;
        window.addEventListener(eventName, (e) => {
          (window as any)[globalVar] = (e as CustomEvent).detail;
        });
      },
      {
        eventName: "yt-navigate-finish",
        globalVar: "__yt-navigate-finish",
      },
    );
  }

  async exceptFromNavigationEvent(exists: boolean) {
    const lastEvent = await this.page.evaluate(
      () => (window as any)["__yt-navigate-finish"],
    );
    const channelId = lastEvent?.endpoint.browseEndpoint.browseId;
    exists
      ? expect(channelId).toEqual(expect.stringMatching(/UC.*/))
      : expect(channelId).toBeUndefined();
  }

  async exceptFromCanonicalLink(exists: boolean) {
    const locator = this.page.locator('[rel="canonical"]');
    const channelId =
      (await locator.count()) > 0
        ? (await locator.first().getAttribute("href"))!
        : undefined;
    exists
      ? expect(channelId).toEqual(expect.stringMatching(/UC.*/))
      : expect(channelId).toBeUndefined();
  }

  async exceptFromYtInitialData(exists: boolean) {
    const channelId = await this.page.evaluate(
      () =>
        (window as any).ytInitialData.responseContext.serviceTrackingParams
          .find((e: any) => e.service === "GOOGLE_HELP")
          ?.params.find((e: any) => e.key === "browse_id").value,
    );
    exists
      ? expect(channelId).toEqual(expect.stringMatching(/UC.*/))
      : await expect(channelId).toBeUndefined();
  }

  async exceptFromYtCommand(exists: boolean) {
    const channelId = await this.page.evaluate(
      () => (window as any).ytCommand.browseEndpoint?.browseId,
    );
    exists
      ? expect(channelId).toEqual(expect.stringMatching(/UC.*/))
      : await expect(channelId).toBeUndefined();
  }
}

export const ytTest = test.extend<{
  eventWatcher: EventWatcher;
  channelIdFinder: ChannelIdFinder;
}>({
  eventWatcher: async ({ page }, use) => {
    const eventWatcher = new EventWatcher(page);
    await eventWatcher.setInitScript("yt-navigate-start");
    await eventWatcher.setInitScript("yt-navigate-finish");
    await use(eventWatcher);
  },
  channelIdFinder: async ({ page }, use) => {
    const channelIdFinder = new ChannelIdFinder(page);
    await channelIdFinder.setInitScript();
    await use(channelIdFinder);
  },
});
