import { ChannelPage } from "./channel-page";
import { resolvePlaylistPath } from "./youtube-api";
import YoutubePage from "./youtube-page";

export class CategoryTab {
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

  public static SORT_BUTTON =
    "ytd-browse[page-subtype='channels'] #primary [aria-selected],ytm-browse .tab-content [aria-selected]";
  public static get sortButtonLineages() {
    // sort buttons may not exist when there are not enough videos
    const sortButtons = Array.from(
      document.querySelectorAll(CategoryTab.SORT_BUTTON),
    );
    const lineages = sortButtons.map((e) => {
      const lineage = [];
      let current: Element | null = e;
      while (current) {
        lineage.push(current);
        current = current.parentElement;
      }
      return lineage.reverse();
    });
    return lineages;
  }
  public static get sortButtonHolder(): Element | undefined {
    // Note: sort buttons may not exist when there are not enough videos
    const sortButtonLineages = CategoryTab.sortButtonLineages;
    if (sortButtonLineages.length !== 3) {
      return undefined;
    }
    const sortButtonHolder = sortButtonLineages[0].findLast((e) =>
      sortButtonLineages.slice(1).every((lineage) => lineage.includes(e)),
    );
    return sortButtonHolder;
  }

  public lastSortKind: SortKind = "Latest";

  public constructor(public categoryKind: CategoryKind) {}

  public static async mount() {
    const categoryTab = new CategoryTab(ChannelPage.categoryKind!);
    const sortKind: SortKind =
      (() => {
        const i = Array.from(
          CategoryTab.sortButtonHolder?.children || [],
        ).findIndex(
          (eachButtonTree) =>
            eachButtonTree.matches("[aria-selected=true]") ||
            eachButtonTree.querySelector("[aria-selected=true]"),
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
      })() ?? "Latest";
    // At this moment, sort buttons may not be rendered yet.
    // Then `.renderPlayAllButton()` not working as initial rendering but `.startSortUiSync()` covers it.
    await categoryTab.renderPlayAllButton(sortKind);
    await categoryTab.startSortUiSync();
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

    const targetPlayAllButton = document.querySelector(
      `.play-all-btn.${categoryKind.toLowerCase()}.${sortKind.toLowerCase()}`,
    );
    if (!targetPlayAllButton) {
      document.querySelector(".play-all-btn")?.remove();
      CategoryTab.sortButtonHolder?.appendChild(playAllButton);
    }
  }

  public startSortUiSync() {
    const sortStateObserver = new MutationObserver(async (records) => {
      const selectedButton = records.find(
        (e) => (e.target as any).ariaSelected === "true",
      )!.target;
      const sortKind: SortKind | null = (() => {
        const i = Array.from(
          CategoryTab.sortButtonHolder?.children || [],
        ).findIndex((eachButtonTree) =>
          eachButtonTree.contains(selectedButton),
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
        if (YoutubePage.isMobile) {
          await this.renderPlayAllButton(this.lastSortKind);
        }
      }
    });
    const rerendererObserver = new MutationObserver(async (records) => {
      const sortButtonRelatedSet = new Set(
        CategoryTab.sortButtonLineages.flat(),
      );
      const buttonHolderRecords = records.filter(
        (r) =>
          r.target instanceof Element && sortButtonRelatedSet.has(r.target),
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
}

export type CategoryKind = "Videos" | "Shorts" | "Streams";
export type SortKind = "Latest" | "Popular" | "Oldest";
