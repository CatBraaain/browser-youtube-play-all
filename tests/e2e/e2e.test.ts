import { expect } from "@playwright/test";
import { CategoryPage } from "@/entrypoints/play-all-button.content/category-page";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtSearchPage, YtVideoPage } from "../utils";

const channel = "@Microsoft";
const searchNavigationModes: ("soft" | "hard")[] = ["soft", "hard"];
const channelNavigationModes: ("soft1" | "soft2" | "hard")[] = [
  "soft1",
  "soft2",
  "hard",
];
const categoryNavigationModes: ("soft" | "hard")[] = ["soft", "hard"];

searchNavigationModes.forEach((searchNavigationMode) => {
  channelNavigationModes.forEach((channelNavigationMode) => {
    categoryNavigationModes.forEach((categoryNavigationMode) => {
      const navigationCombinations = [
        searchNavigationMode,
        channelNavigationMode,
        categoryNavigationMode,
      ];
      const allSoft = navigationCombinations.every((navigation) =>
        navigation.includes("soft"),
      );
      const allHard = navigationCombinations.every((navigation) =>
        navigation.includes("hard"),
      );
      const isSoftHardMixed = !allSoft && !allHard;
      if (isSoftHardMixed) return;

      CategoryPage.categories.forEach((category) => {
        CategoryPage.sorts.forEach((sort) => {
          ytxTest(
            `${channelNavigationMode} nav => ${categoryNavigationMode} nav => playlist: ${category} - ${sort}`,
            async ({ page, eventWatcher }) => {
              ytxTest.skip(
                category === "Shorts" && sort === "Popular",
                "Populared Shorts page has not been updated by YouTube",
              );

              const ytSearchPage = new YtSearchPage(page, eventWatcher);
              await ytSearchPage.search(channel, searchNavigationMode);
              await ytSearchPage.navigateToChannel(
                channelNavigationMode,
                channel,
              );

              const ytChannelPage = new YtChannelPage(
                channel,
                page,
                eventWatcher,
              );
              await ytChannelPage.navigateToCategory(
                categoryNavigationMode,
                category,
              );

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
