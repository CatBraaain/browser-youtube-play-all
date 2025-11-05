import { expect, test } from "@playwright/test";
import { ytTest } from "../fixture";
import { YtSearchPage } from "../utils";

type ChannelIdTestCase = {
  navigation: "soft1" | "soft2" | "hard";
  existsOnHtml: boolean;
  existsOnEvent: boolean;
};

const searchWords = ["music", "game"];
const channelIdTestCases: ChannelIdTestCase[] = [
  {
    navigation: "soft1",
    existsOnHtml: true,
    existsOnEvent: true,
  },
  {
    navigation: "soft2",
    existsOnHtml: false,
    existsOnEvent: true,
  },
  {
    navigation: "hard",
    existsOnHtml: true,
    existsOnEvent: true,
  },
];

searchWords.forEach((searchWord) => {
  channelIdTestCases.forEach(({ navigation, existsOnHtml, existsOnEvent }) => {
    ytTest(
      `channelId: ${navigation} from ${searchWord}`,
      async ({ page, eventWatcher, channelIdFinder }) => {
        const ytSearchPage = new YtSearchPage(page, eventWatcher);
        await ytSearchPage.search(searchWord);
        await ytSearchPage.navigateToTopChannel(navigation);

        await channelIdFinder.expectNavigationEvent(existsOnEvent);
        await channelIdFinder.expectCanonicalLink(existsOnHtml);
        await channelIdFinder.expectYtInitialData(existsOnHtml);
        await channelIdFinder.expectYtCommand(existsOnHtml);
      },
    );
  });
});

const youtubeChannels = ["@Google", "@Apple", "@Microsoft"];
youtubeChannels.forEach((channelName) => {
  test(`channelId: fetch from ${channelName}`, async ({ browserName }) => {
    if (browserName !== "chromium") return;
    const res = await fetch(`https://www.youtube.com/${channelName}`);
    const html = await res.text();
    const match = html.match(/<link rel="canonical" href="(.*?)"/i);
    const canonical = match![1];
    const channelId = canonical.split("/").at(-1)!;
    expect(channelId).toEqual(expect.stringMatching(/UC.*/));
  });
});
