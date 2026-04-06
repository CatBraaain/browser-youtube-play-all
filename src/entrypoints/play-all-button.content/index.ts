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

  ytxEventEmitter.on(YTX_EVENTS.CHANNEL_ENTER, async (channel) => {
    await renderDropdown(channel);
  });
  [
    YTX_EVENTS.CATEGORY_ENTER,
    YTX_EVENTS.SORT_CHANGED,
    YTX_EVENTS.SORT_RERENDERED,
  ].forEach((e) => {
    ytxEventEmitter.on(e, async (channel) => {
      await maybeRenderButton(channel);
    });
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

async function renderDropdown(channel: Channel) {
  if (document.querySelector("yt-flexible-actions-view-model .play-all-btns")) {
    return;
  }

  const container = document.createElement("div");
  container.className = "play-all-btns";

  const button = document.createElement("button");
  button.textContent = "Play All Buttons ▼";

  const menu = document.createElement("div");
  menu.className = "hidden";

  for (const categoryKind of YoutubeDOM.categories) {
    for (const sortKind of YoutubeDOM.sorts) {
      const href = await channel.getPlaylistPath(categoryKind, sortKind);
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = `${categoryKind} (${sortKind})`;
        menu.appendChild(a);
      }
    }
  }

  container.append(button, menu);

  document
    .querySelector("yt-flexible-actions-view-model")
    ?.appendChild(container);

  let isOpen = false;
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    menu.classList.toggle("hidden", !isOpen);
  });
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  document.addEventListener("click", () => {
    isOpen = false;
    menu.classList.add("hidden");
  });
}
