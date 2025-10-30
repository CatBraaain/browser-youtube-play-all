import { defineContentScript } from "#imports";
import { CategoryPage } from "./category-page";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_end",
  main: onYoutubeActivated,
});

async function onYoutubeActivated() {
  YoutubePage.addStyleForPlayAllButton();
  if (CategoryPage.isCategoryPage) {
    await CategoryPage.mount();
  }

  window.addEventListener("yt-navigate-finish", async () => {
    if (CategoryPage.isCategoryPage) {
      await CategoryPage.mount();
    }
  });
}
