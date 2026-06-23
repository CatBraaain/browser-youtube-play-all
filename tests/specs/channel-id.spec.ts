import { expect, test } from "@playwright/test";

import { ytTest } from "../fixture";
import { YtSearchPage } from "../utils";

type SearchTestCase = {
  navigation: "soft" | "hard";
  searchWord: string;
};
type ChannelIdTestCase = {
  navigation: "soft1" | "soft2" | "hard";
  existsOnNavigationEnd: boolean | null;
  existsOnCanonicalLink: boolean | null;
  existsOnYtInitialData: boolean | null;
  existsOnYtCommand: boolean | null;
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
    existsOnNavigationEnd: true,
    existsOnCanonicalLink: true,
    existsOnYtInitialData: true,
    existsOnYtCommand: true,
  },
  {
    navigation: "soft2",
    existsOnNavigationEnd: true,
    existsOnCanonicalLink: null, // sometimes exists
    existsOnYtInitialData: false,
    existsOnYtCommand: false,
  },
  {
    navigation: "hard",
    existsOnNavigationEnd: true,
    existsOnCanonicalLink: true,
    existsOnYtInitialData: true,
    existsOnYtCommand: true,
  },
];

searchTestCases.forEach(({ navigation: searchNavigation, searchWord }) => {
  channelIdTestCases.forEach(
    ({
      navigation: channelNavigation,
      existsOnNavigationEnd,
      existsOnCanonicalLink,
      existsOnYtInitialData,
      existsOnYtCommand,
    }) => {
      ytTest(
        `channelId: ${channelNavigation} from ${searchWord}`,
        async ({ page, eventWatcher, channelIdFinder, isMobile }) => {
          ytTest.skip(isMobile, "skip mobile device");

          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          await ytSearchPage.search(searchWord, searchNavigation);
          await ytSearchPage.navigateToChannel(null, channelNavigation);

          await channelIdFinder.expectNavigationEndEvent(existsOnNavigationEnd);
          await channelIdFinder.expectCanonicalLink(existsOnCanonicalLink);
          await channelIdFinder.expectYtInitialData(existsOnYtInitialData);
          await channelIdFinder.expectYtCommand(existsOnYtCommand);
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
