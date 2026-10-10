import { errors, expect, type Page } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { attachEventWatcher, JOURNEY_TAG, ytxTest, type EventWatcher } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

const channel = "@Apple";
const searchNavigationModes: ("soft" | "hard")[] = ["soft", "hard"];
const channelNavigationModes: ("soft1" | "soft2" | "hard")[] = ["soft1", "soft2", "hard"];
const categoryNavigationModes: ("soft" | "hard")[] = ["soft", "hard"];
const playlistPrefixes = {
  Videos: { Latest: "UULF", Popular: "UULP" },
  Shorts: { Latest: "UUSH", Popular: "UUPS" },
  Streams: { Latest: "UULV", Popular: "UUPV" },
} as const;

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
        `Button: ${channelNavigationMode} - ${categoryNavigationMode} nav ${JOURNEY_TAG}`,
        async ({ page, isMobile }, testInfo) => {
          ytxTest.skip(
            channelNavigationMode === "soft2" && isMobile,
            "soft navigation via channel name is not supported on mobile",
          );
          // Each sort click waits out the grid swap (navigateToSort), which adds
          // ~2 s per sort x 9 sorts; Firefox journeys run close to this budget.
          ytxTest.setTimeout(150_000);

          // Only an absent search-result card is external nondeterminism.
          const searchDeadline = Date.now() + 45_000;
          let tab: Page | undefined;
          let nav: { page: Page; watcher: EventWatcher } | undefined;
          try {
            while (!nav) {
              tab = await page.context().newPage();
              const watcher = await attachEventWatcher(tab);
              const ytSearchPage = new YtSearchPage(tab, watcher);
              await ytSearchPage.search(channel, searchNavigationMode);
              await expect(tab).toHaveURL(
                (url) =>
                  url.pathname === "/results" && url.searchParams.get("search_query") === channel,
              );
              const channelCard =
                channelNavigationMode === "soft2"
                  ? ytSearchPage.topVideoChannelNameButton(channel)
                  : ytSearchPage.topVideoChannelThumbnailButton(channel);
              try {
                await channelCard.waitFor({
                  state: "visible",
                  timeout: Math.min(5_000, Math.max(1, searchDeadline - Date.now())),
                });
              } catch (error) {
                if (!(error instanceof errors.TimeoutError) || (await channelCard.count()) !== 0) {
                  throw error;
                }
                if (Date.now() >= searchDeadline) {
                  testInfo.skip(
                    true,
                    "YouTube search results never included the channel card; not an extension defect",
                  );
                }
                await tab.close();
                tab = undefined;
                continue;
              }
              await ytSearchPage.navigateToChannel(channel, channelNavigationMode);
              nav = { page: tab, watcher };
            }
            const scenarioPage = nav.page;
            const scenarioWatcher = nav.watcher;

            await scenarioPage
              .locator(".play-all-btns")
              .describe("Play All button group")
              .waitFor({ timeout: 30_000 });
            const ytChannelPage = new YtChannelPage(channel, scenarioPage, scenarioWatcher);
            for (const category of YoutubeDOM.categories) {
              await ytChannelPage.navigateToCategory(category, categoryNavigationMode);
              await expect(
                scenarioPage
                  .locator(`.play-all-btn.${category.toLowerCase()}`)
                  .describe(`Play All ${category} button`),
              ).toBeVisible({ timeout: 30_000 });
              for (const sort of YoutubeDOM.sorts) {
                await ytChannelPage.navigateToSort(sort);
                const button = scenarioPage
                  .locator(`.play-all-btn.${category.toLowerCase()}.${sort.toLowerCase()}`)
                  .describe(`Play All ${category} ${sort} button`);
                const expectedHref =
                  sort === "Oldest"
                    ? /^\/watch\?v=[\w-]{11}&list=UL01234567890$/
                    : new RegExp(
                        `^/playlist\\?list=${playlistPrefixes[category][sort]}[\\w-]+&playnext=1$`,
                      );
                await expect(button).toHaveAttribute("href", expectedHref, { timeout: 30_000 });
                await expect(button).not.toContainText("(error)");
              }
              if (category === "Shorts") {
                const selectedButton = scenarioPage
                  .locator(".play-all-btn.shorts.oldest")
                  .describe("Oldest Shorts Play All button");
                await expect(selectedButton).toBeVisible({ timeout: 30_000 });
                const oldestVideoId = new URL(
                  (await selectedButton.getAttribute("href"))!,
                  scenarioPage.url(),
                ).searchParams.get("v");
                await expect
                  .poll(() => ytChannelPage.getTopVideoIds(1), { timeout: 30_000 })
                  .toEqual([oldestVideoId]);
                const videoList = isMobile
                  ? "ytm-browse .modern-tabs"
                  : "ytd-browse[role='main'] #primary #contents";
                await expect(
                  scenarioPage
                    .locator(`${videoList} a[href='/shorts/${oldestVideoId}']:visible`)
                    .first()
                    .describe("Oldest Shorts video"),
                ).toBeVisible({ timeout: 30_000 });
                await expect(
                  scenarioPage
                    .locator(`${videoList} [class*='skeleton' i]:visible`)
                    .describe("Shorts loading placeholders"),
                ).toHaveCount(0, { timeout: 30_000 });
                await expect(
                  scenarioPage.locator(YoutubeDOM.SORT_BUTTON).nth(2).describe("Oldest sort chip"),
                ).toHaveAttribute("aria-selected", "true");
                await expect(
                  scenarioPage.locator(".play-all-btn").describe("Play All buttons"),
                ).toHaveCount(1);
                await expect(selectedButton).toHaveText("Play All (Oldest)");
                await expect(selectedButton).toBeVisible();
              }
            }
          } finally {
            await tab?.close();
          }
        },
      );
    });
  });
});
