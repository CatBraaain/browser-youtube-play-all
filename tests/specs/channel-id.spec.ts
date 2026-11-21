import { expect, test } from "@playwright/test";

import { ytTest } from "../fixture";
import {
  YtSearchPage,
  attachSearchResultsEvidence,
  SEARCH_REDRAW_ATTEMPTS,
  type SearchResultsShape,
} from "../utils";

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
        async ({ page, eventWatcher, channelIdFinder, isMobile }, testInfo) => {
          ytTest.skip(isMobile, "skip mobile device");

          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          if (channelNavigation === "hard") {
            // The hard route navigates by URL and works on both shapes.
            await ytSearchPage.search(searchWord, searchNavigation);
            await ytSearchPage.navigateToChannel(null, channelNavigation);
          } else {
            // Soft routes need a legacy SPA target; redraw the search and skip
            // with evidence when every draw lands on lockup rows (YT-SPEC.md).
            const target =
              channelNavigation === "soft2"
                ? ytSearchPage.topVideoChannelNameButton()
                : ytSearchPage.topVideoChannelThumbnailButton();
            let shape: SearchResultsShape = "none";
            for (let attempt = 0; attempt < SEARCH_REDRAW_ATTEMPTS; attempt++) {
              await ytSearchPage.search(searchWord, searchNavigation);
              shape = await ytSearchPage.waitForChannelTarget(target);
              if (shape !== "lockup") break;
            }
            if (shape === "lockup") {
              await attachSearchResultsEvidence(testInfo, page, shape);
              testInfo.skip(
                true,
                "YouTube served only lockup-shaped search results, whose channel links navigate by full page load; they offer no soft navigation target to a channel (YT-SPEC.md)",
              );
            }
            if (shape === "none") {
              throw new Error(
                `The search results rendered no channel target for the soft navigation. Results URL: ${page.url()}`,
              );
            }
            await ytSearchPage.navigateToChannel(null, channelNavigation);
          }

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
    const canonical = match![1]!;
    const channelId = canonical.split("/").at(-1)!;
    expect(channelId).toEqual(expect.stringMatching(/UC.*/));
  });
});
