import { expect } from "@playwright/test";
import { CategoryPage } from "@/entrypoints/play-all-button.content/category-page";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtSearchPage, YtVideoPage } from "../utils";

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
      const isSoftHardMixed = !allSoft && !allHard;
      if (isSoftHardMixed) return;

      CategoryPage.categories.forEach((tab) => {
        CategoryPage.sorts.forEach((sort) => {
          ytxTest(
            `${channelnavigation} to channel => ${tabnavigation} to tab => playlist: ${tab} - ${sort}`,
            async ({ page, eventWatcher }) => {
              ytxTest.skip(
                tab === "Shorts" && sort === "Popular",
                "Populared Shorts page has not been updated by YouTube",
              );

              const ytSearchPage = new YtSearchPage(page, eventWatcher);
              await ytSearchPage.search(channel, searchNavigation);
              await ytSearchPage.navigateToChannel(channelnavigation, channel);

              const ytChannelPage = new YtChannelPage(page, eventWatcher);
              await ytChannelPage.navigateToVideoTab(tabnavigation);

              await expect(page.locator(".play-all-btn")).toBeVisible();

              const n = sort !== "Oldest" ? 3 : 1;
              const channelTopVideoIds = await ytChannelPage.getTopVideoIds(n);
              await ytChannelPage.navigateToPlayAll();

              const ytVideoPage = new YtVideoPage(page);
              const playlistVideoIds =
                sort !== "Oldest"
                  ? await ytVideoPage.getPlaylistVideoIds(n)
                  : [await ytVideoPage.getPlaylistSelectedVideoId()];
              expect(channelTopVideoIds).toEqual(playlistVideoIds);
            },
          );
        });
      });
    });
  });
});
