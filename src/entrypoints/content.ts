import { injectScript } from "wxt/client";
import { defineContentScript } from "wxt/sandbox";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_start",
  async main() {
    await injectScript("/injection.js", {
      keepInDom: true,
    });
  },
});
