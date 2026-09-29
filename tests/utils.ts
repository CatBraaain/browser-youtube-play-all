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

// Links that appear in channel video grids across categories and platforms.
const VIDEO_GRID = "ytd-browse[role='main'] #primary #contents,ytm-browse .modern-tabs";
const VIDEO_LINKS = 'a[href*="/watch?"],a[href*="/shorts/"],a[href*="/live/"]';

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

  // Typing key-by-key leaves the search listbox unhighlighted. fill() fires one
  // bulk input event, which makes YouTube auto-highlight a suggestion
  // (aria-activedescendant) once the listbox appears; Enter then submits that
  // suggestion instead of the typed query.
  public async submitQuery(searchWord: string): Promise<void> {
    const searchBox = this.page.locator("input.yt-searchbox-input");
    await searchBox.pressSequentially(searchWord, { delay: 80 });
    await searchBox.press("Enter");
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
        await this.submitQuery(searchWord);
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

  // A sort click is not a SPA navigation: no navigation-end fires and the URL
  // stays unchanged, so there is no event to wait for (see YT-SPEC.md). The
  // observable end of the transition is the video grid swapping to the new
  // sort's videos, which on desktop coincides with the chip-bar rebuild that
  // detaches nodes anchored inside it. Waiting for that swap keeps callers
  // from interacting with nodes resolved before the rebuild.
  public async navigateToSort(sort: SortKind) {
    const sortButton = this.page
      .locator(YoutubeDOM.SORT_BUTTON)
      .nth(YoutubeDOM.sorts.indexOf(sort));
    await this.armGridSwapWatch();
    await sortButton.click();
    await this.waitForGridSwap();
  }

  // Snapshot the first video node before the click; an unrelated link insertion
  // must not count as the new sort's grid. Re-clicking the selected chip also
  // replaces that node, even if its href remains the same (YT-SPEC.md).
  private async armGridSwapWatch() {
    await this.page.evaluate(
      ({ grid, links }) => {
        const firstVideo = Array.from(document.querySelectorAll(grid))
          .map((root) => root.querySelector(links))
          .find((link) => link !== null);
        if (!firstVideo) throw new Error("Cannot observe the channel video grid before sorting");

        const w = window as any;
        if (w.__gridSwapWatch) {
          w.__gridSwapWatch.previousFirstVideo = firstVideo;
          w.__gridSwapWatch.lastMutation = performance.now();
          w.__gridSwapWatch.sawMutation = false;
          return;
        }
        const state = {
          previousFirstVideo: firstVideo,
          lastMutation: performance.now(),
          sawMutation: false,
        };
        w.__gridSwapWatch = state;
        const isGridRecord = (record: MutationRecord) => {
          const changed = [...record.addedNodes, ...record.removedNodes].filter(
            (node): node is Element => node instanceof Element,
          );
          const touchesGrid =
            (record.target instanceof Element && record.target.closest(grid) !== null) ||
            changed.some((node) => node.matches(grid) || node.querySelector(grid) !== null);
          return (
            touchesGrid &&
            changed.some((node) => node.matches(links) || node.querySelector(links) !== null)
          );
        };
        new MutationObserver((records) => {
          if (records.some(isGridRecord)) {
            state.sawMutation = true;
            state.lastMutation = performance.now();
          }
        }).observe(document, { subtree: true, childList: true });
      },
      { grid: VIDEO_GRID, links: VIDEO_LINKS },
    );
  }

  private async waitForGridSwap(quietMs = 800) {
    await this.page.waitForFunction(
      ({ grid, links, quietMs }) => {
        const state = (window as any).__gridSwapWatch;
        const currentFirstVideo = Array.from(document.querySelectorAll(grid))
          .map((root) => root.querySelector(links))
          .find((link) => link !== null);
        return (
          state.sawMutation &&
          !state.previousFirstVideo.isConnected &&
          currentFirstVideo !== undefined &&
          currentFirstVideo !== state.previousFirstVideo &&
          performance.now() - state.lastMutation >= quietMs
        );
      },
      { grid: VIDEO_GRID, links: VIDEO_LINKS, quietMs },
      { timeout: 30_000 },
    );
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
