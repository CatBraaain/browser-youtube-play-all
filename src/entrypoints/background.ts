import { browser } from "wxt/browser";
import { defineBackground } from "wxt/sandbox";

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  // chrome.runtime.onInstalled.addListener(async () => {
  //   const tabs = await chrome.tabs.query({
  //     url: ["http://*/*", "https://*/*"],
  //   });
  //   tabs
  //     .filter(tab => tab.id)
  //     .forEach(tab => {
  //       chrome.scripting.executeScript({
  //         files: ["dist/content-script.js"],
  //         target: { tabId: tab.id! },
  //         world: "MAIN",
  //       });
  //     });
  // });
});
