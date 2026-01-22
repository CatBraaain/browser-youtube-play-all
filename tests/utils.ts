import type { Locator, Page } from "@playwright/test";
import {
  type CategoryKind,
  CategoryPage,
  type SortKind,
} from "@/entrypoints/play-all-button.content/category-page";
import type { EventWatcher } from "./fixture";

export class YtSearchPage {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  public topVideoChannelThumbnailButton(
    channelName: string | null = null,
  ): Locator {
    return this.page
      .locator(
        "#channel-thumbnail" +
          (channelName !== null ? `[href*="/${channelName}"]` : ""),
      )
      .first(); // [href^="/channel/"] or [href^="link:///"]
  }
  public topVideoChannelNameButton(channelName: string | null = null): Locator {
    return this.page
      .locator(
        "#channel-info #channel-name" +
          (channelName !== null ? `:has([href*="/${channelName}"])` : ""),
      )
      .first();
  }

  public async search(
    searchWord: string,
    navigation: "soft" | "hard",
  ): Promise<void> {
    switch (navigation) {
      case "soft":
        await this.page.goto("https://www.youtube.com");
        await this.eventWatcher.waitForFired("yt-navigate-finish");
        await this.page.locator("input.yt-searchbox-input").fill(searchWord);
        await this.page.locator("input.yt-searchbox-input").press("Enter");
        break;
      case "hard":
        await this.page.goto(
          `https://www.youtube.com/results?search_query=${searchWord}`,
        );
        break;
    }
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }

  public async navigateToChannel(
    navigation: "soft1" | "soft2" | "hard",
    channelName: string | null = null,
  ) {
    switch (navigation) {
      case "soft1":
        this.topVideoChannelThumbnailButton(channelName).click();
        break;
      case "soft2":
        this.topVideoChannelNameButton(channelName).click();
        break;
      case "hard": {
        const relUrl =
          await this.topVideoChannelThumbnailButton(channelName).getAttribute(
            "href",
          );
        await this.page.goto(`https://www.youtube.com${relUrl}`);
        break;
      }
    }
    await this.eventWatcher.waitForFired("yt-navigate-finish");
  }
}

export class YtVideoPage {
  constructor(private page: Page) {}

  public get channelThumbnailButton(): Locator {
    return this.page.locator("#owner [href]").first();
  }
  public get channelNameButton(): Locator {
    return this.page.locator("#upload-info [href]").first();
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

  public async getPlaylistSelectedVideoId(n: number = 3): Promise<string> {
    return await this.page
      .locator('#playlist-items[selected] #thumbnail[href*="/watch?"]')
      .first()
      .evaluate(
        (link) =>
          new URL(
            `https://www.youtube.com${link.getAttribute("href")!}`,
          ).searchParams.get("v")!,
      );
  }
}

export class YtChannelPage {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  public get videoTab(): Locator {
    return this.page.locator('ytd-browse [role="tablist"] [role="tab"]').nth(1);
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
