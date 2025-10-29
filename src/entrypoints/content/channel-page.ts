export default class ChannelPage {
  public static get isOnSupportedPage() {
    const isUnknownPage = ChannelPage.videoKind === null;
    const notSupportedByYoutube =
      (
        [
          "Shorts",
          "Streams",
        ] satisfies VideoKindNullable[] as VideoKindNullable[]
      ).includes(ChannelPage.videoKind) && ChannelPage.sortKind === "Oldest";
    return !(isUnknownPage || notSupportedByYoutube);
  }

  public static get videoKind(): VideoKindNullable {
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

  public static get sortKind(): SortKindNullable {
    const selectedButton = document.querySelector(
      "#primary #header #chips>[selected]",
    );
    const index = selectedButton
      ? Array.from(selectedButton.parentNode?.children ?? []).indexOf(
          selectedButton,
        )
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

  public channelId: string;

  public constructor(channelId: string) {
    this.channelId = channelId;
  }

  public ensurePlayAllButton() {
    if (!ChannelPage.hasPlayAllButton) {
      this.addPlayAllButton(ChannelPage.videoKind, ChannelPage.sortKind);
    }
  }

  public addPlayAllButton(
    videoKind: VideoKindNullable,
    sortKind: SortKindNullable,
  ) {
    const playAllButton = document.createElement("a");
    playAllButton.classList.add("play-all-btn");
    if (videoKind && sortKind) {
      const playListPath = this._getPlayListPath(videoKind, sortKind);
      playAllButton.href = playListPath;
      playAllButton.textContent = `Play All (${sortKind})`;
    } else {
      playAllButton.textContent = `Play All (Not Available)`;
    }

    const buttonHolder = document.querySelector("#primary #header #chips");
    buttonHolder?.appendChild(playAllButton);
  }

  private _getPlayListPath(videoKind: VideoKind, sortKind: SortKind): string {
    if (sortKind === "Oldest") {
      const oldestVideoHref = document.querySelector<HTMLLinkElement>(
        "ytd-browse [href*='/watch?v='],ytd-browse [href*='/shorts/']",
      )?.href;
      const videoId = oldestVideoHref
        ?.match(/(?:watch\?v=|shorts\/)([^&]*)/)
        ?.at(1);
      return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
    } else {
      if (videoKind && sortKind) {
        const playlistPrefix = this._getPlayListPrefix(videoKind, sortKind);
        return `/playlist?list=${playlistPrefix}${this.channelId.slice(2)}&playnext=1`;
      } else {
        return "";
      }
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

type VideoKindNullable = VideoKind | null;
type SortKindNullable = SortKind | null;
