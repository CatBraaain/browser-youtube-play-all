import { defineContentScript } from "#imports";
import { CategoryTab } from "./category-tab";
import { ChannelPage } from "./channel-page";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_end",
  main: onYoutubeActivated,
});

async function onYoutubeActivated() {
  YoutubePage.addStyleForPlayAllButton();
  if (ChannelPage.isChannelPage && CategoryTab.isCategoryTab) {
    await CategoryTab.mount();
  }

  window.addEventListener(YoutubePage.NavigationEndEvent, async () => {
    if (ChannelPage.isChannelPage && CategoryTab.isCategoryTab) {
      await CategoryTab.mount();
    }
  });
}
