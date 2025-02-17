import { defineUnlistedScript } from "wxt/sandbox";

import Playlist from "./playlist";

export default defineUnlistedScript(main);

function main() {
  const observer = new MutationObserver(ensurePlayAllButton);

  const style = document.createElement("style");
  style.textContent = `
    .play-all-btn {
      background-color: #8000FF;
      color: #F1F1F1;

      height: 32px;
      min-width: 12px;

      display: inline-flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      margin-left: 12px;

      border-radius: 8px;
      padding: 0 12px;

      font-family: 'Roboto', 'Arial', sans-serif;
      font-size: 1.4rem;
      font-weight: 500;
      text-decoration: none;

      cursor: pointer;
    }

    .play-all-btn:hover,
    .play-all-btn:focus {
      background-color:#9B33FF;
    }
  `;
  document.head.appendChild(style);

  // Triggered when navigating to the videos, shorts, or streams page
  window.addEventListener("yt-navigate-finish", () => {
    const pageKind = window.location.pathname.split("/").at(-1) ?? "";
    if (pageKind === "videos" || pageKind === "shorts" || pageKind === "streams") {
      observer.disconnect();

      ensurePlayAllButton();

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

function ensurePlayAllButton() {
  if (!document.querySelector(".play-all-btn")) {
    addPlayAllButton();
  }
}

function addPlayAllButton() {
  const playlist = new Playlist();

  const playAllButton = document.createElement("a");
  playAllButton.classList.add("play-all-btn");
  playAllButton.href = playlist.path;
  playAllButton.textContent = `Play All (${playlist.sortKind})`;

  const buttonHolder = document.querySelector("#primary #header #chips")!;
  buttonHolder.appendChild(playAllButton);
}
