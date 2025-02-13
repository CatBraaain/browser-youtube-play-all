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
  const buttonLabel = "Play All";

  const playAllButton = document.createElement("a");
  playAllButton.classList.add("play-all-btn");
  playAllButton.href = playAllUrl;
  playAllButton.textContent = buttonLabel;

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
  const playlistPrefix = getPlayListPrefix(videoKind, sortKind);

  const channelId = getChannelId();

  return `/playlist?list=${playlistPrefix}${channelId}&playnext=1`;
}

function getSortKind(): SortKind {
  const selectedButton = document.querySelector("#primary #header #chips>[selected]")!;
  const index = selectedButton
    ? Array.from(selectedButton.parentNode?.children ?? []).indexOf(selectedButton)
    : 0;
  switch (index) {
    case 0:
      return "newest";
    case 1:
      return "popular";
    case 2:
      return "oldest";
    default:
      return "newest";
  }
}

function getVideoKind(): VideoKind {
  const videoKind = window.location.pathname.split("/").at(-1);
  if (videoKind === "videos" || videoKind === "shorts" || videoKind === "streams") {
    return videoKind;
  } else {
    return "videos";
  }
}

function getPlayListPrefix(videoKind: VideoKind, sortKind: SortKind): string {
  switch (true) {
    case videoKind === "videos" && sortKind === "newest":
      return "UULF";
    case videoKind === "videos" && sortKind === "popular":
      return "UULP";
    case videoKind === "shorts" && sortKind === "newest":
      return "UUSH";
    case videoKind === "shorts" && sortKind === "popular":
      return "UUPS";
    case videoKind === "streams" && sortKind === "newest":
      return "UULV";
    case videoKind === "streams" && sortKind === "popular":
      return "UUPV";
    default:
      return "UU";
  }
}

type VideoKind = "videos" | "shorts" | "streams";
type SortKind = "newest" | "popular" | "oldest";
