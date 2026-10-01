import { gunzipSync } from "node:zlib";

import {
  type Locator,
  type Page,
  errors,
  expect,
  type Request,
  type Response,
} from "@playwright/test";

import {
  type CategoryKind,
  type SortKind,
  YoutubeDOM,
} from "@/entrypoints/play-all-button.content/youtube-dom";
import { YTD_EVENTS, YTM_EVENTS } from "@/entrypoints/play-all-button.content/youtube-hooks";

import type { EventWatcher, NavigationBaseline } from "./fixture";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The continuation token of a /youtubei/v1/browse request body, or null.
// YouTube sends the body gzip-compressed when the client supports it, so sniff
// the gzip magic bytes and decode before parsing (plain bodies pass through).
const browseContinuationOf = (request: Request): string | null => {
  const body = request.postDataBuffer();
  if (!body) return null;
  const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
  try {
    return JSON.parse(raw.toString("utf8")).continuation ?? null;
  } catch {
    return null;
  }
};

// Ordered video ids from a browse response body (unknown shape): walks the
// parsed JSON and collects videoId values in order of appearance, deduped.
const collectVideoIds = (value: unknown, out: string[] = []): string[] => {
  if (!value || typeof value !== "object") return out;
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "videoId" &&
      typeof entry === "string" &&
      entry.trim().length > 0 &&
      !out.includes(entry)
    ) {
      out.push(entry);
    } else if (typeof entry === "object") {
      collectVideoIds(entry, out);
    }
  }
  return out;
};

// Links that appear in channel video grids across categories and platforms.
const VIDEO_GRID = "ytd-browse[role='main'] #primary #contents,ytm-browse .modern-tabs";
const VIDEO_LINKS = 'a[href*="/watch?"],a[href*="/shorts/"],a[href*="/live/"]';

// How long a click on an SPA anchor or channel tab waits for a start signal
// before concluding the click was swallowed. A navigation that started later
// than this would be re-clicked; observed start latencies are well under a
// second. Shared by the search-anchor and category-tab paths so both honor
// the same bounded no-start observation.
const SWALLOWED_CLICK_START_TIMEOUT_MS = 8_000;

// Resolves true once a transition shows a start signal: the navigation-start
// event fired after the baseline, the URL moved away from `urlBefore`, or the
// document was replaced. False on timeout (nothing provably started — the
// click was swallowed). Used to retry only swallowed clicks and never re-click
// a transition that already started, however slowly it proceeds.
const waitForTransitionStart = async (
  page: import("@playwright/test").Page,
  since: NavigationBaseline,
  urlBefore: string,
  timeout: number,
): Promise<boolean> => {
  try {
    await page.waitForFunction(
      (state: { eventName: string; docId: string; count: number; urlBefore: string }) => {
        const w = window as any;
        const sync = w.__ytSync;
        if (w.location.href !== state.urlBefore) return true;
        if (!sync) return false;
        const ev = sync.events[state.eventName];
        if (!ev) return false;
        return sync.docId !== state.docId ? ev.count > 0 : ev.count > state.count;
      },
      { eventName: since.eventName, docId: since.docId, count: since.count, urlBefore },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
};

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
  // Retry the click until the browser actually lands on the channel page, but
  // never re-click once a transition has started (its navigation-start fires
  // or the URL begins to move): then wait for the landing instead.
  public async clickChannelThumbnailButton(channelName: string | null = null): Promise<void> {
    const button = this.topVideoChannelThumbnailButton(channelName);
    const channelUrl =
      channelName !== null
        ? new RegExp(`youtube\\.com/${escapeRegExp(channelName)}/?$`, "i")
        : /youtube\.com\/(@|channel\/)[^/?]*\/?$/i;
    await this.clickUntilLanded(button, channelUrl);
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
    // Match the parsed URL, not a raw pattern: the results URL can carry
    // extra query parameters in any order (a preserved mobile trace showed
    // /results?sp=mAEA&search_query=%40Apple), so "search_query first" must
    // not be assumed. The decoded value is compared, so encoded queries
    // (e.g. %40Apple) match their plain form.
    const resultsUrl = { pathname: "/results", searchParams: { search_query: searchWord } };
    switch (navigation) {
      case "soft": {
        const loadSince = await this.eventWatcher.captureNavigationBaseline(
          this.ytPage.NavigationEndEvent,
        );
        await this.page.goto("https://www.youtube.com", {
          waitUntil: "domcontentloaded",
        });
        await this.eventWatcher.waitForNavigationEnd({ since: loadSince });
        if (this.ytPage.isMobile) {
          // A hash-only goto on m.youtube.com stays in the same document and
          // fires no navigation event (observed 2026-10-01, YT-SPEC.md), so
          // there is nothing to wait for here.
          await this.page.goto("https://m.youtube.com/#searching", {
            waitUntil: "domcontentloaded",
          });
        }
        // The baseline is captured after the load above: only the search
        // transition's end event satisfies this wait.
        const submitSince = await this.eventWatcher.captureNavigationBaseline(
          this.ytPage.NavigationEndEvent,
        );
        await this.submitQuery(searchWord);
        await this.eventWatcher.waitForNavigationEnd({
          since: submitSince,
          expectedUrl: resultsUrl,
        });
        break;
      }
      case "hard": {
        const since = await this.eventWatcher.captureNavigationBaseline(
          this.ytPage.NavigationEndEvent,
        );
        await this.page.goto(`https://www.youtube.com/results?search_query=${searchWord}`, {
          waitUntil: "domcontentloaded",
        });
        await this.eventWatcher.waitForNavigationEnd({ since, expectedUrl: resultsUrl });
        break;
      }
    }
  }

  public async navigateToChannel(
    channelName: string | null,
    navigation: "soft1" | "soft2" | "hard",
  ) {
    // Search-result cards link channels either by handle (/@name) or by
    // legacy channel id (/channel/UC...), depending on the result.
    const channelUrl =
      channelName !== null
        ? new RegExp(`youtube\\.com/${escapeRegExp(channelName)}/?$`, "i")
        : /youtube\.com\/(@|channel\/)[^/?]*\/?$/i;
    const since = await this.eventWatcher.captureNavigationBaseline(this.ytPage.NavigationEndEvent);
    switch (navigation) {
      case "soft1":
        await this.clickUntilLanded(this.topVideoChannelThumbnailButton(channelName), channelUrl);
        break;
      case "soft2":
        await this.clickUntilLanded(this.topVideoChannelNameButton(channelName), channelUrl);
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
    await this.eventWatcher.waitForNavigationEnd({ since, expectedUrl: channelUrl });
  }

  // YouTube sometimes swallows clicks on SPA anchors: it preventDefault()s the
  // anchor's navigation but never starts the SPA navigation (observed on Firefox
  // right after search results render; no /youtubei/v1/browse request follows).
  // Clicks are retried only while no transition has provably started; once a
  // start signal appears (navigation-start event, URL movement, or a document
  // replacement) the anchor is never clicked again — the wait for the landing
  // takes over, so a slow in-flight transition is never re-clicked.
  private async clickUntilLanded(button: Locator, expectedUrl: RegExp): Promise<void> {
    const since = await this.eventWatcher.captureNavigationBaseline(
      this.ytPage.NavigationStartEvent,
    );
    for (let attempt = 0; attempt < 6; attempt++) {
      if (expectedUrl.test(this.page.url())) return;
      const urlBefore = this.page.url();
      await button.click();
      if (await this.waitForTransitionStart(since, urlBefore, SWALLOWED_CLICK_START_TIMEOUT_MS)) {
        await expect(this.page).toHaveURL(expectedUrl, { timeout: 30_000 });
        return;
      }
      // No start signal: a swallowed click. Retry the same anchor.
    }
    throw new Error(`Clicking never landed on ${expectedUrl}`);
  }

  // Resolves true once the transition shows a start signal (see
  // waitForTransitionStart).
  private async waitForTransitionStart(
    since: NavigationBaseline,
    urlBefore: string,
    timeout: number,
  ): Promise<boolean> {
    return waitForTransitionStart(this.page, since, urlBefore, timeout);
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
    // Match by path so the pattern holds on www and m hosts alike. Channel
    // tabs expose no href (YT-SPEC.md); their identity is the endpoint URL in
    // the page's tab data model, and the landing URL is the causal check for
    // the category route.
    const expectedUrl = new RegExp(
      `/${escapeRegExp(this.channelName)}/${category.toLowerCase()}/?$`,
      "i",
    );
    const since = await this.eventWatcher.captureNavigationBaseline(this.ytPage.NavigationEndEvent);
    if (navigation === "hard") {
      // A hard navigation always re-commits the document, even when the URL
      // already matches: the URL alone does not prove the route is ready
      // (the initial load's navigation-end may still be pending).
      await this.page.goto(
        `https://www.youtube.com/${this.channelName}/${category.toLowerCase()}`,
        {
          waitUntil: "domcontentloaded",
        },
      );
    } else if (expectedUrl.test(this.page.url())) {
      // Already routed there. Do not click any tab; verify the route settled:
      // either the pending load's navigation-end arrives, or a previous firing
      // already ended on this route and nothing is in flight.
      if (wait) {
        await this.eventWatcher.waitForNavigationEnd({
          since,
          expectedUrl,
          requireNewFiring: false,
        });
      }
      return;
    } else {
      await this.clickCategoryTab(category, expectedUrl);
    }
    if (wait) {
      await this.eventWatcher.waitForNavigationEnd({ since, expectedUrl });
    }
  }

  // Channel tabs are yt-tab-shape elements with a localized tab-title and no
  // href (YT-SPEC.md); their identity is the endpoint URL in the page's tab
  // data model (see resolveCategoryTabIndex). Resolve the target tab from
  // that model and click it directly — never walk arbitrary candidate tabs.
  private async clickCategoryTab(category: CategoryKind, expectedUrl: RegExp): Promise<void> {
    const tabIndex = await this.resolveCategoryTabIndex(expectedUrl);
    const tabs = this.page.locator("yt-tab-shape");
    for (let attempt = 0; ; attempt++) {
      const startSince = await this.eventWatcher.captureNavigationBaseline(
        this.ytPage.NavigationStartEvent,
      );
      const urlBefore = this.page.url();
      await tabs.nth(tabIndex).click({ timeout: 5_000 });
      // Retry only a provably swallowed click: no navigation-start, no URL
      // movement, no document replacement within the start window. A slow
      // transition that did start is never re-clicked.
      if (
        await waitForTransitionStart(
          this.page,
          startSince,
          urlBefore,
          SWALLOWED_CLICK_START_TIMEOUT_MS,
        )
      ) {
        return; // navigateToCategory waits for the navigation-end
      }
      if (attempt >= 2) {
        throw new Error(
          `Clicking the ${category} channel tab (yt-tab-shape #${tabIndex}) never started a navigation after ${attempt + 1} clicks; ` +
            `the click is being swallowed (YT-SPEC.md router drop window)`,
        );
      }
    }
  }

  // Locates the index of the category tab from a tab data model that
  // belongs to the CURRENT routed page. After a soft arrival the document can
  // hold several browse elements at once — stale hidden ones from previously
  // routed pages plus the current one — and ytInitialData keeps the initial
  // hard load's model (observed on live YouTube, YT-SPEC.md), so a
  // first-match read resolves a foreign page's model. The model is therefore
  // located by its content: poll until any browse element's data (or
  // ytInitialData) exposes a tab endpoint matching the expected category
  // route. A stale foreign model never matches, so the gate keeps waiting for
  // the current page's model, however late it attaches; on genuine absence
  // it fails closed with the observed models as diagnostics.
  private async resolveCategoryTabIndex(expectedUrl: RegExp): Promise<number> {
    try {
      const indexHandle = await this.page.waitForFunction(
        (expectedUrl: RegExp) => {
          const tabUrlsOf = (contents: any) => {
            const tabs =
              contents?.twoColumnBrowseResultsRenderer?.tabs ??
              contents?.singleColumnBrowseResultsRenderer?.tabs;
            return (tabs ?? []).map((tab: any) => {
              const renderer = tab?.tabRenderer ?? tab;
              return renderer?.endpoint?.commandMetadata?.webCommandMetadata?.url ?? null;
            });
          };
          const sources: unknown[] = [(window as any).ytInitialData?.contents];
          document.querySelectorAll("ytd-browse, ytm-browse").forEach((element) => {
            sources.push((element as any).data?.contents);
          });
          for (const urls of sources.map(tabUrlsOf)) {
            const index = urls.findIndex(
              (url: string | null) => url !== null && expectedUrl.test(url),
            );
            // A truthy container, not the bare index: waitForFunction
            // resolves only on truthy returns, and a matching tab at index 0
            // would read as "not ready" and fail closed.
            if (index !== -1) return { index };
          }
          return false;
        },
        expectedUrl,
        { timeout: 10_000 },
      );
      try {
        // The poll resolved on the truthy container, never on false.
        const { index } = (await indexHandle.jsonValue()) as { index: number };
        return index;
      } finally {
        await indexHandle.dispose();
      }
    } catch {
      const observed = await this.page.evaluate(() => {
        const tabUrlsOf = (contents: any) =>
          (
            contents?.twoColumnBrowseResultsRenderer?.tabs ??
            contents?.singleColumnBrowseResultsRenderer?.tabs ??
            []
          ).map((tab: any) => {
            const renderer = tab?.tabRenderer ?? tab;
            return renderer?.endpoint?.commandMetadata?.webCommandMetadata?.url ?? null;
          });
        const models: { source: string; urls: (string | null)[] }[] = [];
        document.querySelectorAll("ytd-browse, ytm-browse").forEach((element, i) => {
          models.push({
            source: `${element.tagName.toLowerCase()}[${i}]`,
            urls: tabUrlsOf((element as any).data?.contents),
          });
        });
        models.push({
          source: "ytInitialData",
          urls: tabUrlsOf((window as any).ytInitialData?.contents),
        });
        return models;
      });
      throw new Error(
        `No channel tab data model of the current page exposes an endpoint matching ${expectedUrl} within 10s; ` +
          `observed models: ${JSON.stringify(observed)}`,
      );
    }
  }

  // A sort click is not a SPA navigation: no navigation-end fires and the URL
  // stays unchanged, so there is no event to wait for (see YT-SPEC.md). The
  // click issues one /youtubei/v1/browse request whose body carries the
  // chip's continuation token (chip-view-model data). Completion is causal,
  // not heuristic:
  // 1. the chip's token is read before the click (fail closed when absent);
  // 2. the /youtubei/v1/browse response whose REQUEST body carries that exact
  //    token must arrive — an unrelated browse response never qualifies;
  // 3. the grid's first video node is replaced (DOM identity, not href), and
  //    the grid's ordered visible ids must match the response's — a re-render
  //    of the OLD sort's videos (before or after the response) never qualifies;
  // 4. an 800 ms quiet window lets the grid settle (test heuristic, not a
  //    YouTube guarantee).
  // The response is observed with standard Playwright network events, so the
  // gate holds regardless of render/response ordering (the mobile interleave
  // question in YT-SPEC.md): identity and applied content, not timestamps.
  public async navigateToSort(sort: SortKind, options: { timeout?: number } = {}) {
    const { timeout = 30_000 } = options;
    // One overall budget: every stage below derives its own deadline from the
    // same timeout, so the whole operation is bounded by it rather than by
    // the sum of several stage timeouts.
    const deadline = Date.now() + timeout;
    const remaining = () => Math.max(1, deadline - Date.now());
    const index = YoutubeDOM.sorts.indexOf(sort);
    // The chip's tap-command data can attach after the chip renders (mobile),
    // so poll for the token instead of reading it once.
    let token: string | null = null;
    try {
      const tokenHandle = await this.page.waitForFunction(
        ({ selector, index }) => {
          const chip = Array.from(document.querySelectorAll(selector))[index];
          return (
            (chip?.closest("chip-view-model") as any)?.data?.tapCommand?.innertubeCommand
              ?.continuationCommand?.token ?? null
          );
        },
        { selector: YoutubeDOM.SORT_BUTTON, index },
        { timeout: Math.min(10_000, remaining()) },
      );
      token = (await tokenHandle.jsonValue()) as string | null;
    } catch {
      token = null;
    }
    if (token === null) {
      throw new Error(
        `The ${sort} sort chip exposes no continuation token; its browse response cannot be identified (fail closed)`,
      );
    }
    // The response watcher is owned by this invocation: one listener and one
    // timer, both removed in the finally below on every exit. page.waitForResponse
    // instead keeps its listener armed until the deadline even when the click
    // already failed or the page closed. The wait promise only resolves — it
    // never rejects — so an abandoned wait can never surface later as an
    // unhandled rejection attributed to an arbitrary point.
    let resolveResponse!: (response: Response | null) => void;
    const responsePromise = new Promise<Response | null>((resolve) => {
      resolveResponse = resolve;
    });
    const responseListener = (response: Response) => {
      if (!response.url().includes("/youtubei/v1/browse")) return;
      if (browseContinuationOf(response.request()) !== token) return;
      resolveResponse(response);
    };
    let responseTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await this.armGridSwapWatch();
      // Armed before the click so the click's own response is never missed.
      responseTimer = setTimeout(() => resolveResponse(null), remaining());
      this.page.on("response", responseListener);
      await this.page.locator(YoutubeDOM.SORT_BUTTON).nth(index).click({ timeout: remaining() });
      const response = await responsePromise;
      if (response === null) {
        throw new errors.TimeoutError(
          `No /youtubei/v1/browse response matched the ${sort} chip's continuation token within ${timeout}ms; ` +
            "the click may have been swallowed, or YouTube degraded (a sort click can flip aria-selected without issuing any request)",
        );
      }
      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch (cause) {
        throw new Error(`The ${sort} sort response has invalid or unreadable response content`, {
          cause,
        });
      }
      const responseIds = collectVideoIds(responseBody);
      if (responseIds.length === 0) {
        throw new Error(`The ${sort} sort response is missing video IDs`);
      }
      await this.waitForGridSwap(remaining(), { expectedIds: responseIds.slice(0, 3) });
    } finally {
      this.page.off("response", responseListener);
      if (responseTimer !== undefined) clearTimeout(responseTimer);
      // Settle a wait abandoned by an early exit (it only ever resolves).
      resolveResponse(null);
      // Never leave an armed document-wide observer behind, whether the sort
      // completed, timed out, or the click itself failed. A closed page is
      // itself one of the exit causes and its observer dies with the
      // document: skip only then, so the original close/action error is not
      // replaced by a dispose failure; disposal errors on any other path
      // surface normally and are never swallowed.
      if (!this.page.isClosed()) {
        await this.disposeGridSwapWatch();
      }
    }
  }

  // Snapshot the first video node before the click; an unrelated link insertion
  // must not count as the new sort's grid, and completion requires the click's
  // browse response to have arrived (see navigateToSort).
  private async armGridSwapWatch() {
    await this.page.evaluate(
      ({ grid, links }) => {
        const w = window as any;
        const firstVideo = Array.from(document.querySelectorAll(grid))
          .map((root) => root.querySelector(links))
          .find((link) => link !== null);
        if (!firstVideo) throw new Error("Cannot observe the channel video grid before sorting");

        if (w.__gridSwapWatch?.observer) {
          w.__gridSwapWatch.observer.disconnect();
        }
        // Ordered visible video ids of the grid, shared with the applied-
        // content check in waitForGridSwap.
        w.__gridOrderedVideoIds = () =>
          Array.from(document.querySelectorAll(grid))
            .flatMap((root) => Array.from(root.querySelectorAll(links)))
            .map((link) => {
              const href = link.getAttribute("href") ?? "";
              return href.includes("/watch?")
                ? new URL(`https://www.youtube.com${href}`).searchParams.get("v")
                : (href.match(/\/(?:shorts|live)\/([^/?]+)/)?.[1] ?? null);
            })
            .filter((id): id is string => id !== null)
            .filter((id, i, ids) => ids.indexOf(id) === i);
        const state = {
          currentFirstVideo: firstVideo,
          replacementAt: null as number | null,
          lastMutation: performance.now(),
          expectedIds: null as string[] | null,
          observer: null as MutationObserver | null,
        };
        w.__gridSwapWatch = state;
        const currentFirstVideo = () =>
          Array.from(document.querySelectorAll(grid))
            .map((root) => root.querySelector(links))
            .find((link) => link !== null);
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
        state.observer = new MutationObserver((records) => {
          if (!records.some(isGridRecord)) return;
          state.lastMutation = performance.now();
          const current = currentFirstVideo();
          if (current && current !== state.currentFirstVideo) {
            state.currentFirstVideo = current;
            state.replacementAt = performance.now();
          }
        });
        state.observer.observe(document, { subtree: true, childList: true });
      },
      { grid: VIDEO_GRID, links: VIDEO_LINKS },
    );
  }

  private async waitForGridSwap(timeout: number, options: { expectedIds: string[] }) {
    // The 800 ms quiet window is a heuristic settle delay, not a YouTube
    // guarantee: it only delays completion until the grid stops mutating, so
    // a late re-render after an earlier replacement resets the quiet clock.
    // expectedIds, when present, is the applied-content check: the grid's
    // ordered visible video ids must equal the matched response's first ids.
    await this.page.waitForFunction(
      (expectedIds: string[]) => {
        const w = window as any;
        const state = w.__gridSwapWatch;
        if (!state) return false;
        if (state.replacementAt === null) return false;
        if (performance.now() - state.lastMutation < 800) return false;
        if (expectedIds.length > 0) {
          const current = w.__gridOrderedVideoIds();
          if (
            JSON.stringify(current.slice(0, expectedIds.length)) !== JSON.stringify(expectedIds)
          ) {
            return false;
          }
        }
        return true;
      },
      options.expectedIds,
      { timeout },
    );
  }

  private async disposeGridSwapWatch(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as any;
      const state = w.__gridSwapWatch;
      if (!state) return;
      state.observer?.disconnect();
      delete w.__gridSwapWatch;
    });
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
