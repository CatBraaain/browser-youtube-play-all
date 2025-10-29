import { expect } from "@playwright/test";
import { YtChannelPage, YtVideoPage, ytxTest } from "../utils";

const channel = "@TED";
const tabs: ("videos" | "shorts" | "streams")[] = [
  "videos",
  "shorts",
  "streams",
];
const sorts: ("Latest" | "Popular" | "Oldest")[] = [
  "Latest",
  "Popular",
  "Oldest",
];

tabs.forEach((tab) => {
  sorts.forEach((sort) => {
    ytxTest(`playlist: ${tab} - ${sort}`, async ({ page, eventWatcher }) => {
      const ytChannelPage = new YtChannelPage(page, eventWatcher);
      await ytChannelPage.visitTab(channel, tab, sort);
      await expect(page.locator(".play-all-btn")).toBeAttached();

      const n = 3;
      const channelVideoIds = await ytChannelPage.getVideoIds(n);
      await ytChannelPage.navigateToPlayAll();

      const ytVideoPage = new YtVideoPage(page, eventWatcher);
      const playlistVideoIds = await ytVideoPage.getPlaylistVideoIds(n);

      expect(channelVideoIds).toEqual(playlistVideoIds);
    });
  });
});
