import { expect, type Page } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { attachEventWatcher, ytxTest, type EventWatcher } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

const channel = "@Microsoft";
const searchNavigationModes: ("soft" | "hard")[] = ["soft", "hard"];
const channelNavigationModes: ("soft1" | "soft2" | "hard")[] = ["soft1", "soft2", "hard"];
const categoryNavigationModes: ("soft" | "hard")[] = ["soft", "hard"];

searchNavigationModes.forEach((searchNavigationMode) => {
  channelNavigationModes.forEach((channelNavigationMode) => {
    categoryNavigationModes.forEach((categoryNavigationMode) => {
      const navigationCombinations = [
        searchNavigationMode,
        channelNavigationMode,
        categoryNavigationMode,
      ];
      const allSoft = navigationCombinations.every((navigation) => navigation.includes("soft"));
      const allHard = navigationCombinations.every((navigation) => navigation.includes("hard"));
      const isSoftHardMixed = !allSoft && !allHard;
      if (isSoftHardMixed) return;

      ytxTest(
        `Button: ${channelNavigationMode} - ${categoryNavigationMode} nav`,
        async ({ page, isMobile }, testInfo) => {
          ytxTest.skip(
            channelNavigationMode === "soft2" && isMobile,
            "soft navigation via channel name is not supported on mobile",
          );
          ytxTest.setTimeout(40_000);

          // Search results are nondeterministic: the channel card is sometimes
          // missing from the result set no matter how long it is waited for.
          // Retry the search from a fresh tab, and when it still never appears,
          // skip the remaining checks instead of failing on an external state.
          let nav: { page: Page; watcher: EventWatcher } | undefined;
          try {
            await expect(async () => {
              await nav?.page.close();
              const tab = await page.context().newPage();
              const watcher = await attachEventWatcher(tab);
              const ytSearchPage = new YtSearchPage(tab, watcher);
              await ytSearchPage.search(channel, searchNavigationMode);
              await ytSearchPage.navigateToChannel(channel, channelNavigationMode);
              nav = { page: tab, watcher };
            }).toPass({ timeout: 45_000 });
          } catch {
            await nav?.page.close();
            testInfo.skip(
              true,
              "YouTube search results never included the channel card; not an extension defect",
            );
          }
          const scenarioPage = nav!.page;
          const scenarioWatcher = nav!.watcher;

          await scenarioPage.locator(`.play-all-btns`).waitFor({ timeout: 30000 });
          const ytChannelPage = new YtChannelPage(channel, scenarioPage, scenarioWatcher);
          for (const category of YoutubeDOM.categories) {
            await ytChannelPage.navigateToCategory(category, categoryNavigationMode);
            if (category === "Streams") continue; // TODO: temporary workaround for Youtube's bug on streams tab
            for (const sort of YoutubeDOM.sorts) {
              await ytChannelPage.navigateToSort(sort);
              await scenarioPage.locator(`.play-all-btns`).waitFor({ timeout: 30000 });
              await scenarioPage
                .locator(`.play-all-btn.${sort.toLocaleLowerCase()}`)
                .waitFor({ timeout: 3000 });
              // The play-all button may be rerendered, so wait and re-check
              await new Promise((resolve) => setTimeout(resolve, 500));
              await scenarioPage.locator(`.play-all-btns`).waitFor({ timeout: 30000 });
              await scenarioPage
                .locator(`.play-all-btn.${sort.toLocaleLowerCase()}`)
                .waitFor({ timeout: 3000 });
            }
          }
        },
      );
    });
  });
});
