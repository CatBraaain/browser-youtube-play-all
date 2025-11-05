import { expect } from "@playwright/test";
import { CategoryPage } from "@/entrypoints/content/category-page";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtVideoPage } from "../utils";

const channel = "@Microsoft";

CategoryPage.categories.forEach((tab) => {
  CategoryPage.sorts.forEach((sort) => {
    ytxTest(`playlist: ${tab} - ${sort}`, async ({ page, eventWatcher }) => {
      ytxTest.skip(
        tab === "Shorts" && sort === "Popular",
        "Populared Shorts page has not been updated by YouTube",
      );

      const ytChannelPage = new YtChannelPage(page, eventWatcher);
      await ytChannelPage.visitTab(channel, tab, sort);
      await expect(page.locator(".play-all-btn")).toBeVisible();

      const n = sort !== "Oldest" ? 3 : 1;
      const channelTopVideoIds = await ytChannelPage.getTopVideoIds(n);
      await ytChannelPage.navigateToPlayAll();

      const ytVideoPage = new YtVideoPage(page, eventWatcher);
      const playlistVideoIds =
        sort !== "Oldest"
          ? await ytVideoPage.getPlaylistVideoIds(n)
          : [await ytVideoPage.getPlaylistSelectedVideoId()];
      expect(channelTopVideoIds).toEqual(playlistVideoIds);
    });
  });
});
