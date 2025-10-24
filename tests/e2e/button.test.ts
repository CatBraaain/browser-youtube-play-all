import { expect } from "@playwright/test";
import { ytxTest } from "../utils";

const videoUrl = "https://www.youtube.com/watch?v=gu_PQBmk-6c";
const channelUrl = "https://www.youtube.com/@TED";

const channelButtonSelectors = ["#owner [href]", "#upload-info [href]"];
channelButtonSelectors.forEach((channelButtonSelector, j) => {
  ytxTest(`soft navigation ${j}`, async ({ page, eventWatcher }) => {
    await page.goto(videoUrl);
    await eventWatcher.waitForFired("yt-navigate-finish");

    const channelButton = page.locator(channelButtonSelector).first();
    channelButton.click();
    await eventWatcher.waitForFired("yt-navigate-finish");

    const videoTabButton = page.locator('[role="tablist"] [role="tab"]').nth(1);
    await videoTabButton.click();
    await eventWatcher.waitForFired("yt-navigate-finish");

    await expect(page.locator(".play-all-btn")).toBeAttached();
  });
});

ytxTest(`hard navigation`, async ({ page, eventWatcher }) => {
  await page.goto(channelUrl);
  await eventWatcher.waitForFired("yt-navigate-finish");

  const videoTabButton = page.locator('[role="tablist"] [role="tab"]').nth(1);
  await videoTabButton.click();
  await eventWatcher.waitForFired("yt-navigate-finish");

  await expect(page.locator(".play-all-btn")).toBeAttached();
});
