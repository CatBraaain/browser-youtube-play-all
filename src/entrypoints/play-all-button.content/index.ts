import { defineContentScript } from "#imports";
import { logger } from "../../logger";
import { CategoryTab } from "./category-tab";
import { ChannelPage } from "./channel-page";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_end",
  main: onYoutubeActivated,
});

async function onYoutubeActivated() {
  YoutubePage.addStyleForPlayAllButton();
  if (ChannelPage.isChannelPage && CategoryTab.isCategoryTab) {
    await CategoryTab.mount();
  }

  window.addEventListener(YoutubePage.NavigationEndEvent, async () => {
    logger.info("onYoutubeActivated()", "NavigationEndEvent fired");
    if (ChannelPage.isChannelPage && CategoryTab.isCategoryTab) {
      await CategoryTab.mount();
    }
  });
}
