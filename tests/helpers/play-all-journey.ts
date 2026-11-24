import { expect, type Locator, type Page, type Response, type TestInfo } from "@playwright/test";

import {
  YoutubeDOM,
  type CategoryKind,
  type SortKind,
} from "@/entrypoints/play-all-button.content/youtube-dom";

import { attachEventWatcher, type EventWatcher } from "../fixture";
import {
  attachSearchResultsEvidence,
  membersPlaylistHref,
  PLAYLIST_PREFIXES,
  publicPlaylistHref,
  PUBLIC_OLDEST_LIST_ID,
  readChannelPageId,
  SEARCH_REDRAW_ATTEMPTS,
  YtChannelPage,
  YtSearchPage,
  YtVideoPage,
  type SearchResultsShape,
} from "../utils";
import {
  playlistRows,
  readFullDestinationPanel,
  readFullReferencePlaylist,
  readFullShortsReferencePlaylist,
  readLastShortsReferenceRow,
  readPlaylistHeaderCount,
  resolveSharedUploadsOldest,
  type PlaylistRow,
} from "./playlist";

export type Route = "hard" | "soft1" | "soft2";
export type Audience = "Public" | "Members only";
export type EvidenceCase = {
  case: "D01" | "D02" | "A01" | "E01" | "E02";
  channel: string;
  category: CategoryKind;
  sort: SortKind;
  audience: Audience;
  route: Route;
};
export type EvidenceStage =
  | "home-closed"
  | "home-open"
  | "public-button"
  | "public-state"
  | "public-destination"
  | "members-button"
  | "members-hidden"
  | "members-destination";

// How many times openHome may redraw the search and retry the soft channel
// navigation. Under rapid repeated searches YouTube can serve results without
// the channel card (YT-SPEC.md "Channel card loss under rapid repeated
// queries"): the card is missing from the response, or vanishes between the
// shape checks and the click (observed 2026-11-21). Each attempt re-issues
// the same canonical search, so the SPEC transition contract is unchanged.
const OPEN_HOME_ATTEMPTS = SEARCH_REDRAW_ATTEMPTS;

export class PlayAllJourney {
  evidenceCase: EvidenceCase | undefined;
  channel = "";
  category: CategoryKind = "Videos";
  sort: SortKind = "Latest";
  channelId = "";
  savedIds: string[] = [];
  gridCandidateIds: string[] = [];
  referenceRows: PlaylistRow[] = [];
  referenceListId = "";
  referenceCategoryUrl = "";
  referenceDocumentId = "";
  selectedSortLabel = "";
  destination: Page;
  destinationWatcher: EventWatcher;
  destinationHref: URL | undefined;
  menuEntries: { audience: Audience; category: CategoryKind; sort: SortKind }[] = [];
  comparisonExcludedIds: string[] = [];
  comparedPanelIds: string[] = [];
  private popup: Page | undefined;
  private unplayableIds = new Set<string>();
  private pendingResponses = new Set<Promise<void>>();
  private responseErrors: string[] = [];

  constructor(
    readonly page: Page,
    readonly watcher: EventWatcher,
    readonly testInfo: TestInfo,
  ) {
    this.destination = page;
    this.destinationWatcher = watcher;
    page.context().on("response", this.observeResponse);
  }

  get channelPage() {
    return new YtChannelPage(this.channel, this.page, this.watcher);
  }
  get toggle() {
    return this.page.locator(".play-all-btns > button").describe("Play All menu toggle");
  }
  get menu() {
    return this.page.locator(".play-all-btns > div").describe("Play All menu");
  }
  get panel() {
    return this.destination
      .locator("ytd-playlist-panel-renderer:visible, ytm-playlist-panel-renderer:visible")
      .describe("Destination playlist panel");
  }
  get selectedRow() {
    return this.destination
      .locator("#playlist-items[selected], .ytmPlaylistPanelVideoRendererV2Selected")
      .describe("Selected playlist row");
  }

  async search(channel: string, route: Route) {
    this.channel = channel;
    await new YtSearchPage(this.page, this.watcher).search(
      channel,
      route === "hard" ? "hard" : "soft",
    );
  }

  async openHome(channel: string, route: Route) {
    expect(channel).toBe(this.channel);
    const soft = route !== "hard";
    // The channel card can also vanish between the shape checks and the click
    // (OPEN_HOME_ATTEMPTS): redraw the search and retry the whole soft route
    // when that happens. Skips (lockup-only results) and every other failure
    // propagate unchanged.
    for (let attempt = 0; attempt < OPEN_HOME_ATTEMPTS; attempt++) {
      if (soft) {
        if (attempt > 0) await this.search(channel, route);
        await this.expectSoftChannelTarget(channel, route);
      }
      const before = await this.watcher.captureNavigationBaseline();
      try {
        await new YtSearchPage(this.page, this.watcher).navigateToChannel(channel, route, {
          click: humanClick,
          card: true,
        });
        const after = await this.watcher.captureNavigationBaseline();
        expect(after.docId === before.docId).toBe(soft);
        break;
      } catch (error) {
        if (attempt === OPEN_HOME_ATTEMPTS - 1 || !isVerifiedTargetLoss(error)) throw error;
      }
    }
  }

  async openDirectCategory(channel: string, category: CategoryKind) {
    this.channel = channel;
    await this.openCategory(category, "hard");
  }

  async resolveChannelId() {
    await expect
      .poll(async () => (this.channelId = await readChannelPageId(this.page)), { timeout: 30_000 })
      .toMatch(/^UC[\w-]{22}$/);
  }

  // Redraws the search while the results render no channel target — only
  // lockup rows, or nothing usable at all (YT-SPEC.md); skips with evidence
  // when only lockup rows persist, throws when nothing renders.
  private async expectSoftChannelTarget(channel: string, route: Route): Promise<void> {
    const search = new YtSearchPage(this.page, this.watcher);
    const target =
      route === "soft2"
        ? search.topVideoChannelNameButton(channel)
        : search.channelThumbnailButton(channel);
    let shape: SearchResultsShape = "target";
    for (let attempt = 0; attempt < SEARCH_REDRAW_ATTEMPTS; attempt++) {
      shape = await search.waitForChannelTarget(target);
      if (shape === "target") break;
      if (attempt < SEARCH_REDRAW_ATTEMPTS - 1) await this.search(channel, route);
    }
    if (shape === "lockup") {
      await attachSearchResultsEvidence(this.testInfo, this.page, shape);
      this.testInfo.skip(
        true,
        "YouTube served only lockup-shaped search results, whose channel links navigate by full page load; they offer no soft navigation target to a channel (YT-SPEC.md)",
      );
    }
    if (shape === "target") return;
    throw new Error(
      `The search results rendered no channel target for the soft navigation. Results URL: ${this.page.url()}`,
    );
  }

  async openCategory(category: CategoryKind, route: Route) {
    this.category = category;
    const before = await this.watcher.captureNavigationBaseline();
    await this.channelPage.navigateToCategory(category, route === "hard" ? "hard" : "soft", true, {
      click: humanClick,
    });
    const after = await this.watcher.captureNavigationBaseline();
    expect(after.docId === before.docId).toBe(route !== "hard");
    await expect
      .poll(() => this.channelPage.getTopVideoIds(1), { timeout: 30_000 })
      .toHaveLength(1);
  }

  async selectSort(sort: SortKind) {
    this.sort = sort;
    await this.channelPage.navigateToSort(sort, {
      click: async (locator) => {
        this.selectedSortLabel = (await locator.innerText()).trim();
        await humanClick(locator);
      },
    });
  }

  async expectSort(sort: SortKind) {
    expect(this.sort).toBe(sort);
    expect(this.selectedSortLabel).not.toBe("");
    const combo = this.page.locator(YoutubeDOM.SORT_COMBOBOX).describe("Selected sort dropdown");
    if (await combo.count()) {
      await expect(combo).toHaveText(this.selectedSortLabel);
    } else {
      await expect(
        this.page
          .locator(YoutubeDOM.SORT_BUTTON)
          .nth(YoutubeDOM.sorts.indexOf(sort))
          .describe("Selected sort chip"),
      ).toHaveAttribute("aria-selected", "true");
    }
  }

  async activateAudience(audience: Audience) {
    const before = await this.watcher.captureNavigationBaseline();
    const url = this.page.url();
    await this.channelPage.selectAudienceFilter(audience === "Public" ? "Public" : "MembersOnly", {
      click: humanClick,
    });
    expect(this.page.url()).toBe(url);
    expect((await this.watcher.captureNavigationBaseline()).docId).toBe(before.docId);
  }

  async expectAudience(audience: Audience, category: CategoryKind, sort: SortKind) {
    await this.expectCategory(this.channel, category);
    const chips = this.page.locator(YoutubeDOM.AUDIENCE_CHIP).describe("Audience filters");
    await expect(chips).toHaveCount(2);
    const selectedIndex = audience === "Public" ? 1 : 0;
    await expect(chips.nth(selectedIndex)).toHaveAttribute("aria-selected", "true");
    await expect(chips.nth(1 - selectedIndex)).toHaveAttribute("aria-selected", "false");
    await this.expectSort(sort);
  }

  async expectCategory(channel: string, category: CategoryKind) {
    const url = new URL(this.page.url());
    expect(url.pathname.toLowerCase().replace(/\/$/, "")).toBe(
      `/${channel}/${category}`.toLowerCase(),
    );
    expect(this.category).toBe(category);
  }

  button(audience: Audience, sort: SortKind): Locator {
    return this.page
      .locator(
        `.play-all-btn.${this.category.toLowerCase()}.${sort.toLowerCase()}${audience === "Public" ? ":not(.members)" : ".members"}`,
      )
      .describe(`${audience} ${this.category} ${sort} Play All`);
  }

  async expectButton(audience: Audience, sort: SortKind) {
    const button = this.button(audience, sort);
    await expect(button).toBeVisible({ timeout: 60_000 });
    await expect(button).toHaveText(`Play All (${sort})`, { timeout: 60_000 });
    await expect(this.page.locator(".play-all-btn")).toHaveCount(1);
  }

  async expectWorkingLink(audience: Audience, sort: SortKind) {
    const pattern =
      audience === "Public"
        ? publicPlaylistHref(this.category, sort)
        : membersPlaylistHref(this.category, membersSort(sort));
    await expect(this.button(audience, sort)).toHaveAttribute("href", pattern, { timeout: 60_000 });
  }

  async saveGridIds(category: CategoryKind, sort: SortKind, count: number) {
    await this.expectCategory(this.channel, category);
    await this.expectSort(sort);
    await expect
      .poll(
        async () => {
          this.gridCandidateIds = await this.readGridIdsForComparison(count + 10, sort);
          this.savedIds = this.gridCandidateIds.slice(0, count);
          return this.savedIds;
        },
        { timeout: 30_000 },
      )
      .toEqual(Array.from({ length: count }, () => expect.stringMatching(/^[\w-]{11}$/)));
    await this.attachJson("channel-grid-reference", {
      channel: this.channel,
      category,
      sort,
      ids: this.savedIds,
      candidates: this.gridCandidateIds,
    });
  }

  // Reads the grid's leading video IDs for the public destination
  // comparison. For the Latest sort, currently-live streams are excluded:
  // the auto-generated "uploads" playlists (UULF/UULV/UUSH) contain only
  // VODs, so a live stream on the tab can never appear in the playlist
  // panel. The Popular playlists (UULP/UUPV/UUPS) do include live streams,
  // so no exclusion is applied there. The exclusion uses structural markers
  // in the page data model, never localized display text: desktop
  // lockupViewModel badge style THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE, mobile
  // compactVideoRenderer thumbnailOverlayTimeStatusRenderer style "LIVE".
  private async readGridIdsForComparison(count: number, sort: SortKind): Promise<string[]> {
    const allIds = await this.channelPage.getTopVideoIds(count + 10);
    if (allIds.length === 0) return [];
    const excludedIds = new Set(
      await this.page.evaluate(
        ({ ids, excludeLive }) => {
          const sources: unknown[] = [(window as any).ytInitialData];
          document.querySelectorAll("ytd-browse, ytm-browse").forEach((element) => {
            if ((element as any).data) sources.push((element as any).data);
          });
          const live = new Set<string>();
          const walk = (node: any) => {
            if (!node || typeof node !== "object") return;
            if (Array.isArray(node)) {
              node.forEach(walk);
              return;
            }
            const id = node.contentId ?? node.videoId;
            if (
              typeof id === "string" &&
              ids.includes(id) &&
              (node.unplayableText != null || node.isPlayable === false)
            )
              live.add(id);
            if (
              excludeLive &&
              typeof node.contentId === "string" &&
              ids.includes(node.contentId) &&
              (node.contentImage?.thumbnailViewModel?.overlays ?? []).some((overlay: any) =>
                Object.values(overlay).some((value: any) =>
                  (value?.badges ?? []).some(
                    (badge: any) =>
                      badge?.thumbnailBadgeViewModel?.badgeStyle ===
                      "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE",
                  ),
                ),
              )
            ) {
              live.add(node.contentId);
            }
            if (
              excludeLive &&
              typeof node.videoId === "string" &&
              ids.includes(node.videoId) &&
              (node.thumbnailOverlays ?? []).some(
                (overlay: any) => overlay?.thumbnailOverlayTimeStatusRenderer?.style === "LIVE",
              )
            ) {
              live.add(node.videoId);
            }
            for (const value of Object.values(node)) walk(value);
          };
          for (const source of sources) walk(source);
          return [...live];
        },
        { ids: allIds, excludeLive: sort === "Latest" },
      ),
    );
    return allIds.filter((id) => !excludedIds.has(id)).slice(0, count);
  }

  private async prepareMembersPlaylistReference(category: CategoryKind) {
    expect(category).toBe(this.category);
    this.referenceCategoryUrl = this.page.url();
    this.referenceDocumentId = (await this.watcher.captureNavigationBaseline()).docId;
    await this.resolveChannelId();
    const prefix = PLAYLIST_PREFIXES.members[category];
    this.referenceListId = prefix + this.channelId.slice(2);
  }

  async saveFullMembersPlaylist(category: CategoryKind) {
    await this.prepareMembersPlaylistReference(category);
    this.referenceRows =
      category === "Shorts"
        ? await readFullShortsReferencePlaylist(this.page, this.referenceListId)
        : await readFullReferencePlaylist(this.page, this.referenceListId);
    this.savedIds = this.referenceRows.map((row) => row.videoId);
    await this.attachJson("full-members-playlist-reference", {
      listId: this.referenceListId,
      rows: this.referenceRows,
    });
  }

  async saveMembersOldestReference(category: CategoryKind) {
    if (category === "Shorts") {
      await this.prepareMembersPlaylistReference(category);
      const reference = await readLastShortsReferenceRow(this.page, this.referenceListId);
      await this.attachJson("members-oldest-playlist-reference", {
        listId: this.referenceListId,
        ...reference,
      });
      return reference;
    }
    await this.saveFullMembersPlaylist(category);
    const videoId = this.savedIds.at(-1);
    expect(videoId).toMatch(/^[\w-]{11}$/);
    return { videoId: videoId!, index: this.savedIds.length };
  }

  async expectCategoryUnchanged() {
    expect(this.page.url()).toBe(this.referenceCategoryUrl);
    expect((await this.watcher.captureNavigationBaseline()).docId).toBe(this.referenceDocumentId);
    await this.expectAudience("Members only", this.category, this.sort);
  }

  async pressPlayAll(audience: Audience, sort: SortKind) {
    const button = this.button(audience, sort);
    this.destinationHref = new URL((await button.getAttribute("href"))!, this.page.url());
    const since = await this.watcher.captureNavigationBaseline();
    const popupListener = (page: Page) => {
      this.popup = page;
    };
    this.page.on("popup", popupListener);
    try {
      await humanClick(button);
      await expect
        .poll(() => new URL((this.popup ?? this.page).url()).searchParams.get("list"), {
          timeout: 60_000,
        })
        .toBe(this.destinationHref.searchParams.get("list"));
      this.destination = this.popup ?? this.page;
      this.destinationWatcher = this.popup ? await attachEventWatcher(this.popup) : this.watcher;
      if (this.popup)
        throw new Error(
          "Unexpected popup: its navigation-end instrumentation was not armed before the load",
        );
      await this.destinationWatcher.waitForNavigationEnd({
        since,
        expectedUrl: new RegExp(`[?&]list=${this.destinationHref.searchParams.get("list")}(?:&|$)`),
        timeout: 60_000,
      });
    } finally {
      this.page.off("popup", popupListener);
    }
  }

  async expectDestination() {
    expect(this.destinationHref).toBeDefined();
    const url = new URL(this.destination.url());
    expect(url.hostname).toMatch(/^(www|m)\.youtube\.com$/);
    expect(url.pathname).toMatch(/^\/(playlist|watch)$/);
    expect(url.searchParams.get("list")).toBe(this.destinationHref!.searchParams.get("list"));
  }

  async expectMembersDestination(category: CategoryKind) {
    expect(category).toBe(this.category);
    expect(this.referenceListId).not.toBe("");
    expect(new URL(this.destination.url()).searchParams.get("list")).toBe(this.referenceListId);
  }

  async comparePublicFirstThree() {
    expect(this.savedIds).toHaveLength(3);
    const videos = new YtVideoPage(this.destination);
    try {
      await expect
        .poll(
          async () => {
            const initial = await this.destination.evaluate(() => (window as any).ytInitialData);
            playlistRows(initial, "playlistPanelVideoRenderer")
              .filter((row) => row.unplayable)
              .forEach((row) => this.unplayableIds.add(row.videoId));
            this.comparisonExcludedIds = [...this.unplayableIds];
            this.savedIds = this.gridCandidateIds
              .filter((id) => !this.unplayableIds.has(id))
              .slice(0, 3);
            this.comparedPanelIds = await videos.getPlaylistVideoIds(3, this.comparisonExcludedIds);
            return (
              this.savedIds.length === 3 &&
              JSON.stringify(this.comparedPanelIds) === JSON.stringify(this.savedIds)
            );
          },
          { timeout: 60_000 },
        )
        .toBe(true);
      expect(this.comparedPanelIds).toEqual(this.savedIds);
    } finally {
      await this.attachJson("public-playlist-comparison", {
        gridCandidates: this.gridCandidateIds,
        expected: this.savedIds,
        actual: this.comparedPanelIds,
        excludedWithYouTubeMarker: this.comparisonExcludedIds,
        responseErrors: this.responseErrors,
      });
    }
  }

  async compareSelected(lastRow?: { videoId: string; index: number }) {
    const expected = lastRow?.videoId ?? this.savedIds[0];
    expect(expected).toMatch(/^[\w-]{11}$/);
    expect(new URL(this.destination.url()).searchParams.get("v")).toBe(expected);
    if (lastRow)
      expect(this.destinationHref!.searchParams.get("index")).toBe(String(lastRow.index));
    await expect
      .poll(() => new YtVideoPage(this.destination).getPlaylistSelectedVideoId(), {
        timeout: 60_000,
      })
      .toBe(expected);
    await this.attachJson("selected-playlist-comparison", {
      expected,
      source: lastRow ? "members-playlist-last-row" : "channel-grid-first-row",
    });
  }

  // SPEC D01/D02 Public Oldest destination checks beyond the selected row.
  // The shared Oldest list (UL01234567890) is the channel's full uploads
  // playlist spanning all three categories, and the selected video sits at
  // the panel head exactly when no other category holds an older upload.
  // The panel serves its rows in per-destination windows whose absolute row
  // order is not comparable across destinations (observed on live YouTube),
  // so these checks rely on the panel's own total and selected markers plus
  // independently fetched playlist-page references — never on the button
  // href and never on the window's absolute row order.
  async verifyOldestSharedDestination() {
    expect(this.channelId).toMatch(/^UC[\w-]{22}$/);
    const suffix = this.channelId.slice(2);
    const uploadsCountOf = (category: CategoryKind) =>
      readPlaylistHeaderCount(
        this.destination,
        `${PLAYLIST_PREFIXES.public[category].Latest}${suffix}`,
      );
    const [videoCount, shortsCount, streamsCount, sharedOldest, panel] = await Promise.all([
      uploadsCountOf("Videos"),
      uploadsCountOf("Shorts"),
      uploadsCountOf("Streams"),
      resolveSharedUploadsOldest(this.destination, this.channelId),
      this.readDestinationPanelSummary(),
    ]);
    const selectedPosition = panel.rows.findIndex((row) => row.selected);
    await this.attachJson("oldest-shared-playlist-check", {
      counts: { Videos: videoCount, Shorts: shortsCount, Streams: streamsCount },
      panel: {
        playlistId: panel.playlistId,
        totalVideos: panel.totalVideos,
        servedRows: panel.rows.length,
      },
      sharedOldest,
      selected:
        selectedPosition >= 0
          ? { position: selectedPosition, videoId: panel.rows[selectedPosition]!.videoId }
          : null,
    });
    expect(panel.playlistId).toBe(PUBLIC_OLDEST_LIST_ID);
    // Two independent totals name the shared playlist's size: the sum of the
    // three category playlist headers proves all three categories feed it,
    // and the plain uploads playlist header (UU) proves it is the channel's
    // full uploads list. Both are read from playlist pages, never from the
    // button href.
    expect(panel.totalVideos).toBe(videoCount + shortsCount + streamsCount);
    expect(panel.totalVideos).toBe(sharedOldest.count);
    expect(selectedPosition).toBeGreaterThanOrEqual(0);
    expect(panel.rows[selectedPosition]!.videoId).toBe(this.savedIds[0]);
    if (sharedOldest.videoId === this.savedIds[0]) {
      // The chosen category holds the channel's globally oldest upload:
      // nothing can precede it, so the panel starts at the selected row.
      expect(selectedPosition).toBe(0);
    } else {
      // Another category holds an older upload: the panel must not start at
      // the selected row — the shared playlist's head is that older video.
      expect(selectedPosition).toBeGreaterThan(0);
    }
  }

  // Ordered summary of the rows the destination panel has served, read from
  // the panel's own data model. Desktop (ytd) and mobile (ytm) panels carry
  // the same shape: contents rows of playlistPanelVideoRenderer with a
  // selected marker, the playlist id, and the playlist's total video count.
  private async readDestinationPanelSummary(): Promise<{
    playlistId: string;
    totalVideos: number;
    rows: { videoId: string; selected: boolean }[];
  }> {
    return await this.panel.evaluate((element) => {
      const data = (element as any).data ?? {};
      const rows = (Array.isArray(data.contents) ? data.contents : [])
        .map((item: any) => item?.playlistPanelVideoRenderer)
        .filter((row: any) => typeof row?.videoId === "string" && row.videoId.length === 11)
        .map((row: any) => ({ videoId: row.videoId as string, selected: row.selected === true }));
      return {
        playlistId: String(data.playlistId ?? ""),
        totalVideos: Number(data.totalVideos ?? 0),
        rows,
      };
    });
  }

  async compareFullPanel() {
    expect(this.referenceRows.length).toBeGreaterThan(0);
    const initialPanelIds = await this.panel.evaluate((element) =>
      ((element as any).data?.contents ?? [])
        .map((item: any) => item.playlistPanelVideoRenderer?.videoId)
        .filter(Boolean),
    );
    expect(initialPanelIds.length).toBeGreaterThan(0);
    await expect
      .poll(() => new YtVideoPage(this.destination).getPlaylistVideoIds(initialPanelIds.length), {
        timeout: 30_000,
      })
      .toEqual(initialPanelIds);
    const panelRows = await readFullDestinationPanel(
      this.destination,
      this.panel,
      this.referenceListId,
    );
    this.comparedPanelIds = panelRows.map((row) => row.videoId);
    await this.attachJson("destination-panel-rows", {
      source: "native-panel-model-and-next-continuations",
      initialRenderedRows: initialPanelIds.length,
      rows: panelRows,
    });
    await this.attachJson("full-panel-comparison", {
      referenceListId: this.referenceListId,
      expected: this.savedIds,
      actual: this.comparedPanelIds,
      excluded: [],
    });
    expect(this.comparedPanelIds).toEqual(this.savedIds);
  }

  async expectMenuEntries(
    entries: { audience: Audience; category: CategoryKind; sort: SortKind }[],
  ) {
    this.menuEntries = entries;
    const expected = entries.map(
      (entry) =>
        `${entry.category} (${entry.audience === "Members only" ? "Members " : ""}${entry.sort})`,
    );
    await expect(this.menu.getByRole("link")).toHaveText(expected, { timeout: 60_000 });
    for (const entry of entries) {
      const name = `${entry.category} (${entry.audience === "Members only" ? "Members " : ""}${entry.sort})`;
      const link = this.menu.getByRole("link", { name, exact: true }).describe(name);
      const pattern =
        entry.audience === "Public"
          ? publicPlaylistHref(entry.category, entry.sort)
          : membersPlaylistHref(entry.category, membersSort(entry.sort));
      await expect(link).toHaveAttribute("href", pattern);
    }
  }

  async expectMenuInViewport() {
    expect(this.menuEntries.length).toBeGreaterThan(0);
    const bounds = await this.menu.locator("a").evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        const inViewport =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= innerWidth &&
          rect.bottom <= innerHeight;
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;
        const edgeCenters = [
          [centerX, rect.top + 1],
          [centerX, rect.bottom - 1],
          [rect.left + 1, centerY],
          [rect.right - 1, centerY],
          [centerX, centerY],
        ];
        const uncovered = edgeCenters.every(([x, y]) => {
          const target = document.elementFromPoint(x!, y!);
          return target !== null && link.contains(target);
        });
        return { label: link.textContent, inViewport, uncovered, rect: rect.toJSON() };
      }),
    );
    expect(bounds).toHaveLength(this.menuEntries.length);
    await this.attachJson("menu-viewport-bounds", bounds);
    expect(bounds.filter((item) => !item.inViewport || !item.uncovered)).toEqual([]);
  }

  async anchorToggle() {
    await expect
      .poll(async () =>
        this.toggle.evaluate((toggle) => {
          const fixedHeaders = Array.from(document.querySelectorAll("ytd-masthead,header")).filter(
            (header) => {
              let ancestor: Element | null = header;
              while (ancestor) {
                if (["fixed", "sticky"].includes(getComputedStyle(ancestor).position)) return true;
                ancestor = ancestor.parentElement;
              }
              return false;
            },
          );
          const bottom = Math.max(
            0,
            ...fixedHeaders.map((header) => header.getBoundingClientRect().bottom),
          );
          const delta = toggle.getBoundingClientRect().top - bottom - 2;
          if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
          return Math.abs(delta);
        }),
      )
      .toBeLessThanOrEqual(2);
  }

  async clickOutside() {
    const point = await this.page.evaluate(() => {
      const container = document.querySelector(".play-all-btns")!;
      for (const point of [
        { x: 1, y: 1 },
        { x: innerWidth - 1, y: 1 },
      ]) {
        const target = document.elementFromPoint(point.x, point.y);
        if (
          target &&
          !container.contains(target) &&
          !target.closest("a,button,input,[role=tab],[role=link],[role=button]")
        )
          return point;
      }
      throw new Error("No safe point outside the Play All menu");
    });
    const before = await this.watcher.captureNavigationBaseline();
    const url = this.page.url();
    await this.page.mouse.move(point.x, point.y, { steps: 15 });
    await this.page.mouse.click(point.x, point.y);
    expect(this.page.url()).toBe(url);
    expect((await this.watcher.captureNavigationBaseline()).docId).toBe(before.docId);
  }

  async showPanel(selected: boolean) {
    const target = selected ? this.selectedRow : this.panel;
    const attemptTimeoutMs = 1_000;
    await expect(async () => {
      await target.scrollIntoViewIfNeeded({ timeout: attemptTimeoutMs });
      await expect(target).toBeInViewport({ timeout: attemptTimeoutMs });
    }).toPass({ timeout: 5_000 });
  }

  async defineCase(value: EvidenceCase) {
    this.evidenceCase = value;
    await this.attachJson("e2e-case", { schemaVersion: 1, ...value });
  }

  async capture(name: EvidenceStage) {
    const page = name.endsWith("-destination") ? this.destination : this.page;
    if (["public-button", "public-state", "members-button"].includes(name)) {
      const button = this.button(name === "members-button" ? "Members only" : "Public", this.sort);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
    }
    expect(this.testInfo.attachments.map((attachment) => attachment.name)).not.toContain(name);
    const path = this.testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: false });
    await this.testInfo.attach(name, { path, contentType: "image/png" });
    expect(this.evidenceCase).toBeDefined();
    const home = name === "home-closed" || name === "home-open";
    const members = name.startsWith("members-");
    await this.attachJson(`e2e-evidence:${name}`, {
      schemaVersion: 1,
      ...this.evidenceCase,
      case: home ? "D03" : this.evidenceCase!.case,
      sourceCase: this.evidenceCase!.case,
      category: home ? null : this.evidenceCase!.category,
      sort: home ? null : this.evidenceCase!.sort,
      audience: home ? null : members ? "Members only" : "Public",
      stage: name,
      surface: home
        ? "home"
        : name.endsWith("-destination")
          ? "playlist"
          : members
            ? "members"
            : "public",
      screenshotAttachment: name,
      project: this.testInfo.project.name,
      testId: this.testInfo.testId,
      retry: this.testInfo.retry,
    });
  }

  async attachJson(name: string, value: unknown) {
    await this.testInfo.attach(name, {
      body: JSON.stringify(value, null, 2),
      contentType: "application/json",
    });
  }

  private observeResponse = (response: Response) => {
    if (!response.url().includes("/youtubei/")) return;
    const pending = this.collectResponseMarkers(response);
    this.pendingResponses.add(pending);
    void pending.finally(() => this.pendingResponses.delete(pending));
  };

  private async collectResponseMarkers(response: Response) {
    try {
      if (!(response.headers()["content-type"] ?? "").includes("json")) return;
      const rows = playlistRows(await response.json(), "playlistPanelVideoRenderer");
      rows.filter((row) => row.unplayable).forEach((row) => this.unplayableIds.add(row.videoId));
    } catch (error) {
      this.responseErrors.push(`${response.url()}: ${String(error)}`);
    }
  }

  async dispose() {
    this.page.context().off("response", this.observeResponse);
    await Promise.allSettled(this.pendingResponses);
    if (this.popup && !this.popup.isClosed()) await this.popup.close();
  }
}

function membersSort(value: SortKind): "Latest" | "Oldest" {
  if (value !== "Popular") return value;
  throw new Error("Members playlists have no Popular sort");
}
export async function humanClick(locator: Locator) {
  await locator.click({ steps: 15, timeout: 15_000 });
}

// True when the channel target the shape checks verified moments earlier was
// gone by click time (YT-SPEC.md "Channel card loss under rapid repeated
// queries"): the click gave up within its timeout, or the re-check inside
// navigateToChannel found only degraded shapes. This is the only recoverable
// openHome failure; skips, assertions, and navigation failures propagate
// unchanged.
function isVerifiedTargetLoss(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /^locator\.click: Timeout \d+ms exceeded/.test(error.message) ||
    error.message.includes("A soft navigation to the channel is impossible")
  );
}
