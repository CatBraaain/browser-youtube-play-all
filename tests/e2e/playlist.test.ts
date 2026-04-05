import { expect } from "@playwright/test";
import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtPage, YtVideoPage } from "../utils";

const channel = "@Microsoft";
const checkVideoCount = 3;

YoutubeDOM.categories.forEach((category) => {
  YoutubeDOM.sorts.forEach((sort) => {
    ytxTest(
      `Playlist: ${category} - ${sort}`,
      async ({ page, eventWatcher }) => {
        ytxTest.skip(
          category === "Shorts" && sort === "Popular",
          "Populared Shorts page has not been updated by YouTube",
        );
        const ytChannelPage = new YtChannelPage(channel, page, eventWatcher);
        await ytChannelPage.navigateToCategory(category, "hard");
        await ytChannelPage.navigateToSort(sort);
        const playlistUrl = await ytChannelPage.getPlayAllUrl(category, sort);
        const topVideoIds = await ytChannelPage.getTopVideoIds(checkVideoCount);

        await page.goto(playlistUrl);
        const ytPage = new YtPage(page, eventWatcher);
        await eventWatcher.waitForFired(ytPage.NavigationEndEvent);

        const ytVideoPage = new YtVideoPage(page);
        const n = sort !== "Oldest" ? checkVideoCount : 1;
        const playlistVideoIds =
          sort !== "Oldest"
            ? await ytVideoPage.getPlaylistVideoIds(n)
            : [await ytVideoPage.getPlaylistSelectedVideoId()];
        expect(playlistVideoIds).toEqual(topVideoIds.slice(0, n));
      },
    );
  });
});
