import { ChannelPage } from "./channel-page";
import YoutubePage from "./youtube-page";

export class CategoryPage {
  public static SORT_BUTTON_HOLDER =
    "ytd-browse[page-subtype='channels'] #chips";
  public static SORT_BUTTON = `${this.SORT_BUTTON_HOLDER}>[selected]`;

  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];
  public static readonly categories: CategoryKind[] = [
    "Videos",
    "Shorts",
    "Streams",
  ];

  public static get isCategoryPage() {
    return ChannelPage.isChannelPage && ChannelPage.categoryKind !== null;
  }

  public static async mount() {
    const categoryPage = new CategoryPage(
      await ChannelPage.fetchChannelId(),
      ChannelPage.categoryKind!,
    );
    categoryPage.renderPlayAllButton();
    const watcher = categoryPage.watchSortSelect();
    window.addEventListener(
      YoutubePage.NavigationStartEvent,
      () => categoryPage.unwatchSortSelect(watcher),
      {
        once: true,
      },
    );
  }

  public static get sortButtonHolderSelector() {
    return CategoryPage.SORT_BUTTON_HOLDER;
  }

  public get sortKind(): SortKind {
    const selectedButton = document.querySelector(CategoryPage.SORT_BUTTON);
    const index = selectedButton
      ? Array.from(selectedButton.parentNode?.children ?? []).indexOf(
          selectedButton,
        )
      : 0;
    return CategoryPage.sorts[index];
  }

  public constructor(
    public channelId: string,
    public categoryKind: CategoryKind,
  ) {}

  public watchSortSelect() {
    const buttonHolder = document.querySelector(
      CategoryPage.sortButtonHolderSelector!,
    );
    const observer = new MutationObserver(() => {
      if (CategoryPage.isCategoryPage) {
        this.renderPlayAllButton();
      }
    });
    if (buttonHolder) {
      // buttonHolder may not exist when there are not enough items
      observer.observe(buttonHolder, {
        subtree: true,
        childList: false,
        attributes: true,
      });
    }
    return observer;
  }

  public unwatchSortSelect(observer: MutationObserver) {
    observer.disconnect();
  }

  public renderPlayAllButton() {
    const categoryKind = this.categoryKind;
    const sortKind = this.sortKind;

    const targetPlayAllButton = document.querySelector(
      `.play-all-btn.${categoryKind.toLowerCase()}.${sortKind.toLowerCase()}`,
    );
    const targetPlayAllButtonExists = targetPlayAllButton !== null;
    if (targetPlayAllButtonExists) {
      return;
    }

    document.querySelector(".play-all-btn")?.remove();

    const playAllButton = document.createElement("a");
    playAllButton.classList.add("play-all-btn");
    playAllButton.classList.add(categoryKind.toLowerCase());
    playAllButton.classList.add(sortKind.toLowerCase());
    playAllButton.href = this.resolvePlaylistPath(
      categoryKind,
      sortKind,
      this.channelId,
    );
    playAllButton.textContent = `Play All (${sortKind})`;

    const buttonHolder = document.querySelector(
      CategoryPage.sortButtonHolderSelector,
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
        "ytd-browse[role='main'] [href*='/watch?v='],ytd-browse[role='main'] [href*='/shorts/']",
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
