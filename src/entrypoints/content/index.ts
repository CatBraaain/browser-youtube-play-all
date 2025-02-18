import { defineContentScript } from "wxt/sandbox";

import Page from "./page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_end",
  main,
});

function main() {
  Page.applyStyleForPlayAllButton();

  let page = new Page("");
  let observer: MutationObserver | null = null;

  // Triggered when navigating to the videos, shorts, or streams page
  window.addEventListener("yt-navigate-finish", (e: any) => {
    if (!page.isOnSupportedPage) {
      return;
    }

    const channelId = e.detail.endpoint.browseEndpoint.browseId.slice(2);
    if (page.channelId !== channelId) {
      page = new Page(channelId);
      observer?.disconnect();
    }

    observer = new MutationObserver(() => {
      if (page.isOnSupportedPage) {
        page.ensurePlayAllButton(channelId);
      }
    });

    observer.disconnect();

    page.ensurePlayAllButton(channelId);

    // Callback will be triggered when changing the sort to latest/popular/oldest
    const buttonHolder = document.querySelector("#primary #header #chips")!;
    observer.observe(buttonHolder, {
      subtree: true,
      childList: false,
      attributes: true,
    });
  });
}
