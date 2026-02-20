import { ChannelPage } from "./channel-page";
import { resolvePlaylistPath } from "./youtube-api";
import YoutubePage from "./youtube-page";

export class CategoryTab {
  public static SORT_BUTTON_HOLDER =
    "ytd-browse[page-subtype='channels'] #chips";
  public static NEW_SORT_BUTTON_HOLDER =
    "ytd-browse[page-subtype='channels'] .ytChipBarViewModelChipBarScrollContainer";
  // public static SORT_BUTTON = `${this.SORT_BUTTON_HOLDER}>[selected]`;

  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];
  public static readonly categories: CategoryKind[] = [
    "Videos",
    "Shorts",
    "Streams",
  ];

  public static get isCategoryTab() {
    // Known issue: Cannot detect the category when the Home tab is hidden and the first tab is selected.
    return window.location.pathname.match(/^\/[^/]+\/(videos|shorts|streams)$/);
  }

  public static async mount() {
    // buttonHolder may not exist when there are not enough videos
    const buttonHolder = document.querySelector(
      CategoryTab.sortButtonHolderSelector,
    );
    if (buttonHolder) {
      const categoryTab = new CategoryTab(ChannelPage.categoryKind!);
      await categoryTab.renderPlayAllButton();
      categoryTab.startSortUiSync();
    }
  }

  public static get sortButtonHolderSelector() {
    return `${CategoryTab.SORT_BUTTON_HOLDER},${CategoryTab.NEW_SORT_BUTTON_HOLDER}`;
  }

  public lastSortKind: SortKind = "Latest";

  public constructor(public categoryKind: CategoryKind) {}

  public startSortUiSync() {
    const sortStateObserver = new MutationObserver(async (records) => {
      const buttonHolder = document.querySelector(
        CategoryTab.sortButtonHolderSelector!,
      )!;
      const selectedButton = records.find(
        (e) => (e.target as any).ariaSelected === "true",
      )!.target;
      const sortKind: SortKind | null = (() => {
        const i = Array.from(buttonHolder.children).findIndex((root) =>
          root.contains(selectedButton),
        );
        switch (i) {
          case 0:
            return "Latest";
          case 1:
            return "Popular";
          case 2:
            return "Oldest";
          default:
            return null;
        }
      })();
      const isSortChanged = sortKind !== null;
      if (isSortChanged) {
        this.lastSortKind = sortKind;
      }
    });
    const rerendererObserver = new MutationObserver(async (records) => {
      const buttonHolderRecords = records.filter(
        (r) =>
          r.target instanceof Element &&
          (r.target.matches(CategoryTab.sortButtonHolderSelector) ||
            r.target.querySelector(CategoryTab.sortButtonHolderSelector)),
      );
      const isButtonRerendered = buttonHolderRecords.length > 0;
      if (CategoryTab.isCategoryTab && isButtonRerendered) {
        await this.renderPlayAllButton(this.lastSortKind);
      }
    });

    // buttonHolder may be rerendered; therefore, observe the document instead
    sortStateObserver.observe(document, {
      subtree: true,
      childList: false,
      attributes: true,
      attributeFilter: ["aria-selected"],
      attributeOldValue: true,
    });
    rerendererObserver.observe(document, {
      subtree: true,
      childList: true,
      attributes: false,
    });

    window.addEventListener(
      YoutubePage.NavigationStartEvent,
      () => {
        [sortStateObserver, rerendererObserver].forEach((w) => {
          w.disconnect();
        });
      },
      {
        once: true,
      },
    );
  }

  public async renderPlayAllButton(sortKind: SortKind = "Latest") {
    const categoryKind = this.categoryKind;

    const playAllButton = document.createElement("a");
    playAllButton.classList.add("play-all-btn");
    playAllButton.classList.add(categoryKind.toLowerCase());
    playAllButton.classList.add(sortKind.toLowerCase());
    playAllButton.href = await resolvePlaylistPath(
      window.location.href,
      categoryKind,
      sortKind,
    );
    playAllButton.textContent = `Play All (${sortKind})`;

    const buttonHolder = document.querySelector(
      CategoryTab.sortButtonHolderSelector,
    );
    const targetPlayAllButton = document.querySelector(
      `.play-all-btn.${categoryKind.toLowerCase()}.${sortKind.toLowerCase()}`,
    );
    if (!targetPlayAllButton) {
      document.querySelector(".play-all-btn")?.remove();
      buttonHolder?.appendChild(playAllButton);
    }
  }
}

export type CategoryKind = "Videos" | "Shorts" | "Streams";
export type SortKind = "Latest" | "Popular" | "Oldest";
