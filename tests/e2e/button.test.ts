import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";
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

          await page.locator(`.play-all-btns`).waitFor({ timeout: 3000 });
          const ytChannelPage = new YtChannelPage(channel, page, eventWatcher);
          for (const category of YoutubeDOM.categories) {
            await ytChannelPage.navigateToCategory(
              category,
              categoryNavigationMode,
            );
            for (const sort of YoutubeDOM.sorts) {
              await ytChannelPage.navigateToSort(sort);
              await page
                .locator(`.play-all-btn.${sort.toLocaleLowerCase()}`)
                .waitFor({ timeout: 3000 });
              // The play-all button may be rerendered, so wait and re-check
              await new Promise((resolve) => setTimeout(resolve, 500));
              await page
                .locator(`.play-all-btn.${sort.toLocaleLowerCase()}`)
                .waitFor({ timeout: 3000 });
            }
          }
        },
      );
    });
  });
});
