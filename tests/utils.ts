import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { chromium, expect, test } from "@playwright/test";
import {
  type CategoryKind,
  CategoryPage,
  type SortKind,
} from "@/entrypoints/content/category-page";

class EventWatcher {
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
      () => (window as any)[containerName],
    );
    return lastEventContent;
  }

  private async resetFlag(flagName: string) {
    await this.page.evaluate((flagName) => {
      (window as any)[flagName] = false;
    }, flagName);
  }
}

class ChannelIdFinder {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  async expectNavigationEvent(exists: boolean) {
    const lastEventContent = await this.eventWatcher.getLastEventContent(
      "__yt-navigate-finish",
    );
    const channelId = lastEventContent?.endpoint.browseEndpoint.browseId;
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
    category: CategoryKind,
    sort: SortKind,
  ) {
    await this.page.goto(
      `https://www.youtube.com/${channelName}/${category.toLocaleLowerCase()}`,
    );
    await this.eventWatcher.waitForFired("yt-navigate-finish");

    await this.page
      .locator(`${CategoryPage.sortButtonHolderSelector}>*`)
      .nth(CategoryPage.sorts.indexOf(sort))
      .click();
    await this.page
      .locator(
        `.play-all-btn.${category.toLocaleLowerCase()}.${sort.toLocaleLowerCase()}`,
      )
      .waitFor({ timeout: 10000 });
  }

  public async getTopVideoIds(n: number = 3): Promise<string[]> {
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
