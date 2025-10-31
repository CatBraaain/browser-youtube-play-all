import type { Locator, Page } from "@playwright/test";
import {
  type CategoryKind,
  CategoryPage,
  type SortKind,
} from "@/entrypoints/content/category-page";
import type { EventWatcher } from "./fixture";

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
