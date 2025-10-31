import { ytTest } from "../fixture";
import { YtChannelPage } from "../utils";

type EventTestCase = {
  navigation: "soft" | "hard";
  ytNavigateStartFired: boolean;
  ytNavigateFinishFired: boolean;
};

const youtubeChannels = ["@TaylorSwift", "@MrBeast", "@BBCNews"];
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
          const ytChannelPage = new YtChannelPage(page, eventWatcher);
          await ytChannelPage.visit(channelName);
          await ytChannelPage.navigateToVideoTab(navigation, false);

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
