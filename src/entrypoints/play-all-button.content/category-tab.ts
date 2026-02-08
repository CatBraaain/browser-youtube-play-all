import { ChannelPage } from "./channel-page";
import { resolvePlaylistPath } from "./youtube-api";
import YoutubePage from "./youtube-page";

export class CategoryTab {
  public static SORT_BUTTON_HOLDER =
    "ytd-browse[page-subtype='channels'] #chips";
  public static NEW_SORT_BUTTON_HOLDER =
    "ytd-browse[page-subtype='channels'] chip-bar-view-model";
  public static SORT_BUTTON = `${this.SORT_BUTTON_HOLDER}>[selected]`;

  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];
  public static readonly categories: CategoryKind[] = [
    "Videos",
    "Shorts",
    "Streams",
  ];

  public static get isCategoryTab() {
    return window.location.pathname.match(/^\/[^/]+\/(videos|shorts|streams)$/);
  }

  public static async mount() {
    const categoryTab = new CategoryTab(ChannelPage.categoryKind!);
    await categoryTab.renderPlayAllButton();
    const watchers = categoryTab.watchSortSelect();
    window.addEventListener(
      YoutubePage.NavigationStartEvent,
      () => {
        watchers.forEach((w) => {
          w.disconnect();
        });
      },
      {
        once: true,
      },
    );
  }

  public static get sortButtonHolderSelector() {
    return `${CategoryTab.SORT_BUTTON_HOLDER},${CategoryTab.NEW_SORT_BUTTON_HOLDER}`;
  }

  public lastSortKind: SortKind = "Latest";

  public constructor(public categoryKind: CategoryKind) {}

  public watchSortSelect() {
    const buttonHolder = document.querySelector(
      CategoryTab.sortButtonHolderSelector!,
    );
    const sortChangeObserver = new MutationObserver(async (records) => {
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
      if (sortKind !== null) {
        this.lastSortKind = sortKind;
      }
    });
    const sortHolderObserver = new MutationObserver(async (records) => {
      const buttonHolderRecords = records.filter(
        (r) =>
          r.target instanceof Element &&
          r.target.matches(CategoryTab.sortButtonHolderSelector),
      );
      const isButtonRerendered = buttonHolderRecords.length > 0;
      if (CategoryTab.isCategoryTab && isButtonRerendered) {
        await this.renderPlayAllButton(this.lastSortKind);
      }
    });
    if (buttonHolder) {
      // buttonHolder may not exist when there are not enough items
      // buttonHolder may be regenerated; therefore, observe the document instead
      sortChangeObserver.observe(document, {
        subtree: true,
        childList: false,
        attributes: true,
        attributeFilter: ["aria-selected"],
        attributeOldValue: true,
      });
      sortHolderObserver.observe(document, {
        subtree: true,
        childList: true,
        attributes: false,
      });
    }
    return [sortChangeObserver, sortHolderObserver];
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
