import { CategoryTab } from "@/entrypoints/play-all-button.content/category-tab";
import { SortTab } from "@/entrypoints/play-all-button.content/sort-tab";
import { ytxTest } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

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

      ytxTest(
        `Button: ${channelNavigationMode} - ${categoryNavigationMode} nav`,
        async ({ page, eventWatcher, isMobile }) => {
          ytxTest.skip(
            channelNavigationMode === "soft2" && isMobile,
            "soft navigation via channel name is not supported on mobile",
          );

          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          await ytSearchPage.search(channel, searchNavigationMode);
          await ytSearchPage.navigateToChannel(channel, channelNavigationMode);

          const ytChannelPage = new YtChannelPage(channel, page, eventWatcher);
          for (const category of CategoryTab.categories) {
            await ytChannelPage.navigateToCategory(
              category,
              categoryNavigationMode,
            );
            for (const sort of SortTab.sorts) {
              await ytChannelPage.navigateToSort(sort);
            }
          }
        },
      );
    });
  });
});
