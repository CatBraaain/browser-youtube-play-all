import { expect } from "@playwright/test";
import { CategoryPage } from "@/entrypoints/content/category-page";
import { YtChannelPage, YtVideoPage, ytxTest } from "../utils";

const channel = "@TED";

CategoryPage.categories.forEach((tab) => {
  CategoryPage.sorts.forEach((sort) => {
    ytxTest(`playlist: ${tab} - ${sort}`, async ({ page, eventWatcher }) => {
      ytxTest.skip(
        tab === "Shorts" && sort === "Popular",
        "Populared Shorts page has not been updated by YouTube",
      );
      ytxTest.skip(
        ["Shorts", "Streams"].includes(tab) && sort === "Oldest",
        "Not supported by YouTube",
      );

      const ytChannelPage = new YtChannelPage(page, eventWatcher);
      await ytChannelPage.visitTab(channel, tab, sort);
      await expect(page.locator(".play-all-btn")).toBeVisible();

      const n = 3;
      const channelTopVideoIds = await ytChannelPage.getTopVideoIds(n);
      await ytChannelPage.navigateToPlayAll();

      const ytVideoPage = new YtVideoPage(page, eventWatcher);
      const playlistVideoIds = await ytVideoPage.getPlaylistVideoIds(n);

      expect(channelTopVideoIds).toEqual(playlistVideoIds);
    });
  });
});
