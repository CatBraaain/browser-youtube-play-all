export default class Page {
  public static get isOnSupportedPage() {
    return this.videoKind !== null;
  }

  public static get videoKind(): VideoKind {
    const videoKind = window.location.pathname.split("/").at(-1)!.split("?")[0];
    switch (videoKind) {
      case "videos":
        return "Videos";
      case "shorts":
        return "Shorts";
      case "streams":
        return "Streams";
      default:
        return null;
    }
  }

  public static get sortKind(): SortKind {
    const selectedButton = document.querySelector("#primary #header #chips>[selected]");
    const index = selectedButton
      ? Array.from(selectedButton.parentNode?.children ?? []).indexOf(selectedButton)
      : 0;
    switch (index) {
      case 0:
        return "Latest";
      case 1:
        return "Popular";
      case 2:
        return "Oldest";
      default:
        return null;
    }
  }

  public static get hasPlayAllButton() {
    return !!document.querySelector(".play-all-btn");
  }

  public static applyStyleForPlayAllButton() {
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
  }

  public static ensurePlayAllButton(channelId: string) {
    if (!this.hasPlayAllButton) {
      this.addPlayAllButton(channelId);
    }
  }

  public static addPlayAllButton(channelId: string) {
    const playAllButton = document.createElement("a");
    const playListPath = this._getPlayListPath(channelId);
    playAllButton.classList.add("play-all-btn");
    if (playListPath) {
      playAllButton.href = playListPath;
      playAllButton.textContent = `Play All (${this.sortKind})`;
    } else {
      playAllButton.textContent = `Play All (Not Available)`;
    }

    const buttonHolder = document.querySelector("#primary #header #chips");
    buttonHolder?.appendChild(playAllButton);
  }

  private static _getPlayListPath(channelId: string): string {
    if (this.sortKind === "Oldest") {
      const oldestVideoHref = document.querySelector<HTMLLinkElement>(
        "ytd-browse [href^='/watch?v='],ytd-browse [href^='/shorts/']",
      )?.href;
      const videoId = oldestVideoHref?.match(/(?:watch\?v=|shorts\/)([^&]*)/)?.at(1);
      return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
    } else {
      if (channelId && this.videoKind && this.sortKind) {
        const playlistPrefix = this._getPlayListPrefix(this.videoKind, this.sortKind);
        return `/playlist?list=${playlistPrefix}${channelId}&playnext=1`;
      } else {
        return "";
      }
    }
  }

  private static _getPlayListPrefix(videoKind: VideoKind, sortKind: SortKind): string {
    switch (true) {
      case videoKind === "Videos" && sortKind === "Latest":
        return "UULF";
      case videoKind === "Videos" && sortKind === "Popular":
        return "UULP";
      case videoKind === "Shorts" && sortKind === "Latest":
        return "UUSH";
      case videoKind === "Shorts" && sortKind === "Popular":
        return "UUPS";
      case videoKind === "Streams" && sortKind === "Latest":
        return "UULV";
      case videoKind === "Streams" && sortKind === "Popular":
        return "UUPV";
      default:
        return "UU";
    }
  }
}

type VideoKind = "Videos" | "Shorts" | "Streams" | null;
type SortKind = "Latest" | "Popular" | "Oldest" | null;
