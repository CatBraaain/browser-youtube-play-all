import { expect, test } from "@playwright/test";
import { ytTest } from "../fixture";
import { YtSearchPage } from "../utils";

type SearchTestCase = {
  navigation: "soft" | "hard";
  searchWord: string;
};
type ChannelIdTestCase = {
  navigation: "soft1" | "soft2" | "hard";
  existsOnHtml: boolean;
  existsOnEvent: boolean;
};

const searchTestCases: SearchTestCase[] = [
  {
    navigation: "soft",
    searchWord: "music",
  },
  {
    navigation: "hard",
    searchWord: "game",
  },
];
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

searchTestCases.forEach(({ navigation: searchNavigation, searchWord }) => {
  channelIdTestCases.forEach(
    ({ navigation: channelNavigation, existsOnHtml, existsOnEvent }) => {
      ytTest(
        `channelId: ${channelNavigation} from ${searchWord}`,
        async ({ page, eventWatcher, channelIdFinder }) => {
          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          await ytSearchPage.search(searchWord, searchNavigation);
          await ytSearchPage.navigateToChannel(null, channelNavigation);

          await channelIdFinder.expectNavigationEndEvent(existsOnEvent);
          await channelIdFinder.expectCanonicalLink(existsOnHtml);
          await channelIdFinder.expectYtInitialData(existsOnHtml);
          await channelIdFinder.expectYtCommand(existsOnHtml);
        },
      );
    },
  );
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
