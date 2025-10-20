import { test as baseTest } from "@playwright/test";
import { EventWatcher } from "./utils";

const test = baseTest.extend<{ eventWatcher: EventWatcher }>({
  eventWatcher: async ({ page }, use) => {
    const eventWatcher = new EventWatcher(page);
    await eventWatcher.setInitScript("yt-navigate-start");
    await eventWatcher.setInitScript("yt-navigate-finish");

    await use(eventWatcher);
  },
});

const youtubeChannels = ["@TaylorSwift", "@MrBeast", "@BBCNews"];
youtubeChannels.forEach((channelName, i) => {
  test(`soft navigation ${i}: event fired`, async ({ page, eventWatcher }) => {
    await page.goto(`https://www.youtube.com/${channelName}`);

    const videoTabButton = page.locator('[role="tablist"] [role="tab"]').nth(1);
    await videoTabButton.click();
    await eventWatcher.expectFired("yt-navigate-start");

    await page.waitForURL(`https://www.youtube.com/${channelName}/videos`);
    await eventWatcher.expectFired("yt-navigate-finish");
  });

  test(`hard navigation ${i}: event fired`, async ({ page, eventWatcher }) => {
    await page.goto(`https://www.youtube.com/${channelName}/videos`);
    await eventWatcher.expectFired("yt-navigate-finish");
    await eventWatcher.expectNotFired("yt-navigate-start", 0);
  });
});
