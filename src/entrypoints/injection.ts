import { defineUnlistedScript } from "wxt/sandbox";

export default defineUnlistedScript(main);

function main() {
  const observer = new MutationObserver(ensurePlayAllButton);

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
  const playListId = getPlayListId();
  const buttonLabel = "Play All";

  const buttonHolder = document.querySelector("#primary #header #chips")!;
  const playAllButton = document.createElement("a");
  playAllButton.className = "play-all-btn";
  playAllButton.href = `/playlist?list=${playListId}&playnext=1`;
  playAllButton.textContent = buttonLabel;

  buttonHolder.appendChild(playAllButton);
}

function getChannelId() {
  return document
    .querySelector<HTMLLinkElement>("link[rel='canonical']")!
    .href.split("/")
    .at(-1)!
    .substring(2);
}

function getPlayListId(): string {
  const videoKind = window.location.pathname.split("/").at(-1) ?? "";
  const sortByPopularButton = document.querySelector("#primary #header #chips>:nth-child(2)");
  const isSortedByPopular = sortByPopularButton?.hasAttribute("selected") ?? false;
  const playlistPrefix = getPlayListPrefix(videoKind, isSortedByPopular);

  const channelId = getChannelId();

  return `${playlistPrefix}${channelId}`;
}

function getPlayListPrefix(
  kind: "videos" | "shorts" | "streams" | string,
  isSortedByPopular: boolean,
): string {
  switch (true) {
    case kind === "videos" && isSortedByPopular:
      return "UULF";
    case kind === "videos" && !isSortedByPopular:
      return "UULP";
    case kind === "shorts" && isSortedByPopular:
      return "UUSH";
    case kind === "shorts" && !isSortedByPopular:
      return "UUPS";
    case kind === "streams" && isSortedByPopular:
      return "UULV";
    case kind === "streams" && !isSortedByPopular:
      return "UUPV";
    default:
      return "UU";
  }
}
