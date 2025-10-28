import { YtSearchPage, ytTest } from "../utils";

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

        await channelIdFinder.exceptFromNavigationEvent(existsOnEvent);
        await channelIdFinder.exceptFromCanonicalLink(existsOnHtml);
        await channelIdFinder.exceptFromYtInitialData(existsOnHtml);
        await channelIdFinder.exceptFromYtCommand(existsOnHtml);
      },
    );
  });
});
