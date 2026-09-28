import { type Locator, type Page, expect } from "@playwright/test";

import {
  type CategoryKind,
  type SortKind,
  YoutubeDOM,
} from "@/entrypoints/play-all-button.content/youtube-dom";
import { YTD_EVENTS, YTM_EVENTS } from "@/entrypoints/play-all-button.content/youtube-hooks";

import type { EventWatcher } from "./fixture";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class YtPage {
  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {}

  public get isMobile() {
    return new URL(this.page.url()).host === "m.youtube.com";
  }

  public get NavigationStartEvent(): string {
    return this.isMobile ? YTM_EVENTS.NAVIGATION_START : YTD_EVENTS.NAVIGATION_START;
  }

  public get NavigationEndEvent(): string {
    return this.isMobile ? YTM_EVENTS.NAVIGATION_END : YTD_EVENTS.NAVIGATION_END;
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

  public topVideoChannelThumbnailButton(channelName: string | null = null): Locator {
    const thumb = channelName !== null ? `[href="/${channelName}"]` : `[href*="/@"]`;
    return this.page
      .locator(
        // Mobile serves two search-result DOM variants; the channel card inside
        // ytm-compact-channel-renderer has no .media-channel ancestor
        this.ytPage.isMobile
          ? `.media-channel ${thumb}, ytm-compact-channel-renderer ${thumb}`
          : `#channel-thumbnail:not([hidden])${channelName !== null ? `[href="/${channelName}"]` : ""}`,
      )
      .first(); // [href^="/channel/"] or [href^="link:///"]
  }

  // YouTube sometimes swallows clicks on SPA anchors: it preventDefault()s the
  // anchor's navigation but never starts the SPA navigation (observed on Firefox
  // right after search results render; no /youtubei/v1/browse request follows).
  // Retry the click until the browser actually lands on the channel page.
  public async clickChannelThumbnailButton(channelName: string | null = null): Promise<void> {
    const button = this.topVideoChannelThumbnailButton(channelName);
    // Search-result cards link channels either by handle (/@name) or by
    // legacy channel id (/channel/UC...), depending on the result.
    const channelUrl =
      channelName !== null
        ? new RegExp(`youtube\\.com/${escapeRegExp(channelName)}/?$`, "i")
        : /youtube\.com\/(@|channel\/)[^/?]*\/?$/i;
    await expect(async () => {
      // Already landed on a previous attempt: clicking again would fail because
      // the anchor no longer exists on the channel page.
      if (!channelUrl.test(this.page.url())) {
        await button.click();
      }
      await expect(this.page).toHaveURL(channelUrl);
    }).toPass({ timeout: 30_000 });
  }

  public topVideoChannelNameButton(channelName: string | null = null): Locator {
    return this.page
      .locator(
        "#channel-info #channel-name" +
          (channelName !== null ? `:has([href*="/${channelName}"])` : ""),
      )
      .first();
  }

  // Mobile keeps the search box hidden behind the header's search button
  public async openSearchForm(): Promise<void> {
    if (this.ytPage.isMobile) {
      await this.page.locator('button[aria-label="Search YouTube"]').click();
    }
  }

  public async search(searchWord: string, navigation: "soft" | "hard"): Promise<void> {
    switch (navigation) {
      case "soft":
        await this.page.goto("https://www.youtube.com", {
          waitUntil: "domcontentloaded",
        });
        await this.eventWatcher.waitForFired(this.ytPage.NavigationEndEvent);
        if (this.ytPage.isMobile) {
          await this.page.goto("https://m.youtube.com/#searching", {
            waitUntil: "domcontentloaded",
          });
        }
        // fill() fires one bulk input event, which makes YouTube auto-highlight a
        // suggestion (aria-activedescendant) once the listbox appears; Enter then
        // submits that suggestion instead of the typed query. Typing key-by-key
        // leaves the listbox unhighlighted, so Enter submits the query as-is.
        await this.page.locator("input.yt-searchbox-input").pressSequentially(searchWord, {
          delay: 80,
        });
        await this.page.locator("input.yt-searchbox-input").press("Enter");
        break;
      case "hard":
        await this.page.goto(`https://www.youtube.com/results?search_query=${searchWord}`, {
          waitUntil: "domcontentloaded",
        });
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
        await this.clickChannelThumbnailButton(channelName);
        break;
      case "soft2":
        await this.topVideoChannelNameButton(channelName).click();
        break;
      case "hard": {
        const channelButton = this.topVideoChannelThumbnailButton(channelName);
        // Search results may load slowly even after the navigation-end event
        await channelButton.waitFor({ state: "visible" });
        const relUrl = await channelButton.getAttribute("href");
        await this.page.goto(`https://www.youtube.com${relUrl}`, {
          waitUntil: "domcontentloaded",
        });
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
    return await locator.evaluateAll(
      (links, n) =>
        links
          .slice(0, n)
          .map(
            (link) =>
              new URL(`https://www.youtube.com${link.getAttribute("href")!}`).searchParams.get(
                "v",
              )!,
          ),
      n,
    );
  }

  public async getPlaylistSelectedVideoId(): Promise<string | null> {
    return await this.page
      .locator(
        "#playlist-items[selected] #thumbnail[href*='/watch?'],.ytmPlaylistPanelVideoRendererV2Selected [href*='/watch?']",
      )
      .evaluateAll((links) =>
        links.length === 0
          ? null
          : new URL(`https://www.youtube.com${links[0]!.getAttribute("href")!}`).searchParams.get(
              "v",
            ),
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
        const n = YoutubeDOM.categories.indexOf(category) + 1;
        await this.page.locator("yt-tab-shape").nth(n).click();
        break;
      }
      case "hard": {
        await this.page.goto(
          `https://www.youtube.com/${this.channelName}/${category.toLowerCase()}`,
          {
            waitUntil: "domcontentloaded",
          },
        );
        break;
      }
    }
    if (wait) {
      await this.eventWatcher.waitForFired(this.ytPage.NavigationEndEvent);
    }
  }

  public async navigateToSort(sort: SortKind, waitForSelection = false) {
    const sortButton = this.page
      .locator(YoutubeDOM.SORT_BUTTON)
      .nth(YoutubeDOM.sorts.indexOf(sort));
    await sortButton.click();
    if (waitForSelection) {
      // Rapid sort clicks get coalesced by YouTube's SPA into a single
      // transition, which under load can leave the chips' aria-selected unset.
      // Waiting for each selection to land keeps the next click from racing it.
      await expect(sortButton).toHaveAttribute("aria-selected", "true");
    }
  }

  public async getTopVideoIds(n: number = 3): Promise<string[]> {
    if (this.page.url().includes("shorts")) {
      return await this.page
        .locator(
          "ytd-browse[role='main'] #primary #contents [href*='/shorts'],ytm-browse .modern-tabs [href*='/shorts']",
        )
        .evaluateAll((links, n) => {
          const videoIds = links.map((link) => link.getAttribute("href")!.split("/").at(-1)!);
          return [...new Set(videoIds)].slice(0, n);
        }, n);
    } else {
      return await this.page
        .locator(
          "ytd-browse[role='main'] #primary #contents [href*='/watch'],ytm-browse .modern-tabs [href*='/watch']",
        )
        .evaluateAll((links, n) => {
          const videoIds = links.map(
            (link) =>
              new URL(`https://www.youtube.com${link.getAttribute("href")!}`).searchParams.get(
                "v",
              )!,
          );
          return [...new Set(videoIds)].slice(0, n);
        }, n);
    }
  }

  public async getPlayAllUrl(category: CategoryKind, sort: SortKind): Promise<string> {
    const href = await this.page
      .locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}`)
      .getAttribute("href");
    return `https://www.youtube.com${href}`;
  }
}
