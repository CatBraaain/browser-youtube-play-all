import { expect, type Locator, type Page } from "@playwright/test";

import {
  YoutubeDOM,
  type CategoryKind,
  type SortKind,
} from "@/entrypoints/play-all-button.content/youtube-dom";

import { ytxTest, type EventWatcher } from "../fixture";
import { YtChannelPage, YtSearchPage, YtVideoPage } from "../utils";

ytxTest.use({ trace: "on" });

const channel = "@Apple";
const membersChannel = "@NASASpaceflight";

// YouTube's mobile playlist queues can interleave rows the channel grid never
// shows, e.g. a "[Private video]" placeholder. Only rows that YouTube itself
// marks unplayable in its native playlist data
// (playlistPanelVideoRenderer.unplayableText) leave the comparison; a row
// without that native marker is never excluded (fail-closed).
type PlaylistRenderer = { unplayableText?: unknown; videoId?: unknown };

function collectUnplayableIds(node: unknown, into: Set<string>) {
  const walk = (current: unknown) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const item of current) walk(item);
      return;
    }
    const renderer = (current as { playlistPanelVideoRenderer?: PlaylistRenderer })
      .playlistPanelVideoRenderer;
    if (renderer && renderer.unplayableText != null && typeof renderer.videoId === "string")
      into.add(renderer.videoId);
    for (const value of Object.values(current)) walk(value);
  };
  walk(node);
}

const playlistPrefixes = {
  Videos: { Latest: "UULF", Popular: "UULP" },
  Shorts: { Latest: "UUSH", Popular: "UUPS" },
  Streams: { Latest: "UULV", Popular: "UUPV" },
} as const;

function expectedHref(category: CategoryKind, sort: SortKind): RegExp {
  return sort === "Oldest"
    ? /^\/watch\?v=[\w-]{11}&list=UL01234567890$/
    : new RegExp(`^/playlist\\?list=${playlistPrefixes[category][sort]}[\\w-]+&playnext=1$`);
}

// Review journeys move like a person: a click glides over intermediate
// positions instead of teleporting to the target's center.
const humanClick = (locator: Locator) => locator.click({ steps: 15 });

async function openChannelBySearch(page: Page, eventWatcher: EventWatcher, channel: string) {
  const search = new YtSearchPage(page, eventWatcher);
  // The soft search opens the search UI and types the query key-by-key
  // (pressSequentially inside submitQuery).
  await search.search(channel, "soft");
  // A visible result card does not mean the search transition finished, and
  // SPA anchor clicks can be swallowed right after results render
  // (YT-SPEC.md); the helper retries until the browser actually lands.
  await search.clickChannelThumbnailButton(channel, { click: humanClick });
}

// Attach a viewport screenshot to the test result. The HTML report keeps the
// attach order of test attachments, so each cell captures its Play All button
// first and the playlist destination second.
async function attachScreenshot(page: Page, name: string) {
  expect(ytxTest.info().attachments.map((attachment) => attachment.name)).not.toContain(name);
  const path = ytxTest.info().outputPath(`${name}.png`);
  await page.screenshot({ path });
  await ytxTest.info().attach(name, { path, contentType: "image/png" });
}

// The expanded menu can grow past the viewport, so anchor the scroll on
// the toggle button instead: scroll it to 2px below the fixed masthead,
// whose subtree would otherwise intercept the toggle's clicks, and
// capture screenshots at that page position.
async function anchorToggleBelowMasthead(page: Page, toggle: Locator) {
  const buttonTop = (await toggle.boundingBox())!.y;
  // Desktop web names its fixed header ytd-masthead; mobile web instead
  // mounts a plain <header> (mobile topbar) that scrolls away, so on
  // mobile the toggle anchors near the very top of the viewport.
  const mastheadBottom = await page.evaluate(() => {
    const masthead = document.querySelector("ytd-masthead") ?? document.querySelector("header");
    return masthead ? masthead.getBoundingClientRect().bottom : 0;
  });
  await page.evaluate((delta) => window.scrollBy({ top: delta }), buttonTop - mastheadBottom - 2);
  await expect
    .poll(async () => (await toggle.boundingBox())!.y, { timeout: 5_000 })
    .toBeLessThanOrEqual(mastheadBottom + 4);
}

// Activates a Play All button and verifies its destination: the landing URL
// carries the button's list (popup or same tab), and the playlist panel's
// rows match `expected` in order. Public cells exclude rows that YouTube
// itself marks unplayable (unplayableIds), members-only cells never filter
// rows: members-only rows are unplayable to signed-out viewers on both sides
// of the comparison (SPEC.md "Members-only destinations"). Attaches the
// destination screenshot after the panel settles.
async function activateAndVerifyDestination(params: {
  page: Page;
  button: Locator;
  expectedListId: string;
  expected: string[];
  expectedVideoId?: string | null;
  n: number;
  excludeUnplayable: boolean;
  unplayableIds?: Set<string>;
  screenshotPrefix: string;
}) {
  let openedPage: Page | undefined;
  const popupListener = (popup: Page) => {
    openedPage = popup;
  };
  params.page.on("popup", popupListener);
  try {
    await params.button.click({ steps: 15 });
    // YouTube redirects a /playlist?playnext=1 landing of the pressed
    // button's list to the same list's /watch route, so the list parameter
    // identifies the destination on both routes.
    await expect
      .poll(() => new URL((openedPage ?? params.page).url()).searchParams.get("list"), {
        timeout: 60_000,
      })
      .toBe(params.expectedListId);
    const playlistPage = openedPage ?? params.page;
    const destinationUrl = new URL(playlistPage.url());
    expect(destinationUrl.hostname).toMatch(/^(www|m)\.youtube\.com$/);
    expect(destinationUrl.pathname).toMatch(/^\/(playlist|watch)$/);
    if (params.expectedVideoId != null) {
      expect(destinationUrl.searchParams.get("v")).toBe(params.expectedVideoId);
    }
    const ytVideoPage = new YtVideoPage(playlistPage);
    const panelIds = async (): Promise<(string | null)[]> => {
      if (params.expectedVideoId != null) return [await ytVideoPage.getPlaylistSelectedVideoId()];
      let exclude: string[] = [];
      if (params.excludeUnplayable) {
        // The mobile engagement panel's /playlist response never lands in
        // window.ytInitialData, so unplayable markers are collected from the
        // destination page's window.ytInitialData here and from the context's
        // JSON responses by the caller's listener; a stale snapshot would
        // keep the poll failing forever, so the exclusion list is re-read
        // inside the poll.
        const pageUnplayableIds: string[] = await playlistPage.evaluate(() => {
          const found: string[] = [];
          const walk = (current: unknown) => {
            if (!current || typeof current !== "object") return;
            if (Array.isArray(current)) {
              for (const item of current) walk(item);
              return;
            }
            const renderer = (
              current as {
                playlistPanelVideoRenderer?: {
                  unplayableText?: unknown;
                  videoId?: unknown;
                };
              }
            ).playlistPanelVideoRenderer;
            if (renderer && renderer.unplayableText != null && typeof renderer.videoId === "string")
              found.push(renderer.videoId);
            for (const value of Object.values(current)) walk(value);
          };
          walk((window as any).ytInitialData);
          return found;
        });
        exclude = [...new Set([...pageUnplayableIds, ...(params.unplayableIds ?? [])])];
      }
      return ytVideoPage.getPlaylistVideoIds(params.n, exclude);
    };
    await expect.poll(panelIds, { timeout: 60_000 }).toEqual(params.expected);

    // Capture the destination after the playlist panel settles, while the
    // popup landing (if any) is still open.
    await attachScreenshot(playlistPage, `${params.screenshotPrefix}-destination`);
  } finally {
    params.page.off("popup", popupListener);
    await openedPage?.close();
  }
}

// Reads a playlist page's leading video ids (ordered, deduped) from a
// separate tab: the same reference the members-only destination rule uses.
async function playlistPageTopIds(page: Page, listId: string, n: number): Promise<string[]> {
  const playlistTab = await page.context().newPage();
  try {
    await playlistTab.goto(`https://www.youtube.com/playlist?list=${listId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      playlistTab
        .locator("yt-lockup-view-model a[href*='watch?v=']")
        .first()
        .describe("Playlist page first row"),
    ).toBeVisible({ timeout: 30_000 });
    return await playlistTab
      .locator("yt-lockup-view-model a[href*='watch?v=']")
      .describe("Playlist page rows")
      .evaluateAll((links, limit: number) => {
        const ids: string[] = [];
        for (const link of links) {
          const id = (link.getAttribute("href") ?? "").match(/[?&]v=([\w-]{11})/)?.[1];
          if (id && !ids.includes(id)) ids.push(id);
          if (ids.length === limit) break;
        }
        return ids;
      }, n);
  } finally {
    await playlistTab.close();
  }
}

// Captures the members channel's Home dropdown: collapsed and expanded
// shots plus the members-only entries' href checks. Shared by both journeys,
// so each trace is self-contained (the Members review trace carries its own
// dropdown shots instead of borrowing the @Apple journey's).
async function captureMembersDropdown(page: Page) {
  // A second search inside a journey is flaky on mobile: the results card's
  // channel thumbnail click can be swallowed until the test times out, which
  // makes the whole run flaky and its report show the failed first attempt.
  // Land directly on the channel's Home instead.
  await page.goto(`https://www.youtube.com/${membersChannel}`);
  const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
  const menu = dropdown.locator(":scope > div").describe("Play All menu");
  const toggle = dropdown.locator("button").describe("Play All menu toggle");
  await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
  await expect(menu).toBeHidden();
  await humanClick(toggle);
  await expect(menu).toBeVisible();
  await anchorToggleBelowMasthead(page, toggle);
  // Re-open with the toggle anchored: the menu's max height is computed
  // from the toggle's position at open time, so the first opening kept
  // the pre-scroll height and clipped the members entries.
  await humanClick(toggle);
  await expect(menu).toBeHidden();
  await attachScreenshot(page, "members-dropdown-collapsed");
  await humanClick(toggle);
  for (const [kind, prefix] of [
    ["Videos", "UUMF"],
    ["Streams", "UUMV"],
  ] as const) {
    for (const sort of ["Latest", "Oldest"]) {
      const item = menu
        .getByText(`${kind} (Members ${sort})`, { exact: true })
        .describe(`${kind} (Members ${sort}) menu item`);
      await expect(item).toBeVisible({ timeout: 30_000 });
      await expect(item).toHaveAttribute("href", new RegExp(`list=${prefix}[\\w-]+`));
    }
  }
  // The 13-item menu fits the viewport with the toggle anchored at the
  // masthead, so the members entries are in the shot without scrolling
  // inside the menu.
  await attachScreenshot(page, "members-dropdown-expanded");
  await humanClick(toggle);
  await expect(menu).toBeHidden();
}

// Runs one category-and-sort cell's public pass: hard-navigates, picks the
// sort, asserts the button, and captures its button-and-destination pair.
// `reference` decides the panel comparison source: "grid" reads the channel
// grid; "playlist-fallback" reads the grid too, except where a channel's own
// data diverges from the playlist order — Shorts / Oldest can start with a
// members-only short that the public shorts playlist does not contain, and
// an actively streaming channel's Streams page pins its live or upcoming
// stream above the playlist's latest completed stream — so those cells read
// the playlist page instead (SPEC.md "Destination videos").
async function runPublicCell(params: {
  page: Page;
  channelPage: YtChannelPage;
  category: CategoryKind;
  sort: SortKind;
  reference: "grid" | "playlist-fallback";
  unplayableIds: Set<string>;
  screenshotPrefix: string;
}) {
  const { page, channelPage, category, sort, screenshotPrefix } = params;
  await ytxTest.step(`Activate Play All (${sort}) on ${category}`, async () => {
    // The previous cell's activation can end on a playlist/watch page
    // when it stayed in the same tab, so every cell re-routes with a
    // hard navigation.
    await channelPage.navigateToCategory(category, "hard");
    // Assert the category-specific button first: the previous category's
    // button can still be attached right after navigation-end, so a bare
    // count could confirm the stale node (YT-SPEC.md).
    const categoryButton = page
      .locator(`.play-all-btn.${category.toLowerCase()}`)
      .describe(`${category} Play All button`);
    await expect(categoryButton).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".play-all-btn").describe("Play All button")).toHaveCount(1, {
      timeout: 30_000,
    });
    // The sort chips' aria-selected and the button href flip as soon as
    // the chip is clicked, but the grid keeps showing the previous
    // sort's videos until YouTube's browse response lands (see
    // playlist.test.ts). Capture the current top video so the read
    // below can wait out that swap instead of matching the destination
    // playlist against the previous sort's list.
    let previousFirstId: string | undefined;
    if (sort !== "Latest") {
      await expect
        .poll(async () => (previousFirstId = (await channelPage.getTopVideoIds(1))[0]), {
          timeout: 30_000,
        })
        .toBeTruthy();
    }
    await channelPage.navigateToSort(sort, { click: humanClick });
    const button = page
      .locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}`)
      .describe(`Play All (${sort}) button`);
    await expect(button).toBeVisible({ timeout: 30_000 });
    await expect(button).toHaveText(`Play All (${sort})`);
    await expect(button).not.toContainText("(error)");
    await expect(button).toHaveAttribute("href", expectedHref(category, sort), {
      timeout: 30_000,
    });
    const expectedUrl = new URL((await button.getAttribute("href"))!, page.url());
    const n = sort === "Oldest" ? 1 : 3;
    let channelIds: string[] = [];
    await expect
      .poll(
        async () => {
          channelIds = await channelPage.getTopVideoIds(n);
          return channelIds[0] === previousFirstId ? [] : channelIds;
        },
        { timeout: 30_000 },
      )
      .toEqual(Array.from({ length: n }, () => expect.stringMatching(/^[\w-]{11}$/)));

    // Capture the settled button before activating it, so the report
    // lists the button evidence before the destination capture.
    await attachScreenshot(page, `${screenshotPrefix}-button`);

    let expected: string[];
    let expectedVideoId: string | null;
    if (sort === "Oldest") {
      expectedVideoId =
        params.reference === "playlist-fallback" && category === "Shorts"
          ? expectedUrl.searchParams.get("v")!
          : channelIds[0]!;
      expected = [expectedVideoId];
    } else if (params.reference === "playlist-fallback" && category === "Streams") {
      expected = await playlistPageTopIds(page, expectedUrl.searchParams.get("list")!, n);
      expect(expected.length).toBeGreaterThan(0);
      expectedVideoId = null;
    } else {
      expected = channelIds;
      expectedVideoId = null;
    }
    await activateAndVerifyDestination({
      page,
      button,
      expectedListId: expectedUrl.searchParams.get("list")!,
      expected,
      expectedVideoId,
      n: expected.length,
      excludeUnplayable: true,
      unplayableIds: params.unplayableIds,
      screenshotPrefix,
    });
  });
}

function expectReviewScreenshotOrder() {
  const cells = [
    "videos-latest",
    "videos-popular",
    "videos-oldest",
    "shorts-latest",
    "shorts-popular",
    "shorts-oldest",
    "streams-latest",
    "streams-popular",
    "streams-oldest",
  ];
  const expectedNames = [
    "dropdown-collapsed",
    "dropdown-expanded",
    ...cells.flatMap((cell) => [`${cell}-button`, `${cell}-destination`]),
    "members-dropdown-collapsed",
    "members-dropdown-expanded",
    ...cells.flatMap((cell) => [
      `nasa-${cell}-button`,
      `nasa-${cell}-destination`,
      `members-${cell}-button`,
      ...(cell.startsWith("shorts-") || cell.endsWith("-popular")
        ? []
        : [`members-${cell}-destination`]),
    ]),
  ];
  const screenshots = ytxTest
    .info()
    .attachments.filter((attachment) => attachment.contentType === "image/png");
  expect(screenshots.map((attachment) => attachment.name)).toEqual(expectedNames);
  expect(new Set(screenshots.map((attachment) => attachment.path)).size).toBe(expectedNames.length);
}

ytxTest("Review", async ({ context, page, eventWatcher }) => {
  // Nine cells, each with a button capture and a playlist landing, can take
  // over 30s each under load.
  ytxTest.setTimeout(1_200_000);

  // The mobile engagement panel's /playlist response never lands in
  // window.ytInitialData, so unplayable markers are collected from the
  // context's JSON responses as well as the destination page's
  // window.ytInitialData at comparison time.
  const unplayableIds = new Set<string>();
  context.on("response", (response) => {
    void (async () => {
      try {
        const contentType = response.headers()["content-type"] ?? "";
        if (!contentType.includes("json")) return;
        const body = await response.text();
        if (!body.includes('"playlistPanelVideoRenderer"')) return;
        collectUnplayableIds(JSON.parse(body), unplayableIds);
      } catch {
        // Unreadable or non-JSON bodies contribute no exclusions.
      }
    })();
  });

  await ytxTest.step("Search for the channel and open it", () =>
    openChannelBySearch(page, eventWatcher, channel),
  );

  // The header dropdown mounts into yt-flexible-actions-view-model, which
  // exists on the channel Home tab (observed on desktop and mobile), so it is
  // exercised where it renders without entering any category tab. It appears
  // only after all nine playlist hrefs resolve, including three
  // network-backed Oldest links.
  await ytxTest.step("Expand the header Play All dropdown on Home", async () => {
    const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
    const menu = dropdown.locator(":scope > div").describe("Play All menu");
    const toggle = dropdown.locator("button").describe("Play All menu toggle");
    await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
    await expect(menu).toBeHidden();
    // The expanded menu can grow past the viewport, so anchor the scroll on
    // the toggle button instead: scroll it to 2px below the fixed masthead,
    // whose subtree would otherwise intercept the toggle's clicks, and
    // capture both shots at that page position.
    await humanClick(toggle);
    await expect(menu).toBeVisible();
    await anchorToggleBelowMasthead(page, toggle);
    await humanClick(toggle);
    await expect(menu).toBeHidden();
    await attachScreenshot(page, "dropdown-collapsed");
    await humanClick(toggle);
    // Requiring a visible menu item keeps the expanded capture from showing
    // an empty menu when every playlist resolution failed.
    await expect(menu.locator("a").first().describe("first menu item")).toBeVisible();
    await attachScreenshot(page, "dropdown-expanded");
  });

  const channelPage = new YtChannelPage(channel, page, eventWatcher);
  for (const category of YoutubeDOM.categories) {
    for (const sort of YoutubeDOM.sorts) {
      await runPublicCell({
        page,
        channelPage,
        category,
        sort,
        reference: "grid",
        unplayableIds,
        screenshotPrefix: `${category}-${sort}`.toLowerCase(),
      });
    }
  }

  // The members channel continues the same journey after @Apple's cells: its
  // dropdown, then the same category-and-sort cells with the Members only
  // toggle's own button-and-destination pairs. Members-only playlists exist
  // only for Videos and Streams with Latest and Oldest, so the toggle hides
  // the button on Shorts and on Popular (SPEC.md "Selected sort").
  const membersChannelPage = new YtChannelPage(membersChannel, page, eventWatcher);
  await ytxTest.step("Expand the members channel's Play All dropdown on Home", async () => {
    await captureMembersDropdown(page);
  });

  for (const category of YoutubeDOM.categories) {
    for (const sort of YoutubeDOM.sorts) {
      // The public pass runs exactly like an @Apple cell, then the toggle
      // row adds the Members only state.
      await runPublicCell({
        page,
        channelPage: membersChannelPage,
        category,
        sort,
        reference: "playlist-fallback",
        unplayableIds,
        screenshotPrefix: `nasa-${category}-${sort}`.toLowerCase(),
      });

      await ytxTest.step(`Toggle Members only on ${category} / ${sort}`, async () => {
        // The previous cell's activation can have ended on a playlist/watch
        // page; re-route with a hard navigation, which also resets the
        // filter chips.
        await membersChannelPage.navigateToCategory(category, "hard");
        await membersChannelPage.navigateToSort(sort, { click: humanClick });
        await membersChannelPage.selectAudienceFilter("MembersOnly", { click: humanClick });

        if (category === "Shorts" || sort === "Popular") {
          // No members-only playlist exists for this category and sort: the
          // button is not shown at all, so the toggle row has no destination
          // pair.
          await expect(page.locator(".play-all-btn").describe("Play All button")).toHaveCount(0);
          await attachScreenshot(page, `members-${category}-${sort}-button`.toLowerCase());
          return;
        }

        const membersButton = page
          .locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}.members`)
          .describe("Play All members button");
        const prefix = category === "Videos" ? "UUMF" : "UUMV";
        if (sort === "Oldest") {
          await expect(membersButton).toHaveText("Play All (Oldest)", { timeout: 60_000 });
          await expect(membersButton).toHaveAttribute(
            "href",
            new RegExp(`^/watch\\?v=[\\w-]{11}&list=${prefix}[\\w-]+&index=\\d+$`),
            { timeout: 60_000 },
          );
        } else {
          await expect(membersButton).toHaveText("Play All (Latest)", { timeout: 60_000 });
          await expect(membersButton).toHaveAttribute(
            "href",
            new RegExp(`^/playlist\\?list=${prefix}[\\w-]+&playnext=1$`),
            { timeout: 60_000 },
          );
        }
        // Capture the filtered grid with its toggled button before the
        // activation navigates away.
        await attachScreenshot(page, `members-${category}-${sort}-button`.toLowerCase());

        const membersHrefUrl = new URL((await membersButton.getAttribute("href"))!, page.url());
        const expectedListId = membersHrefUrl.searchParams.get("list")!;
        // The members-only destination panel must list the same video ids in
        // the same order as the members-only playlist page (SPEC.md
        // "Members-only destinations"), so the reference ids are read from a
        // separate tab and the activation's own panel is compared against
        // them. Rows are never filtered by playability on either side.
        let expected: string[];
        if (sort === "Oldest") {
          // The Oldest link starts playback at the playlist's oldest item;
          // its selected-row check below is the same one the menu coverage
          // tests make against the playlist page.
          expected = [membersHrefUrl.searchParams.get("v")!];
        } else {
          expected = await playlistPageTopIds(page, expectedListId, 3);
          expect(expected.length).toBeGreaterThan(0);
        }
        await activateAndVerifyDestination({
          page,
          button: membersButton,
          expectedListId,
          expected,
          expectedVideoId: sort === "Oldest" ? expected[0] : null,
          n: expected.length,
          excludeUnplayable: false,
          screenshotPrefix: `members-${category}-${sort}`.toLowerCase(),
        });
      });
    }
  }
  expectReviewScreenshotOrder();
});
