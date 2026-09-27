import { expect } from "@playwright/test";

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
      await ytChannelPage.navigateToSort(sort, true);

      const n = sort !== "Oldest" ? checkVideoCount : 1;
      await expect(
        page.locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}`),
      ).toHaveAttribute(
        "href",
        sort === "Oldest"
          ? /^\/watch\?v=[\w-]{11}&list=UL01234567890$/
          : new RegExp(`^/playlist\\?list=${playlistPrefixes[category][sort]}[\\w-]+&playnext=1$`),
        { timeout: 30_000 },
      );
      const playlistUrl = await ytChannelPage.getPlayAllUrl(category, sort);
      const playlistPage = await page.context().newPage();
      try {
        await playlistPage.goto(playlistUrl, { waitUntil: "domcontentloaded" });
        const ytVideoPage = new YtVideoPage(playlistPage);
        const oldestVideoId = new URL(playlistUrl).searchParams.get("v");

        await expect
          .poll(
            async () => {
              const [channelIds, playlistIds] = await Promise.all([
                ytChannelPage.getTopVideoIds(n),
                sort === "Oldest"
                  ? ytVideoPage.getPlaylistSelectedVideoId().then((id) => [id])
                  : ytVideoPage.getPlaylistVideoIds(n),
              ]);
              return {
                channelCount: channelIds.length,
                playlistCount: playlistIds.length,
                idsAreValid: [...channelIds, ...playlistIds].every(
                  (id) => typeof id === "string" && /^[\w-]{11}$/.test(id),
                ),
                orderMatches: playlistIds.every((id, index) => id === channelIds[index]),
                oldestUrlMatches: sort !== "Oldest" || playlistIds[0] === oldestVideoId,
              };
            },
            { timeout: 30_000 },
          )
          .toEqual({
            channelCount: n,
            playlistCount: n,
            idsAreValid: true,
            orderMatches: true,
            oldestUrlMatches: true,
          });
      } finally {
        await playlistPage.close();
      }
    });
  });
});
