export default class Page {
  public static get isOnSupportedPage() {
    return this.videoKind !== null;
  }

  private static get channelId(): string {
    return document
      .querySelector<HTMLLinkElement>("link[rel='canonical']")!
      .href.split("/")
      .at(-1)!
      .slice(2);
  }

  public static get videoKind(): VideoKind {
    const videoKind = window.location.pathname.split("/").at(-1);
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
    const selectedButton = document.querySelector("#primary #header #chips>[selected]")!;
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
        return "Latest";
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

  public static ensurePlayAllButton() {
    if (!this.hasPlayAllButton) {
      this.addPlayAllButton();
    }
  }

  public static addPlayAllButton() {
    const playAllButton = document.createElement("a");
    playAllButton.classList.add("play-all-btn");
    playAllButton.href = this.getPlayListPath();
    playAllButton.textContent = `Play All (${this.sortKind})`;

    const buttonHolder = document.querySelector("#primary #header #chips")!;
    buttonHolder.appendChild(playAllButton);
  }

  public static getPlayListPath(): string {
    if (this.sortKind === "Oldest") {
      const oldestVideoHref = document.querySelector<HTMLLinkElement>(
        "#thumbnail[href^='/watch?v=']",
      )!.href;
      return `${oldestVideoHref}&list=ULcxqQ59vzyTk`;
    } else {
      const playlistPrefix = this._getPlayListPrefix(this.videoKind, this.sortKind);
      return `/playlist?list=${playlistPrefix}${this.channelId}&playnext=1`;
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
type SortKind = "Latest" | "Popular" | "Oldest";
