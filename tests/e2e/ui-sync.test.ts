import { errors, expect, type Page } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { attachEventWatcher, ytxTest, type EventWatcher } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

const firstChannel = "@Microsoft";
const secondChannel = "@YouTube";

// Installs the extension's DOM-based fetch gate before any page script runs.
// page.route cannot observe content-script fetches on Firefox (Juggler only
// hooks page-context requests), so tests inject delays/aborts through the gate
// instead. See the fetch gate in youtube-api.ts.
function installFetchGate(page: Page, gate: { delay?: string[]; abort?: string[] }) {
  return page.addInitScript((gate) => {
    const install = () => {
      document.documentElement.dataset.ytxFetchGate = JSON.stringify(gate);
    };
    if (document.documentElement) {
      install();
    } else {
      new MutationObserver((_, observer) => {
        if (document.documentElement) {
          install();
          observer.disconnect();
        }
      }).observe(document, { childList: true });
    }
  }, gate);
}

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
  "keeps the last selected sort after a delayed Oldest resolution",
  async ({ page, eventWatcher }) => {
    await installFetchGate(page, { delay: ["/playlist?list=UULF"] });
    const releaseGate = () =>
      page.evaluate(() => delete document.documentElement.dataset.ytxFetchGate);

    try {
      const channel = new YtChannelPage(firstChannel, page, eventWatcher);
      await channel.navigateToCategory("Videos", "hard", false);
      await expect(
        page.locator(".play-all-btn.latest").describe("Play All Latest button"),
      ).toBeVisible({ timeout: 30_000 });
      // The Oldest resolution starts with Channel.load; wait until the gate holds it.
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.ytxFetchGateHeld), {
          timeout: 30_000,
        })
        .toContain("/playlist?list=UULF");
      await expect(page.locator(".play-all-btns").describe("Play All dropdown")).toHaveCount(0);

      // Each sort click waits for the grid swap to settle (navigateToSort),
      // so one transition completes before the next click and cannot race
      // the assertions below.
      await channel.navigateToSort("Oldest");
      await channel.navigateToSort("Latest");
      await channel.navigateToSort("Popular");
      await expect(
        page.locator(".play-all-btn.popular").describe("Play All Popular button"),
      ).toHaveText("Play All (Popular)");

      // The dropdown waits for every playlist resolution, even if one resolves empty.
      await releaseGate();
      await expect(page.locator(".play-all-btns").describe("Play All dropdown")).toHaveCount(1, {
        timeout: 30_000,
      });
      await expect(page.locator(".play-all-btn").describe("Play All button")).toHaveCount(1);
      await expect(page.locator(".play-all-btn").describe("Play All button")).toHaveText(
        "Play All (Popular)",
      );
      await expect(
        page.locator(YoutubeDOM.SORT_BUTTON).nth(1).describe("Popular sort chip"),
      ).toHaveAttribute("aria-selected", "true");
    } finally {
      await releaseGate();
    }
  },
);

ytxTest(
  "shows an (error) button without href when the playlist resolution fails",
  async ({ page, eventWatcher }) => {
    // Videos + Oldest is the only resolution backed by /playlist?list=UULF... fetches;
    // aborting them injects a resolution failure for that condition alone.
    await installFetchGate(page, { abort: ["/playlist?list=UULF"] });

    const channel = new YtChannelPage(firstChannel, page, eventWatcher);
    await channel.navigateToCategory("Videos", "hard", false);
    await expect(
      page.locator(".play-all-btn.latest").describe("Play All Latest button"),
    ).toBeVisible({ timeout: 30_000 });

    // The failure does not propagate to the dropdown: it still renders, including
    // entries for conditions other than the failed one.
    const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
    await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
    await expect(
      dropdown.getByText("Videos (Latest)", { exact: true }).describe("Videos Latest menu item"),
    ).toHaveCount(1);

    await channel.navigateToSort("Oldest");
    const errorButton = page.locator(".play-all-btn.oldest").describe("Play All Oldest button");
    await expect(errorButton).toHaveText("Play All (Oldest) (error)", { timeout: 30_000 });
    await expect(errorButton).not.toHaveAttribute("href");

    // Clicking the error button once must not navigate.
    await page.evaluate(() => {
      (window as any).__errorButtonClicks = 0;
      document.addEventListener(
        "click",
        (event) => {
          if ((event.target as Element).closest(".play-all-btn.oldest")) {
            (window as any).__errorButtonClicks++;
          }
        },
        { capture: true },
      );
    });
    const urlBeforeClick = page.url();
    await errorButton.click();
    expect(await page.evaluate(() => (window as any).__errorButtonClicks)).toBe(1);
    await expect(page).toHaveURL(urlBeforeClick);
    await expect(
      page.locator(YoutubeDOM.SORT_BUTTON).nth(2).describe("Oldest sort chip"),
    ).toHaveAttribute("aria-selected", "true");

    // The failure does not propagate to other conditions: Popular keeps its normal button.
    await channel.navigateToSort("Popular");
    await expect(
      page.locator(".play-all-btn.popular").describe("Play All Popular button"),
    ).toHaveText("Play All (Popular)", {
      timeout: 30_000,
    });
    await expect(
      page.locator(".play-all-btn.popular").describe("Play All Popular button"),
    ).toHaveAttribute("href", /playlist\?list=UULP/);
  },
);

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
      const channelButton = search.topVideoChannelThumbnailButton(secondChannel);
      try {
        await channelButton.waitFor({ state: "visible", timeout: 20_000 });
      } catch (error) {
        if (error instanceof errors.TimeoutError && (await channelButton.count()) === 0) {
          return false;
        }
        throw error;
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
