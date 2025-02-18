import { defineContentScript } from "wxt/sandbox";

import ChannelPage from "./channel-page";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_end",
  main,
});

function main() {
  YoutubePage.applyStyleForPlayAllButton();

  // Triggered when navigating to the videos, shorts, or streams page
  window.addEventListener("yt-navigate-finish", (e: any) => {
    if (!ChannelPage.isOnSupportedPage) {
      return;
    }

    const channelId = e.detail.endpoint.browseEndpoint.browseId.slice(2);
    const channelPage = new ChannelPage(channelId);
    channelPage.ensurePlayAllButton();

    const observer = new MutationObserver(() => {
      if (ChannelPage.isOnSupportedPage) {
        channelPage.ensurePlayAllButton();
      }
    });

    // Callback will be triggered when changing the sort to latest/popular/oldest
    const buttonHolder = document.querySelector("#primary #header #chips")!;
    observer.observe(buttonHolder, {
      subtree: true,
      childList: false,
      attributes: true,
    });

    // Triggered when navigating to the videos, shorts, or streams page
    window.addEventListener(
      "yt-navigate-start",
      () => {
        observer.disconnect();
      },
      { once: true },
    );
  });
}
