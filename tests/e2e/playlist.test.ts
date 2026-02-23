import { expect } from "@playwright/test";
import { CategoryTab } from "@/entrypoints/play-all-button.content/category-tab";
import { SortTab } from "@/entrypoints/play-all-button.content/sort-tab";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtPage, YtVideoPage } from "../utils";

const channel = "@Microsoft";

CategoryTab.categories.forEach((category) => {
  SortTab.sorts.forEach((sort) => {
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
        const topVideoIds = await ytChannelPage.getTopVideoIds(3);

        await page.goto(playlistUrl);
        const ytPage = new YtPage(page, eventWatcher);
        await eventWatcher.waitForFired(ytPage.NavigationEndEvent);

        const ytVideoPage = new YtVideoPage(page);
        const n = sort !== "Oldest" ? 3 : 1;
        const playlistVideoIds =
          sort !== "Oldest"
            ? await ytVideoPage.getPlaylistVideoIds(n)
            : [await ytVideoPage.getPlaylistSelectedVideoId()];
        expect(playlistVideoIds).toEqual(topVideoIds.slice(0, n));
      },
    );
  });
});
