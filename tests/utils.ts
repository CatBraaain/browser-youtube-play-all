import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { chromium, expect, test } from "@playwright/test";

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

  public async waitForFired(eventName: string, timeout: number = 10000) {
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

export class YtSearchPage {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  public get topChannelThumbnailButton(): Locator {
    return this.page.locator("#channel-thumbnail").first(); // [href^="/channel/"] or [href^="link:///"]
  }
  public get topChannelNameButton(): Locator {
    return this.page.locator("#channel-info #channel-name").first();
  }

  public async search(searchWord: string): Promise<void> {
    await this.page.goto(
      `https://www.youtube.com/results?search_query=${searchWord}`,
    );
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }

  public async navigateToTopChannel(navigation: "soft1" | "soft2" | "hard") {
    switch (navigation) {
      case "soft1":
        this.topChannelThumbnailButton.click();
        await this.eventWatcher.waitForFired("yt-navigate-finish");
        break;
      case "soft2":
        this.topChannelNameButton.click();
        await this.eventWatcher.waitForFired("yt-navigate-finish");
        break;
      case "hard": {
        const relUrl =
          await this.topChannelThumbnailButton.getAttribute("href");
        await this.page.goto(`https://www.youtube.com${relUrl}`);
        await this.eventWatcher.waitForFired("yt-navigate-finish");
        break;
      }
    }
  }
}

export class YtVideoPage {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  public get channelThumbnailButton(): Locator {
    return this.page.locator("#owner [href]").first();
  }
  public get channelNameButton(): Locator {
    return this.page.locator("#upload-info [href]").first();
  }

  public async fromChannel(channelName: string) {
    await this.page.goto(`https://www.youtube.com/${channelName}/videos`);
    await this.eventWatcher.waitForFired("yt-navigate-finish");
    const videoRelUrl = await this.page
      .locator('[href*="/watch?"]')
      .first()
      .getAttribute("href");
    await this.page.goto(`https://www.youtube.com${videoRelUrl}`);
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }

  public async navigateToChannel(
    navigation: "soft1" | "soft2" | "hard",
  ): Promise<void> {
    switch (navigation) {
      case "soft1":
        this.channelThumbnailButton.click();
        break;
      case "soft2":
        this.channelNameButton.click();
        break;
      case "hard": {
        const relUrl = await this.channelThumbnailButton.getAttribute("href");
        await this.page.goto(`https://www.youtube.com${relUrl}`);
      }
    }
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }

  public async getPlaylistVideoIds(n: number = 3): Promise<string[]> {
    return await this.page
      .locator('#playlist #thumbnail[href*="/watch?"]')
      .evaluateAll(
        (links, n) =>
          links
            .slice(0, n)
            .map(
              (link) =>
                new URL(
                  `https://www.youtube.com${link.getAttribute("href")!}`,
                ).searchParams.get("v")!,
            ),
        n,
      );
  }
}

export class YtChannelPage {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  public get videoTab(): Locator {
    return this.page.locator('[role="tablist"] [role="tab"]').nth(1);
  }

  public async visit(channelName: string) {
    await this.page.goto(`https://www.youtube.com/${channelName}`);
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }

  public async navigateToVideoTab(
    navigation: "soft" | "hard",
    wait: boolean = true,
  ) {
    switch (navigation) {
      case "soft":
        await this.videoTab.click();
        break;
      case "hard": {
        await this.page.goto(`${this.page.url()}/videos`);
        break;
      }
    }
    if (wait) {
      await this.eventWatcher.waitForFired("yt-navigate-finish");
    }
  }

  public async visitTab(
    channelName: string,
    tab: "videos" | "shorts" | "streams",
    sort: "Latest" | "Popular" | "Oldest",
  ) {
    await this.page.goto(`https://www.youtube.com/${channelName}/${tab}`);
    await this.eventWatcher.waitForFired("yt-navigate-finish");

    switch (sort) {
      case "Latest":
        break;
      case "Popular":
        await this.page.evaluate(() =>
          document.querySelector(".play-all-btn")?.remove(),
        );
        await this.page.locator("#primary #header #chips > *").nth(1).click();
        await this.page.locator(".play-all-btn").waitFor({ timeout: 10000 });
        break;
      case "Oldest":
        await this.page.evaluate(() =>
          document.querySelector(".play-all-btn")?.remove(),
        );
        await this.page.locator("#primary #header #chips > *").nth(2).click();
        await this.page.locator(".play-all-btn").waitFor({ timeout: 10000 });
        break;
    }
  }

  public async getVideoIds(n: number = 3): Promise<string[]> {
    if (this.page.url().includes("shorts")) {
      return await this.page
        .locator('#contents [href*="/shorts"][title]')
        .evaluateAll(
          (links, n) =>
            links
              .slice(0, n)
              .map((link) => link.getAttribute("href")!.split("/").at(-1)!),
          n,
        );
    } else {
      return await this.page
        .locator('#contents [href*="/watch"][title]')
        .evaluateAll(
          (links, n) =>
            links
              .slice(0, n)
              .map(
                (link) =>
                  new URL(
                    `https://www.youtube.com${link.getAttribute("href")!}`,
                  ).searchParams.get("v")!,
              ),
          n,
        );
    }
  }

  public async navigateToPlayAll() {
    await this.page.locator(".play-all-btn").click();
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }
}
