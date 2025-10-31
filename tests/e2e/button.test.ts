import { expect } from "@playwright/test";
import { YtChannelPage, YtVideoPage, ytxTest } from "../utils";

const channel = "@TED";
const channelNavigations: ("soft1" | "soft2" | "hard")[] = [
  "soft1",
  "soft2",
  "hard",
];
const tabNavigations: ("soft" | "hard")[] = ["soft", "hard"];

channelNavigations.forEach((channelnavigation) => {
  tabNavigations.forEach((tabnavigation) => {
    ytxTest(
      `button: ${channelnavigation} to channel => ${tabnavigation} to tab`,
      async ({ page, eventWatcher }) => {
        const ytVideoPage = new YtVideoPage(page, eventWatcher);
        await ytVideoPage.fromChannel(channel);
        await ytVideoPage.navigateToChannel(channelnavigation);

        const ytChannelPage = new YtChannelPage(page, eventWatcher);
        await ytChannelPage.navigateToVideoTab(tabnavigation);

        await expect(page.locator(".play-all-btn")).toBeVisible();
      },
    );
  });
});
