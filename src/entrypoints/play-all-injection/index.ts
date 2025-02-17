import { defineUnlistedScript } from "wxt/sandbox";

import Page from "./page";

export default defineUnlistedScript(main);

function main() {
  Page.applyStyleForPlayAllButton();

  const observer = new MutationObserver(() => {
    if (Page.isOnSupportedPage) {
      Page.ensurePlayAllButton();
    }
  });

  // Triggered when navigating to the videos, shorts, or streams page
  window.addEventListener("yt-navigate-finish", () => {
    if (Page.isOnSupportedPage) {
      observer.disconnect();

      Page.ensurePlayAllButton();

      // Callback will be triggered when changing the sort to latest/popular/oldest
      const buttonHolder = document.querySelector("#primary #header #chips")!;
      observer.observe(buttonHolder, {
        subtree: true,
        childList: false,
        attributes: true,
      });
    }
  });
}
