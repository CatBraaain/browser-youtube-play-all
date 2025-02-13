import { defineUnlistedScript } from "wxt/sandbox";

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
    const videoKind = window.location.pathname.split("/").at(-1) ?? "";
    if (videoKind === "videos" || videoKind === "shorts" || videoKind === "streams") {
      observer.disconnect();

      ensurePlayAllButton();

      // Callback will be triggered when changing the sort to newest/popular
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
  const playAllUrl = getPlayListPath();

  const playAllButton = document.createElement("a");
  playAllButton.classList.add("play-all-btn");
  playAllButton.href = playAllUrl;
  playAllButton.textContent = `Play All (${getSortKind()})`;

  const buttonHolder = document.querySelector("#primary #header #chips")!;
  buttonHolder.appendChild(playAllButton);
}

function getChannelId() {
  return document
    .querySelector<HTMLLinkElement>("link[rel='canonical']")!
    .href.split("/")
    .at(-1)!
    .substring(2);
}

function getPlayListPath(): string {
  const sortKind = getSortKind();
  const videoKind = getVideoKind();

  if (sortKind === "Oldest") {
    const oldestVideoHref = document.querySelector<HTMLLinkElement>(
      "#thumbnail[href^='/watch?v=']",
    )!.href;
    return oldestVideoHref + "&list=ULcxqQ59vzyTk";
  } else {
    const playlistPrefix = getPlayListPrefix(videoKind, sortKind);
    const channelId = getChannelId();
    return `/playlist?list=${playlistPrefix}${channelId}&playnext=1`;
  }
}

function getSortKind(): SortKind {
  const selectedButton = document.querySelector("#primary #header #chips>[selected]")!;
  const index = selectedButton
    ? Array.from(selectedButton.parentNode?.children ?? []).indexOf(selectedButton)
    : 0;
  switch (index) {
    case 0:
      return "Newest";
    case 1:
      return "Popular";
    case 2:
      return "Oldest";
    default:
      return "Newest";
  }
}

function getVideoKind(): VideoKind {
  const videoKind = window.location.pathname.split("/").at(-1);
  switch (videoKind) {
    case "videos":
      return "Videos";
    case "shorts":
      return "Shorts";
    case "streams":
      return "Streams";
    default:
      return "Videos";
  }
}

function getPlayListPrefix(videoKind: VideoKind, sortKind: SortKind): string {
  switch (true) {
    case videoKind === "Videos" && sortKind === "Newest":
      return "UULF";
    case videoKind === "Videos" && sortKind === "Popular":
      return "UULP";
    case videoKind === "Shorts" && sortKind === "Newest":
      return "UUSH";
    case videoKind === "Shorts" && sortKind === "Popular":
      return "UUPS";
    case videoKind === "Streams" && sortKind === "Newest":
      return "UULV";
    case videoKind === "Streams" && sortKind === "Popular":
      return "UUPV";
    default:
      return "UU";
  }
}

type VideoKind = "Videos" | "Shorts" | "Streams";
type SortKind = "Newest" | "Popular" | "Oldest";
