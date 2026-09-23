import { expect } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { ytxTest } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

const firstChannel = "@Microsoft";
const secondChannel = "@YouTube";

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
    let releaseOldest!: () => void;
    const oldestGate = new Promise<void>((resolve) => {
      releaseOldest = resolve;
    });
    await page.route("**/playlist?list=UULF*", async (route) => {
      await oldestGate;
      await route.continue();
    });

    try {
      const oldestRequest = page.waitForRequest((request) =>
        request.url().includes("/playlist?list=UULF"),
      );
      const channel = new YtChannelPage(firstChannel, page, eventWatcher);
      await channel.navigateToCategory("Videos", "hard", false);
      await oldestRequest;
      await expect(page.locator(".play-all-btn.latest")).toBeVisible({ timeout: 30_000 });

      await channel.navigateToSort("Oldest");
      await channel.navigateToSort("Latest");
      await channel.navigateToSort("Popular");
      await expect(page.locator(YoutubeDOM.SORT_BUTTON).nth(1)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator(".play-all-btn.popular")).toHaveText("Play All (Popular)");

      const oldestResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/playlist?list=UULF") && response.url().includes("&index="),
      );
      releaseOldest();
      await oldestResponse;
      // Allow the content script to consume the completed playlist request before checking the UI.
      await page.waitForTimeout(500);
      await expect(page.locator(".play-all-btn")).toHaveCount(1);
      await expect(page.locator(".play-all-btn")).toHaveText("Play All (Popular)");
    } finally {
      releaseOldest();
    }
  },
);

ytxTest(
  "shows an (error) button without href when the playlist resolution fails",
  async ({ page, eventWatcher }) => {
    // Videos + Oldest is the only resolution backed by /playlist?list=UULF... fetches;
    // aborting them injects a resolution failure for that condition alone.
    await page.route("**/playlist?list=UULF*", (route) => route.abort());

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
  async ({ page, eventWatcher }) => {
    const first = new YtChannelPage(firstChannel, page, eventWatcher);
    await first.navigateToCategory("Videos", "hard", false);
    const firstHref = await page.locator(".play-all-btn.latest").getAttribute("href");
    expect(firstHref).toBeTruthy();

    const search = new YtSearchPage(page, eventWatcher);
    await page.locator("input.yt-searchbox-input").fill(secondChannel);
    await page.locator("input.yt-searchbox-input").press("Enter");
    await search.topVideoChannelThumbnailButton(secondChannel).click();
    await expect(page).toHaveURL(/youtube\.com\/@YouTube\/?$/i);
    const second = new YtChannelPage(secondChannel, page, eventWatcher);
    await second.navigateToCategory("Videos", "soft", false);
    await expect(page).toHaveURL(/youtube\.com\/@YouTube\/videos\/?$/i);

    const button = page.locator(".play-all-btn");
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText("Play All (Latest)");
    await expect(button).not.toHaveAttribute("href", firstHref!);
    const dropdown = page.locator(".play-all-btns");
    await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
    await expect(dropdown.getByText("Videos (Latest)")).not.toHaveAttribute("href", firstHref!);
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
  await expect(page.locator("ytd-watch-flexy")).toBeAttached();
  await expect(page.locator(".play-all-btn, .play-all-btns")).toHaveCount(0);
});
