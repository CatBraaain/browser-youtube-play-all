export default class Playlist {
  public channelId: string;
  public videoKind: VideoKind;
  public sortKind: SortKind;
  public path: string;
  public constructor() {
    this.channelId = this._getChannelId();
    this.videoKind = this._getVideoKind();
    this.sortKind = this._getSortKind();
    this.path = this._getPlayListPath();
  }

  private _getChannelId(): string {
    return document
      .querySelector<HTMLLinkElement>("link[rel='canonical']")!
      .href.split("/")
      .at(-1)!
      .slice(2);
  }

  private _getVideoKind(): VideoKind {
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

  private _getSortKind(): SortKind {
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

  private _getPlayListPath(): string {
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

  private _getPlayListPrefix(videoKind: VideoKind, sortKind: SortKind): string {
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

type VideoKind = "Videos" | "Shorts" | "Streams";
type SortKind = "Latest" | "Popular" | "Oldest";
