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

    const playAllButton = page.locator(".play-all-btn");
    const dropdown = page.locator(".play-all-btns");
    const menu = dropdown.locator(":scope > div");
    await expect(playAllButton).toHaveCount(1, { timeout: 30_000 });
    await expect(playAllButton).toHaveText("Play All (Latest)");
    await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
    await expect(dropdown.locator("button")).toBeVisible();
    await expect(menu).toBeHidden();

    await dropdown.locator("button").click();
    await expect(menu).toBeVisible();
    await dropdown.locator("button").click();
    await expect(menu).toBeHidden();
    await dropdown.locator("button").click();
    await expect(menu).toBeVisible();
    await page.mouse.click(1, 1);
    await expect(menu).toBeHidden();
  },
);

ytxTest("follows the selected sort", async ({ page, eventWatcher }) => {
  const channel = new YtChannelPage(firstChannel, page, eventWatcher);
  await channel.navigateToCategory("Videos", "hard", false);
  await expect(page.locator(".play-all-btn.latest")).toBeVisible({ timeout: 30_000 });

  await channel.navigateToSort("Popular");
  await expect(page.locator(YoutubeDOM.SORT_BUTTON).nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".play-all-btn.popular")).toHaveText("Play All (Popular)");
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
      await expect(page.locator(".play-all-btn.latest")).toBeVisible({ timeout: 30_000 });
      // The Oldest resolution starts with Channel.load; wait until the gate holds it.
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.ytxFetchGateHeld), {
          timeout: 30_000,
        })
        .toContain("/playlist?list=UULF");
      await expect(page.locator(".play-all-btns")).toHaveCount(0);

      // Select each sort with its aria-selected landed: rapid clicks get
      // coalesced by YouTube's SPA, which under load can leave the chips'
      // selection state unset and race the assertions below.
      await channel.navigateToSort("Oldest", true);
      await channel.navigateToSort("Latest", true);
      await channel.navigateToSort("Popular", true);
      await expect(page.locator(".play-all-btn.popular")).toHaveText("Play All (Popular)");

      // The dropdown waits for every playlist resolution, even if one resolves empty.
      await releaseGate();
      await expect(page.locator(".play-all-btns")).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator(".play-all-btn")).toHaveCount(1);
      await expect(page.locator(".play-all-btn")).toHaveText("Play All (Popular)");
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
    await expect(page.locator(".play-all-btn.latest")).toBeVisible({ timeout: 30_000 });

    // The failure does not propagate to the dropdown: it still renders, including
    // entries for conditions other than the failed one.
    const dropdown = page.locator(".play-all-btns");
    await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
    await expect(dropdown.getByText("Videos (Latest)", { exact: true })).toHaveCount(1);

    await channel.navigateToSort("Oldest");
    const errorButton = page.locator(".play-all-btn.oldest");
    await expect(errorButton).toHaveText("Play All (Oldest) (error)", { timeout: 30_000 });
    await expect(errorButton).not.toHaveAttribute("href");

    // Clicking the error button must not navigate.
    const urlBeforeClick = page.url();
    await errorButton.click();
    await expect(page).toHaveURL(urlBeforeClick);

    // The failure does not propagate to other conditions: Popular keeps its normal button.
    await channel.navigateToSort("Popular");
    await expect(page.locator(".play-all-btn.popular")).toHaveText("Play All (Popular)", {
      timeout: 30_000,
    });
    await expect(page.locator(".play-all-btn.popular")).toHaveAttribute(
      "href",
      /playlist\?list=UULP/,
    );
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
      await first.navigateToCategory("Videos", "hard", false);
      const firstHref = await scenarioPage.locator(".play-all-btn.latest").getAttribute("href");
      expect(firstHref).toBeTruthy();

      const search = new YtSearchPage(scenarioPage, scenarioWatcher);
      await search.openSearchForm();
      await scenarioPage.locator("input.yt-searchbox-input").fill(secondChannel);
      await scenarioPage.locator("input.yt-searchbox-input").press("Enter");
      await expect(scenarioPage).toHaveURL(/\/results\?/);
      const channelButton = search.topVideoChannelThumbnailButton(secondChannel);
      try {
        await channelButton.waitFor({ state: "visible", timeout: 20_000 });
      } catch (error) {
        if (error instanceof errors.TimeoutError && (await channelButton.count()) === 0) {
          return false;
        }
        throw error;
      }
      await channelButton.click();
      await expect(scenarioPage).toHaveURL(/youtube\.com\/@YouTube\/?$/i);
      const second = new YtChannelPage(secondChannel, scenarioPage, scenarioWatcher);
      await second.navigateToCategory("Videos", "soft", false);
      await expect(scenarioPage).toHaveURL(/youtube\.com\/@YouTube\/videos\/?$/i);

      const button = scenarioPage.locator(".play-all-btn");
      await expect(button).toHaveCount(1);
      await expect(button).toHaveText("Play All (Latest)");
      await expect(button).not.toHaveAttribute("href", firstHref!);
      const dropdown = scenarioPage.locator(".play-all-btns");
      await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
      await expect(dropdown.getByText("Videos (Latest)")).not.toHaveAttribute("href", firstHref!);
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
  await expect(page.locator(".play-all-btn.latest")).toBeVisible({ timeout: 30_000 });
  const [videoId] = await channel.getTopVideoIds(1);
  expect(videoId).toBeTruthy();

  await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
    waitUntil: "domcontentloaded",
  });
  // Mobile watch pages use ytm-watch instead of the desktop ytd-watch-flexy
  await expect(page.locator("ytd-watch-flexy, ytm-watch")).toBeAttached({ timeout: 30_000 });
  await expect(page.locator(".play-all-btn, .play-all-btns")).toHaveCount(0);
});
