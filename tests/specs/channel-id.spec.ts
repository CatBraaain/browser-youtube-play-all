import { ytTest } from "../utils";

type ChannelIdTestCase = {
  channelButtonSelector: string;
  existsOnHtml: boolean;
  existsOnEvent: boolean;
};

const searchWords = ["music", "game"];

searchWords.forEach((searchWord, i) => {
  const channelIdTestCases: ChannelIdTestCase[] = [
    {
      channelButtonSelector: "#channel-info #channel-name",
      existsOnHtml: false,
      existsOnEvent: true,
    },
    {
      channelButtonSelector: "#channel-thumbnail", // [href^="/channel/"] or [href^="link:///"]
      existsOnHtml: true,
      existsOnEvent: true,
    },
  ];
  channelIdTestCases.forEach((channelIdTestCase, j) => {
    const { channelButtonSelector, existsOnHtml, existsOnEvent } =
      channelIdTestCase;
    ytTest(
      `channelId: soft navigation ${i}-${j}`,
      async ({ page, eventWatcher, channelIdFinder }) => {
        await page.goto(
          `https://www.youtube.com/results?search_query=${searchWord}`,
        );
        await eventWatcher.waitForFired("yt-navigate-finish");

        await page.locator(channelButtonSelector).first().click();
        await eventWatcher.waitForFired("yt-navigate-finish");

        await channelIdFinder.exceptFromNavigationEvent(existsOnEvent);
        await channelIdFinder.exceptFromCanonicalLink(existsOnHtml);
        await channelIdFinder.exceptFromYtInitialData(existsOnHtml);
        await channelIdFinder.exceptFromYtCommand(existsOnHtml);
      },
    );
  });
});

searchWords.forEach((searchWord, i) => {
  const channelIdTestCases: ChannelIdTestCase[] = [
    {
      channelButtonSelector: "#channel-info #channel-name [href]",
      existsOnHtml: true,
      existsOnEvent: true,
    },
    {
      channelButtonSelector: "#channel-thumbnail", // [href^="/channel/"] or [href^="link:///"]
      existsOnHtml: true,
      existsOnEvent: true,
    },
  ];
  channelIdTestCases.forEach((channelIdTestCase, j) => {
    const { channelButtonSelector, existsOnHtml, existsOnEvent } =
      channelIdTestCase;
    ytTest(
      `channelId: hard navigation ${i}-${j}`,
      async ({ page, eventWatcher, channelIdFinder }) => {
        await page.goto(
          `https://www.youtube.com/results?search_query=${searchWord}`,
        );
        await eventWatcher.waitForFired("yt-navigate-finish");

        const url = await page
          .locator(channelButtonSelector)
          .first()
          .getAttribute("href");
        await page.goto(`https://www.youtube.com${url}`);
        await eventWatcher.waitForFired("yt-navigate-finish");

        await channelIdFinder.exceptFromNavigationEvent(existsOnEvent);
        await channelIdFinder.exceptFromCanonicalLink(existsOnHtml);
        await channelIdFinder.exceptFromYtInitialData(existsOnHtml);
        await channelIdFinder.exceptFromYtCommand(existsOnHtml);
      },
    );
  });
});
