import type { Locator, Page } from "@playwright/test";
import {
  type CategoryKind,
  CategoryTab,
  type SortKind,
} from "@/entrypoints/play-all-button.content/category-tab";
import { SortTab } from "@/entrypoints/play-all-button.content/sort-tab";
import YoutubePage from "@/entrypoints/play-all-button.content/youtube-page";
import type { EventWatcher } from "./fixture";

export class YtPage {
  constructor(
    private page: Page,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: <>
    private eventWatcher: EventWatcher,
  ) {}

  public get isMobile() {
    return new URL(this.page.url()).host === "m.youtube.com";
  }

  public get NavigationStartEvent(): string {
    return this.isMobile
      ? YoutubePage.MNAVIGATION_START_EVENT
      : YoutubePage.NAVIGATION_START_EVENT;
  }

  public get NavigationEndEvent(): string {
    return this.isMobile
      ? YoutubePage.MNAVIGATION_END_EVENT
      : YoutubePage.NAVIGATION_END_EVENT;
  }
}

export class YtSearchPage {
  private ytPage: YtPage;

  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {
    this.ytPage = new YtPage(this.page, this.eventWatcher);
  }

  public topVideoChannelThumbnailButton(
    channelName: string | null = null,
  ): Locator {
    return this.page
      .locator(
        this.ytPage.isMobile
          ? `.media-channel ${channelName !== null ? `[href="/${channelName}"]` : `[href*="/@"]`}`
          : `#channel-thumbnail:not([hidden])${channelName !== null ? `[href="/${channelName}"]` : ""}`,
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
        await this.eventWatcher.waitForFired(this.ytPage.NavigationEndEvent);
        if (this.ytPage.isMobile) {
          await this.page.goto("https://m.youtube.com/#searching");
        }
        await this.page.locator("input.yt-searchbox-input").fill(searchWord);
        await this.page.locator("input.yt-searchbox-input").press("Enter");
        break;
      case "hard":
        await this.page.goto(
          `https://www.youtube.com/results?search_query=${searchWord}`,
        );
        break;
    }
    await this.eventWatcher.waitForFired(this.ytPage.NavigationEndEvent);
  }

  public async navigateToChannel(
    channelName: string | null,
    navigation: "soft1" | "soft2" | "hard",
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
    await this.eventWatcher.waitForFired(this.ytPage.NavigationEndEvent);
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
    const locator = this.page.locator(
      "#playlist #thumbnail[href*='/watch?'],.YtmCompactMediaItemImage[href*='/watch']",
    );
    await locator.first().waitFor();
    return await locator.evaluateAll(
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

  public async getPlaylistSelectedVideoId(): Promise<string> {
    return await this.page
      .locator(
        "#playlist-items[selected] #thumbnail[href*='/watch?'],.ytmPlaylistPanelVideoRendererV2Selected [href*='/watch?']",
      )
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
  private ytPage: YtPage;

  constructor(
    private channelName: string,
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {
    this.ytPage = new YtPage(this.page, this.eventWatcher);
  }

  public async navigateToCategory(
    category: CategoryKind,
    navigation: "soft" | "hard",
    wait = true,
  ) {
    switch (navigation) {
      case "soft": {
        const n = CategoryTab.categories.indexOf(category) + 1;
        await this.page.locator("yt-tab-shape").nth(n).click();
        break;
      }
      case "hard": {
        await this.page.goto(
          `https://www.youtube.com/${this.channelName}/${category.toLowerCase()}`,
        );
        break;
      }
    }
    if (wait) {
      await this.eventWatcher.waitForFired(this.ytPage.NavigationEndEvent);
    }
  }

  public async navigateToSort(sort: SortKind) {
    await this.page
      .locator(SortTab.SORT_BUTTON)
      .nth(SortTab.sorts.indexOf(sort))
      .click();
  }

  public async getTopVideoIds(n: number = 3): Promise<string[]> {
    if (this.page.url().includes("shorts")) {
      return await this.page
        .locator(
          "ytd-browse[role='main'] [href*='/shorts'],ytm-browse [href*='/shorts']",
        )
        .evaluateAll((links, n) => {
          const videoIds = links.map(
            (link) => link.getAttribute("href")!.split("/").at(-1)!,
          );
          return [...new Set(videoIds)].slice(0, n);
        }, n);
    } else {
      return await this.page
        .locator(
          "ytd-browse[role='main'] [href*='/watch'],ytm-browse [href*='/watch']",
        )
        .evaluateAll((links, n) => {
          const videoIds = links.map(
            (link) =>
              new URL(
                `https://www.youtube.com${link.getAttribute("href")!}`,
              ).searchParams.get("v")!,
          );
          return [...new Set(videoIds)].slice(0, n);
        }, n);
    }
  }

  public async getPlayAllUrl(
    category: CategoryKind,
    sort: SortKind,
  ): Promise<string> {
    const href = await this.page
      .locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}`)
      .getAttribute("href");
    return `https://www.youtube.com${href}`;
  }
}
