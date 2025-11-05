import path from "node:path";
import type { Page } from "@playwright/test";
import { chromium, expect, test } from "@playwright/test";

export class EventWatcher {
  constructor(private page: Page) {}

  public async setInitScript(eventName: string) {
    await this.page.addInitScript(
      ({ eventName, varNames }: { eventName: string; varNames: string[] }) => {
        const [flagName, containerName] = varNames;
        (window as any)[flagName] = false;
        window.addEventListener(eventName, (e) => {
          (window as any)[flagName] = true;
          (window as any)[containerName] = (e as CustomEvent).detail;
        });
      },
      { eventName, varNames: this.getVarNames(eventName) },
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

  public async waitForFired(eventName: string, timeout: number = 10000) {
    const [flagName, _] = this.getVarNames(eventName);
    const res = await this.page.waitForFunction(
      (flagName) => (window as any)[flagName] === true,
      flagName,
      { timeout: timeout === 0 ? 1 : timeout },
    );
    await this.resetFlag(flagName);
    return res;
  }

  public getVarNames(eventName: string) {
    return [`__${eventName}_fired`, `__${eventName}_content`];
  }

  public async getLastEventContent(eventName: string) {
    const [_, containerName] = this.getVarNames(eventName);
    const lastEventContent = await this.page.evaluate(
      (containerName) => (window as any)[containerName],
      containerName,
    );
    return lastEventContent;
  }

  private async resetFlag(flagName: string) {
    await this.page.evaluate((flagName) => {
      (window as any)[flagName] = false;
    }, flagName);
  }
}

export class ChannelIdFinder {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  async expectNavigationEvent(exists: boolean) {
    const lastEventContent =
      await this.eventWatcher.getLastEventContent("yt-navigate-finish");
    const channelId = lastEventContent?.endpoint.browseEndpoint?.browseId;
    this.expectChannelIdCorrect(channelId, exists);
  }

  async expectCanonicalLink(exists: boolean) {
    const locator = this.page.locator('[rel="canonical"]');
    const channelId =
      (await locator.count()) > 0
        ? (await locator.first().getAttribute("href"))!
        : undefined;
    this.expectChannelIdCorrect(channelId, exists);
  }

  async expectYtInitialData(exists: boolean) {
    const channelId = await this.page.evaluate(
      () =>
        (window as any).ytInitialData.responseContext.serviceTrackingParams
          .find((e: any) => e.service === "GOOGLE_HELP")
          ?.params.find((e: any) => e.key === "browse_id").value,
    );
    this.expectChannelIdCorrect(channelId, exists);
  }

  async expectYtCommand(exists: boolean) {
    const channelId = await this.page.evaluate(
      () => (window as any).ytCommand.browseEndpoint?.browseId,
    );
    this.expectChannelIdCorrect(channelId, exists);
  }

  async expectChannelIdCorrect(channelId: string | undefined, exists: boolean) {
    exists
      ? expect(channelId).toEqual(expect.stringMatching(/UC.*/))
      : expect(channelId).not.toEqual(expect.stringMatching(/UC.*/));
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
  channelIdFinder: async ({ page, eventWatcher }, use) => {
    const channelIdFinder = new ChannelIdFinder(page, eventWatcher);
    await use(channelIdFinder);
  },
});

export const ytxTest = ytTest.extend({
  context: async ({ browserName }, use) => {
    switch (browserName) {
      case "chromium": {
        const chromeExtensionPath = path.join(
          import.meta.dirname,
          "../dist/chrome-mv3",
        );
        const context = await chromium.launchPersistentContext("", {
          channel: "chromium",
          args: [
            `--disable-extensions-except=${chromeExtensionPath}`,
            `--load-extension=${chromeExtensionPath}`,
            "--mute-audio",
          ],
        });
        await use(context);
        await context.close();
        break;
      }
      default: {
        throw new Error("Unsupported browser");
      }
    }
  },
});
