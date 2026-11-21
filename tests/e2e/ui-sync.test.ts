import { expect, type Page } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { attachEventWatcher, ytxTest, type EventWatcher } from "../fixture";
import { YtChannelPage, YtPage, YtSearchPage, attachSearchResultsEvidence } from "../utils";

const firstChannel = "@Microsoft";
const secondChannel = "@YouTube";

// The dropdown resolves nine playlists, including three network-backed Oldest links.
ytxTest.setTimeout(120_000);

ytxTest(
  "shows one button and dropdown on a channel and closes the dropdown on outside click",
  async ({ page, eventWatcher }) => {
    const channel = new YtChannelPage(firstChannel, page, eventWatcher);
    await channel.navigateToCategory("Videos", "hard", false);

    const playAllButton = page.locator(".play-all-btn").describe("Play All button");
    const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
    const menu = dropdown.locator(":scope > div").describe("Play All menu");
    await expect(playAllButton).toHaveCount(1, { timeout: 30_000 });
    await expect(playAllButton).toHaveText("Play All (Latest)");
    await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
    await expect(dropdown.locator("button").describe("Play All menu toggle")).toBeVisible();
    await expect(menu).toBeHidden();

    await dropdown.locator("button").describe("Play All menu toggle").click();
    await expect(menu).toBeVisible();
    await dropdown.locator("button").describe("Play All menu toggle").click();
    await expect(menu).toBeHidden();
    await dropdown.locator("button").describe("Play All menu toggle").click();
    await expect(menu).toBeVisible();
    await page.mouse.click(1, 1);
    await expect(menu).toBeHidden();
    // A click that YouTube stops from bubbling (the search box) must still
    // close the menu, and the dropdown must stay in the DOM so the hidden
    // check cannot pass vacuously. On mobile the search button click already
    // closes the menu through a normal bubbling click, so this step is
    // desktop-only.
    if (!new YtPage(page, eventWatcher).isMobile) {
      await dropdown.locator("button").describe("Play All menu toggle").click();
      await expect(menu).toBeVisible();
      await page.locator("input.yt-searchbox-input").describe("YouTube search input").click();
      await expect(menu).toBeHidden();
      await expect(dropdown).toHaveCount(1);
    }
  },
);

ytxTest("follows the selected sort", async ({ page, eventWatcher }) => {
  const channel = new YtChannelPage(firstChannel, page, eventWatcher);
  await channel.navigateToCategory("Videos", "hard", false);
  await expect(page.locator(".play-all-btn.latest").describe("Play All Latest button")).toBeVisible(
    {
      timeout: 30_000,
    },
  );

  await channel.navigateToSort("Popular");
  await expect(
    page.locator(YoutubeDOM.SORT_BUTTON).nth(1).describe("Popular sort chip"),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(".play-all-btn.popular").describe("Play All Popular button"),
  ).toHaveText("Play All (Popular)");
});

ytxTest(
  "replaces the previous channel's UI when navigating to another channel",
  async ({ page }, testInfo) => {
    // The scenario depends on external YouTube state: search results sometimes
    // come back without the channel card, and no amount of waiting fixes that.
    // Retry only card-less results, starting each attempt on a fresh tab.
    const runScenario = async (scenarioPage: Page, scenarioWatcher: EventWatcher) => {
      const first = new YtChannelPage(firstChannel, scenarioPage, scenarioWatcher);
      // wait = true completes the initial load's route transition (scoped
      // navigation wait), so the UI below observes a settled route.
      await first.navigateToCategory("Videos", "hard");
      const firstHref = await scenarioPage
        .locator(".play-all-btn.latest")
        .describe("Play All Latest button")
        .getAttribute("href");
      expect(firstHref).toBeTruthy();

      const search = new YtSearchPage(scenarioPage, scenarioWatcher);
      await search.openSearchForm();
      // Arm the baseline before submitting so only the search transition's
      // navigation-end satisfies the wait below, not an earlier firing.
      const searchSince = await scenarioWatcher.captureNavigationBaseline();
      await search.submitQuery(secondChannel);
      await expect(scenarioPage).toHaveURL(/\/results\?/);
      // A visible card does not mean the search transition finished; YouTube can
      // still swallow clicks until yt-navigate-finish (see YT-SPEC.md).
      await scenarioWatcher.waitForNavigationEnd({ since: searchSince });
      // A missing target is YouTube-side variance; retry the scenario on a fresh tab.
      const shape = await search.waitForChannelTarget(
        search.topVideoChannelThumbnailButton(secondChannel),
      );
      if (shape !== "target") {
        await attachSearchResultsEvidence(testInfo, scenarioPage, shape);
        return false;
      }
      // soft1 also completes the channel transition's navigation-end wait; the
      // tab click below must run outside the swallowed-click window (YT-SPEC.md).
      await search.navigateToChannel(secondChannel, "soft1");
      const second = new YtChannelPage(secondChannel, scenarioPage, scenarioWatcher);
      await second.navigateToCategory("Videos", "soft", false);
      await expect(scenarioPage).toHaveURL(/youtube\.com\/@YouTube\/videos\/?$/i);

      const button = scenarioPage
        .locator(".play-all-btn.videos.latest")
        .describe("Videos Latest Play All button");
      await expect(
        scenarioPage.locator(YoutubeDOM.SORT_BUTTON).first().describe("Latest sort chip"),
      ).toHaveAttribute("aria-selected", "true");
      await expect(button).toHaveCount(1);
      await expect(button).toHaveText("Play All (Latest)");
      await expect(button).not.toHaveAttribute("href", firstHref!);
      const dropdown = scenarioPage.locator(".play-all-btns").describe("Play All dropdown");
      await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
      await expect(
        dropdown.getByText("Videos (Latest)").describe("Videos Latest menu item"),
      ).not.toHaveAttribute("href", firstHref!);

      await expect(button).toHaveAttribute("href", /^\/playlist\?list=UULF[\w-]+&playnext=1$/, {
        timeout: 30_000,
      });
      return true;
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const retryPage = await page.context().newPage();
      try {
        const retryWatcher = await attachEventWatcher(retryPage);
        if (await runScenario(retryPage, retryWatcher)) return;
      } finally {
        await retryPage.close();
      }
    }
    testInfo.skip(
      true,
      "YouTube search results never included the channel card; not an extension defect",
    );
  },
);

ytxTest("does not show extension UI on a watch page", async ({ page, eventWatcher }) => {
  const channel = new YtChannelPage(firstChannel, page, eventWatcher);
  await channel.navigateToCategory("Videos", "hard", false);
  await expect(page.locator(".play-all-btn.latest").describe("Play All Latest button")).toBeVisible(
    { timeout: 30_000 },
  );
  const [videoId] = await channel.getTopVideoIds(1);
  expect(videoId).toBeTruthy();

  await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
    waitUntil: "domcontentloaded",
  });
  // Mobile watch pages use ytm-watch instead of the desktop ytd-watch-flexy
  await expect(page.locator("ytd-watch-flexy, ytm-watch")).toBeAttached({ timeout: 30_000 });
  await expect(page.locator(".play-all-btn, .play-all-btns").describe("Play All UI")).toHaveCount(
    0,
  );
});
