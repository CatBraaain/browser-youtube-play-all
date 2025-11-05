import { expect } from "@playwright/test";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

const channel = "@Microsoft";
const searchNavigations: ("soft" | "hard")[] = ["soft", "hard"];
const channelNavigations: ("soft1" | "soft2" | "hard")[] = [
  "soft1",
  "soft2",
  "hard",
];
const tabNavigations: ("soft" | "hard")[] = ["soft", "hard"];

searchNavigations.forEach((searchNavigation) => {
  channelNavigations.forEach((channelnavigation) => {
    tabNavigations.forEach((tabnavigation) => {
      const navigationCombinations = [
        searchNavigation,
        channelnavigation,
        tabnavigation,
      ];
      const allSoft = navigationCombinations.every((navigation) =>
        navigation.includes("soft"),
      );
      const allHard = navigationCombinations.every((navigation) =>
        navigation.includes("hard"),
      );
      if (!allSoft && !allHard) return;

      ytxTest(
        `button: ${channelnavigation} to channel => ${tabnavigation} to tab`,
        async ({ page, eventWatcher }) => {
          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          await ytSearchPage.search(channel, searchNavigation);
          await ytSearchPage.navigateToChannel(channelnavigation, channel);

          const ytChannelPage = new YtChannelPage(page, eventWatcher);
          await ytChannelPage.navigateToVideoTab(tabnavigation);

          await expect(page.locator(".play-all-btn")).toBeVisible();
        },
      );
    });
  });
});
