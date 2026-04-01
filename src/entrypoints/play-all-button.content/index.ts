import { defineContentScript } from "#imports";
import { logger } from "../../logger";
import { CategoryTab } from "./category-tab";
import { fetchChannelId } from "./youtube-api";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_end",
  main: onYoutubeActivated,
});

async function onYoutubeActivated() {
  YoutubePage.addStyleForPlayAllButton();

  const channelId = await fetchChannelId(window.location.href);
  if (channelId) {
    if (CategoryTab.isCategoryTab) {
      await CategoryTab.mount(channelId);
    }
  }

  window.addEventListener(YoutubePage.NavigationEndEvent, async () => {
    logger.info("onYoutubeActivated()", "NavigationEndEvent fired");

    const channelId = await fetchChannelId(window.location.href);
    if (channelId) {
      if (CategoryTab.isCategoryTab) {
        await CategoryTab.mount(channelId);
      }
    }
  });
}
