import { defineContentScript } from "#imports";
import type { Channel } from "./channel";
import { YoutubeDOM } from "./youtube-dom";
import { setHooks, YTX_EVENTS, ytxEventEmitter } from "./youtube-hooks";

import "./play-all-button.css";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_end",
  main,
});

function main() {
  setHooks();

  [
    YTX_EVENTS.CATEGORY_ENTER,
    YTX_EVENTS.SORT_CHANGED,
    YTX_EVENTS.SORT_RERENDERED,
  ].forEach((e) => {
    ytxEventEmitter.on(e, async (channel) => {
      await maybeRenderButton(channel);
    });
  });
  ytxEventEmitter.on(YTX_EVENTS.CATEGORY_ENTER, async (channel) => {
    await maybeRenderButton(channel);
  });
  ytxEventEmitter.on(YTX_EVENTS.SORT_CHANGED, async (channel) => {
    await maybeRenderButton(channel);
  });
  ytxEventEmitter.on(YTX_EVENTS.SORT_RERENDERED, async (channel) => {
    await maybeRenderButton(channel);
  });
}

async function maybeRenderButton(channel: Channel) {
  const sortButtonHolder = YoutubeDOM.sortButtonHolder;
  if (!sortButtonHolder) {
    return;
  }

  const categoryKind = YoutubeDOM.categoryKind;
  if (!categoryKind) {
    return;
  }

  const sortKind = YoutubeDOM.sortKind ?? "Latest";

  const playAllButton = document.createElement("a");
  playAllButton.classList.add("play-all-btn");
  playAllButton.classList.add(categoryKind.toLowerCase());
  playAllButton.classList.add(sortKind.toLowerCase());
  playAllButton.href = await channel.getPlaylistPath(categoryKind, sortKind);
  playAllButton.textContent = `Play All (${sortKind})`;

  const targetPlayAllButton = document.querySelector(
    `.play-all-btn.${categoryKind.toLowerCase()}.${sortKind.toLowerCase()}`,
  );
  if (!targetPlayAllButton) {
    document.querySelector(".play-all-btn")?.remove();
    YoutubeDOM.sortButtonHolder!.appendChild(playAllButton);
  }
}
