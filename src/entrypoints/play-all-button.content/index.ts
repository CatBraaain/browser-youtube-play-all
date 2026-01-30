import { defineContentScript } from "#imports";
import { CategoryPage } from "./category-page";
import { ChannelPage } from "./channel-page";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_end",
  main: onYoutubeActivated,
});

async function onYoutubeActivated() {
  YoutubePage.addStyleForPlayAllButton();
  if (ChannelPage.isChannelPage && CategoryPage.isCategoryPage) {
    await CategoryPage.mount();
  }

  window.addEventListener(YoutubePage.NavigationEndEvent, async () => {
    if (ChannelPage.isChannelPage && CategoryPage.isCategoryPage) {
      await CategoryPage.mount();
    }
  });
}
