import { ytTest } from "../fixture";
import { YtChannelPage, YtSearchPage } from "../utils";

type EventTestCase = {
  navigation: "soft" | "hard";
  expectNavigateStartEventFired: boolean;
  expectNavigateEndEventFired: boolean;
};

const youtubeChannels = ["@Google", "@Apple"];
const eventTestCases: EventTestCase[] = [
  {
    navigation: "soft",
    expectNavigateStartEventFired: true,
    expectNavigateEndEventFired: true,
  },
  {
    navigation: "hard",
    expectNavigateStartEventFired: false,
    expectNavigateEndEventFired: true,
  },
];

youtubeChannels.forEach((channelName) => {
  eventTestCases.forEach(
    ({
      navigation,
      expectNavigateStartEventFired,
      expectNavigateEndEventFired,
    }) => {
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
            fired: expectNavigateEndEventFired,
          });
          await eventWatcher.expect({
            eventName: "yt-navigate-start",
            fired: expectNavigateStartEventFired,
            timeout: 500,
          });
        },
      );
    },
  );
});
