import { ytTest } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

type EventTestCase = {
  navigation: "soft" | "hard";
  ytNavigateStartFired: boolean;
  ytNavigateFinishFired: boolean;
};

const youtubeChannels = ["@Google", "@Apple"];
const eventTestCases: EventTestCase[] = [
  {
    navigation: "soft",
    ytNavigateStartFired: true,
    ytNavigateFinishFired: true,
  },
  {
    navigation: "hard",
    ytNavigateStartFired: false,
    ytNavigateFinishFired: true,
  },
];

youtubeChannels.forEach((channelName) => {
  eventTestCases.forEach(
    ({ navigation, ytNavigateStartFired, ytNavigateFinishFired }) => {
      ytTest(
        `event: ${navigation} from ${channelName}`,
        async ({ page, eventWatcher }) => {
          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          await ytSearchPage.search(channelName, "hard");
          await ytSearchPage.navigateToChannel(channelName, "hard");

          const ytChannelPage = new YtChannelPage(
            channelName,
            page,
            eventWatcher,
          );
          await ytChannelPage.navigateToCategory("Videos", navigation, false);

          await eventWatcher.expect({
            eventName: "yt-navigate-finish",
            fired: ytNavigateFinishFired,
          });
          await eventWatcher.expect({
            eventName: "yt-navigate-start",
            fired: ytNavigateStartFired,
            timeout: 500,
          });
        },
      );
    },
  );
});
