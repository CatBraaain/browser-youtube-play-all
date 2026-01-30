import { expect } from "@playwright/test";
import { CategoryTab } from "@/entrypoints/play-all-button.content/category-tab";
import { ytxTest } from "../fixture";
import {
  type PlayAllTestCaseMap,
  YtChannelPage,
  YtSearchPage,
  YtVideoPage,
} from "../utils";

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

      ytxTest.describe(
        `${channelNavigationMode} nav => ${categoryNavigationMode} nav`,
        () => {
          let playAllTestCaseMap: PlayAllTestCaseMap;
          ytxTest.beforeAll(async ({ page, eventWatcher }) => {
            ytxTest.setTimeout(60000);

            const ytSearchPage = new YtSearchPage(page, eventWatcher);
            await ytSearchPage.search(channel, searchNavigationMode);
            await ytSearchPage.navigateToChannel(
              channel,
              channelNavigationMode,
            );

            const ytChannelPage = new YtChannelPage(
              channel,
              page,
              eventWatcher,
            );

            playAllTestCaseMap =
              await ytChannelPage.collectPlayAllTestCaseByCategorySort(
                categoryNavigationMode,
              );
          });

          CategoryTab.categories.forEach((category) => {
            CategoryTab.sorts.forEach((sort) => {
              ytxTest(
                `playlist: ${category} - ${sort}`,
                async ({ page, eventWatcher }) => {
                  ytxTest.skip(
                    category === "Shorts" && sort === "Popular",
                    "Populared Shorts page has not been updated by YouTube",
                  );
                  const playAllTestCase = playAllTestCaseMap[category][sort];
                  await page.goto(playAllTestCase.url);
                  await eventWatcher.waitForFired("yt-navigate-finish");
                  const ytVideoPage = new YtVideoPage(page);
                  const n = sort !== "Oldest" ? 3 : 1;
                  const playlistVideoIds =
                    sort !== "Oldest"
                      ? await ytVideoPage.getPlaylistVideoIds(n)
                      : [await ytVideoPage.getPlaylistSelectedVideoId()];
                  const expectedTopVideoIds =
                    playAllTestCase.expectedTopVideoIds;
                  expect(playlistVideoIds).toEqual(
                    expectedTopVideoIds.slice(0, n),
                  );
                },
              );
            });
          });
        },
      );
    });
  });
});
