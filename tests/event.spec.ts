import { ytTest } from "./utils";

const youtubeChannels = ["@TaylorSwift", "@MrBeast", "@BBCNews"];
youtubeChannels.forEach((channelName, i) => {
  ytTest(`event: soft navigation ${i}`, async ({ page, eventWatcher }) => {
    await page.goto(`https://www.youtube.com/${channelName}`);

    const videoTabButton = page.locator('[role="tablist"] [role="tab"]').nth(1);
    await videoTabButton.click();
    await eventWatcher.expect({
      eventName: "yt-navigate-start",
      fired: true,
    });
    await eventWatcher.expect({
      eventName: "yt-navigate-finish",
      fired: true,
    });
  });

  ytTest(`event: hard navigation ${i}`, async ({ page, eventWatcher }) => {
    await page.goto(`https://www.youtube.com/${channelName}/videos`);
    await eventWatcher.expect({
      eventName: "yt-navigate-finish",
      fired: true,
    });
    await eventWatcher.expect({
      eventName: "yt-navigate-start",
      fired: false,
      timeout: 0,
    });
  });
});
