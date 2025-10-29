import { defineContentScript } from "#imports";
import ChannelPage from "./channel-page";
import YoutubePage from "./youtube-page";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_end",
  main,
});

async function main() {
  YoutubePage.applyStyleForPlayAllButton();

  if (ChannelPage.isOnSupportedPage) {
    const res = await fetch(window.location.href);
    const html = await res.text();
    const match = html.match(/<link rel="canonical" href="(.*?)"/i);
    const canonical = match![1];
    const channelId = canonical.split("/").at(-1)!;

    const channelPage = new ChannelPage(channelId);
    channelPage.ensurePlayAllButton();
  }

  // Triggered when navigating to the videos, shorts, or streams page
  window.addEventListener("yt-navigate-finish", (e: any) => {
    if (!ChannelPage.isOnSupportedPage) {
      return;
    }

    const channelId = e.detail.endpoint.browseEndpoint.browseId;
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
