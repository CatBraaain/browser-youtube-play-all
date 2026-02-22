import { ytTest } from "../fixture";
import { YtChannelPage, YtPage, YtSearchPage } from "../utils";

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

          const ytPage = new YtPage(page, eventWatcher);
          await eventWatcher.expect({
            eventName: ytPage.NavigationEndEvent,
            fired: expectNavigateEndEventFired,
          });
          await eventWatcher.expect({
            eventName: ytPage.NavigationStartEvent,
            fired: expectNavigateStartEventFired,
            timeout: 500,
          });
        },
      );
    },
  );
});
