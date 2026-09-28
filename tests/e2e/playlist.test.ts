import { expect, type Page } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { ytxTest } from "../fixture";
import { YtChannelPage, YtVideoPage } from "../utils";

const channel = "@Apple";
const checkVideoCount = 3;
const playlistPrefixes = {
  Videos: { Latest: "UULF", Popular: "UULP" },
  Shorts: { Latest: "UUSH", Popular: "UUPS" },
  Streams: { Latest: "UULV", Popular: "UUPV" },
} as const;

YoutubeDOM.categories.forEach((category) => {
  YoutubeDOM.sorts.forEach((sort) => {
    ytxTest(`Playlist: ${category} - ${sort}`, async ({ page, eventWatcher }) => {
      const ytChannelPage = new YtChannelPage(channel, page, eventWatcher);
      await ytChannelPage.navigateToCategory(category, "hard");
      await expect(page.locator(`.play-all-btn.${category.toLowerCase()}`)).toBeVisible({
        timeout: 30_000,
      });
      // The sort chips' aria-selected and the button href flip as soon as the
      // chip is clicked, but the grid keeps showing the previous sort's videos
      // until YouTube's browse response lands. Capture the current top video
      // so the read below can wait out that swap instead of matching the
      // destination playlist against the previous sort's list.
      let previousFirstId: string | undefined;
      if (sort !== "Latest") {
        await expect
          .poll(async () => (previousFirstId = (await ytChannelPage.getTopVideoIds(1))[0]), {
            timeout: 30_000,
          })
          .toBeTruthy();
      }
      await ytChannelPage.navigateToSort(sort, true);

      const n = sort === "Oldest" ? 1 : checkVideoCount;
      const button = page.locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}`);
      await expect(button).toHaveAttribute(
        "href",
        sort === "Oldest"
          ? /^\/watch\?v=[\w-]{11}&list=UL01234567890$/
          : new RegExp(`^/playlist\\?list=${playlistPrefixes[category][sort]}[\\w-]+&playnext=1$`),
        { timeout: 30_000 },
      );
      const expectedUrl = new URL((await button.getAttribute("href"))!, page.url());
      let channelIds: string[] = [];
      await expect
        .poll(
          async () => {
            channelIds = await ytChannelPage.getTopVideoIds(n);
            return channelIds[0] === previousFirstId ? [] : channelIds;
          },
          { timeout: 30_000 },
        )
        .toEqual(Array.from({ length: n }, () => expect.stringMatching(/^[\w-]{11}$/)));

      let openedPage: Page | undefined;
      page.on("popup", (popup) => {
        openedPage = popup;
      });
      try {
        await button.click();
        await expect
          .poll(() => new URL((openedPage ?? page).url()).searchParams.get("list"), {
            timeout: 30_000,
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
        await expect
          .poll(
            () =>
              sort === "Oldest"
                ? ytVideoPage.getPlaylistSelectedVideoId().then((id) => [id])
                : ytVideoPage.getPlaylistVideoIds(n),
            { timeout: 60_000 },
          )
          .toEqual(channelIds);
      } finally {
        await openedPage?.close();
      }
    });
  });
});
