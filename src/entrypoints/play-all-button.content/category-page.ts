import { ChannelPage } from "./channel-page";
import { resolvePlaylistPath } from "./youtube-api";
import YoutubePage from "./youtube-page";

export class CategoryPage {
  public static SORT_BUTTON_HOLDER =
    "ytd-browse[page-subtype='channels'] #chips";
  public static NEW_SORT_BUTTON_HOLDER = "chip-bar-view-model";
  public static SORT_BUTTON = `${this.SORT_BUTTON_HOLDER}>[selected]`;

  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];
  public static readonly categories: CategoryKind[] = [
    "Videos",
    "Shorts",
    "Streams",
  ];

  public static get isCategoryPage() {
    return window.location.pathname.match(/^\/[^/]+\/(videos|shorts|streams)$/);
  }

  public static async mount() {
    const categoryPage = new CategoryPage(ChannelPage.categoryKind!);
    await categoryPage.renderPlayAllButton();
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
    return `${CategoryPage.SORT_BUTTON_HOLDER},${CategoryPage.NEW_SORT_BUTTON_HOLDER}`;
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

  public constructor(public categoryKind: CategoryKind) {}

  public watchSortSelect() {
    const buttonHolder = document.querySelector(
      CategoryPage.sortButtonHolderSelector!,
    );
    const observer = new MutationObserver(async (records) => {
      const buttonHolder = document.querySelector(
        CategoryPage.sortButtonHolderSelector!,
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

      if (CategoryPage.isCategoryPage && sortKind !== null) {
        await this.renderPlayAllButton(sortKind);
      }
    });
    if (buttonHolder) {
      // buttonHolder may not exist when there are not enough items
      // buttonHolder may be regenerated; therefore, observe the document instead
      observer.observe(document, {
        subtree: true,
        childList: false,
        attributes: true,
        attributeFilter: ["aria-selected"],
        attributeOldValue: true,
      });
    }
    return observer;
  }

  public unwatchSortSelect(observer: MutationObserver) {
    observer.disconnect();
  }

  public async renderPlayAllButton(sortKind: SortKind = "Latest") {
    const categoryKind = this.categoryKind;
    // const sortKind = this.sortKind;

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
    playAllButton.href = await resolvePlaylistPath(
      window.location.href,
      categoryKind,
      sortKind,
    );
    playAllButton.textContent = `Play All (${sortKind})`;

    const buttonHolder = document.querySelector(
      CategoryPage.sortButtonHolderSelector,
    );
    buttonHolder?.appendChild(playAllButton);
  }
}

export type CategoryKind = "Videos" | "Shorts" | "Streams";
export type SortKind = "Latest" | "Popular" | "Oldest";
