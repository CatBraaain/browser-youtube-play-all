import { ChannelPage } from "./channel-page";

export class CategoryPage {
  public static get isCategoryPage() {
    return ChannelPage.isChannelPage && ChannelPage.categoryKind !== null;
  }

  public constructor(
    public channelId: string,
    public categoryKind: CategoryKind,
  ) {}

  public static async mount() {
    const categoryPage = new CategoryPage(
      await ChannelPage.fetchChannelId(),
      ChannelPage.categoryKind!,
    );
    if (categoryPage.shouldAddButton) {
      categoryPage.addPlayAllButton();
    }
    const watcher = categoryPage.watchSortSelect();
    window.addEventListener(
      "yt-navigate-start",
      () => categoryPage.unwatchSortSelect(watcher),
      {
        once: true,
      },
    );
  }

  public get sortKind(): SortKind {
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
        return "Latest";
    }
  }

  public watchSortSelect() {
    const buttonHolder = document.querySelector("#primary #header #chips")!;
    const observer = new MutationObserver(() => {
      if (this.shouldAddButton) {
        this.addPlayAllButton();
      }
    });
    observer.observe(buttonHolder, {
      subtree: true,
      childList: false,
      attributes: true,
    });
    return observer;
  }

  public unwatchSortSelect(observer: MutationObserver) {
    observer.disconnect();
  }

  public get shouldAddButton() {
    const categoryKind = this.categoryKind;
    const sortKind = this.sortKind;

    const isSupportedPage =
      sortKind !== null &&
      !(categoryKind !== "Videos" && sortKind === "Oldest");
    const hasPlayAllButton = !!document.querySelector(".play-all-btn");
    return isSupportedPage && !hasPlayAllButton;
  }

  public addPlayAllButton() {
    const categoryKind = this.categoryKind;
    const sortKind = this.sortKind;

    const playAllButton = document.createElement("a");
    playAllButton.classList.add("play-all-btn");
    playAllButton.href = this.resolvePlaylistPath(
      categoryKind,
      sortKind,
      this.channelId,
    );
    playAllButton.textContent = `Play All (${sortKind})`;

    const buttonHolder = document.querySelector(
      "#primary #header #chips>[selected]",
    );
    buttonHolder?.appendChild(playAllButton);
  }

  private resolvePlaylistPath(
    categoryKind: CategoryKind,
    sortKind: SortKind,
    channelId: string,
  ): string {
    if (sortKind === "Oldest") {
      const oldestVideoHref = document.querySelector<HTMLLinkElement>(
        "ytd-browse [href*='/watch?v='],ytd-browse [href*='/shorts/']",
      )?.href;
      const videoId = oldestVideoHref
        ?.match(/(?:watch\?v=|shorts\/)([^&]*)/)
        ?.at(1);
      return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
    } else {
      if (categoryKind && sortKind) {
        const playlistPrefix = this.resolvePlaylistPrefix(
          categoryKind,
          sortKind,
        );
        return `/playlist?list=${playlistPrefix}${channelId.slice(2)}&playnext=1`;
      } else {
        return "";
      }
    }
  }

  private resolvePlaylistPrefix(
    categoryKind: CategoryKind,
    sortKind: SortKind,
  ): string {
    switch (true) {
      case categoryKind === "Videos" && sortKind === "Latest":
        return "UULF";
      case categoryKind === "Videos" && sortKind === "Popular":
        return "UULP";
      case categoryKind === "Shorts" && sortKind === "Latest":
        return "UUSH";
      case categoryKind === "Shorts" && sortKind === "Popular":
        return "UUPS";
      case categoryKind === "Streams" && sortKind === "Latest":
        return "UULV";
      case categoryKind === "Streams" && sortKind === "Popular":
        return "UUPV";
      default:
        return "UU";
    }
  }
}

export type CategoryKind = "Videos" | "Shorts" | "Streams";
export type SortKind = "Latest" | "Popular" | "Oldest";
