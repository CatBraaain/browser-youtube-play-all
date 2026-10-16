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

async function openChannelBySearch(page: Page, eventWatcher: EventWatcher) {
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
  const path = ytxTest.info().outputPath(`${name}.png`);
  await page.screenshot({ path });
  await ytxTest.info().attach(name, { path, contentType: "image/png" });
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
    openChannelBySearch(page, eventWatcher),
  );
  const channelPage = new YtChannelPage(channel, page, eventWatcher);
  for (const category of YoutubeDOM.categories) {
    for (const sort of YoutubeDOM.sorts) {
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
        await attachScreenshot(page, `${category}-${sort}-button`.toLowerCase());

        let openedPage: Page | undefined;
        const popupListener = (popup: Page) => {
          openedPage = popup;
        };
        page.on("popup", popupListener);
        try {
          await button.click({ steps: 15 });
          // YouTube redirects a /playlist?playnext=1 landing of the
          // pressed button's list to the same list's /watch route, so the
          // list parameter identifies the destination on both routes.
          await expect
            .poll(() => new URL((openedPage ?? page).url()).searchParams.get("list"), {
              timeout: 60_000,
            })
            .toBe(expectedUrl.searchParams.get("list"));
          const playlistPage = openedPage ?? page;
          const destinationUrl = new URL(playlistPage.url());
          expect(destinationUrl.hostname).toMatch(/^(www|m)\.youtube\.com$/);
          expect(destinationUrl.pathname).toMatch(/^\/(playlist|watch)$/);
          if (sort === "Oldest") {
            expect(destinationUrl.searchParams.get("v")).toBe(channelIds[0]);
          }
          const ytVideoPage = new YtVideoPage(playlistPage);
          // The exclusion list is re-read inside the poll: the mobile
          // panel's pbj response and the destination document's own
          // markers can land after the panel rows do, and a stale
          // snapshot would keep the poll failing forever.
          const playlistIds = async (): Promise<(string | null)[]> => {
            if (sort === "Oldest") return [await ytVideoPage.getPlaylistSelectedVideoId()];
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
                if (
                  renderer &&
                  renderer.unplayableText != null &&
                  typeof renderer.videoId === "string"
                )
                  found.push(renderer.videoId);
                for (const value of Object.values(current)) walk(value);
              };
              walk((window as any).ytInitialData);
              return found;
            });
            const exclude = [...new Set([...pageUnplayableIds, ...unplayableIds])];
            return ytVideoPage.getPlaylistVideoIds(n, exclude);
          };
          await expect.poll(playlistIds, { timeout: 60_000 }).toEqual(channelIds);

          // Capture the destination after the playlist panel settles, while
          // the popup landing (if any) is still open.
          await attachScreenshot(playlistPage, `${category}-${sort}-destination`.toLowerCase());
        } finally {
          page.off("popup", popupListener);
          await openedPage?.close();
        }
      });
    }
  }
});
