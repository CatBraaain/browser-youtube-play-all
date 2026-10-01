import { expect } from "@playwright/test";

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
    ({ navigation, expectNavigateStartEventFired, expectNavigateEndEventFired }) => {
      ytTest(
        `event: ${navigation} from ${channelName}`,
        async ({ page, eventWatcher }, testInfo) => {
          const ytSearchPage = new YtSearchPage(page, eventWatcher);
          await ytSearchPage.search(channelName, "hard");
          await ytSearchPage.navigateToChannel(channelName, "hard");

          const ytChannelPage = new YtChannelPage(channelName, page, eventWatcher);
          await ytChannelPage.navigateToCategory("Shorts", "hard");
          const ytPage = new YtPage(page, eventWatcher);
          const startSince = await eventWatcher.captureNavigationBaseline(
            ytPage.NavigationStartEvent,
          );
          const endSince = await eventWatcher.captureNavigationBaseline(ytPage.NavigationEndEvent);
          expect(new URL(page.url()).pathname.toLowerCase()).toBe(
            `/${channelName}/shorts`.toLowerCase(),
          );

          const urlBefore = page.url();
          await ytChannelPage.navigateToCategory("Videos", navigation, false);
          const afterAction = await page.evaluate(() => {
            const sync = (window as any).__ytSync;
            return {
              url: location.href,
              docId: sync.docId,
              events: Object.fromEntries(
                Object.entries(sync.events).map(([name, event]: [string, any]) => [
                  name,
                  { count: event.count, urls: event.urls },
                ]),
              ),
            };
          });
          await testInfo.attach("navigation-action", {
            body: JSON.stringify({ urlBefore, startSince, endSince, afterAction }, null, 2),
            contentType: "application/json",
          });

          await eventWatcher.expect({
            eventName: ytPage.NavigationEndEvent,
            fired: expectNavigateEndEventFired,
            since: endSince,
          });
          const after = await eventWatcher.captureNavigationBaseline();
          if (navigation === "soft") {
            expect(after.docId).toBe(endSince.docId);
          } else {
            expect(after.docId).not.toBe(endSince.docId);
          }
          await eventWatcher.expect({
            eventName: ytPage.NavigationStartEvent,
            fired: expectNavigateStartEventFired,
            since: startSince,
            timeout: 500,
          });
          expect(new URL(page.url()).pathname.toLowerCase()).toBe(
            `/${channelName}/videos`.toLowerCase(),
          );
        },
      );
    },
  );
});
