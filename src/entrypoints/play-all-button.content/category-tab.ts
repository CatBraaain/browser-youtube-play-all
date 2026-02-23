import { ChannelPage } from "./channel-page";
import { type SortKind, SortTab } from "./sort-tab";
import { resolvePlaylistPath } from "./youtube-api";
import YoutubePage from "./youtube-page";

export class CategoryTab {
  public static readonly categories: CategoryKind[] = [
    "Videos",
    "Shorts",
    "Streams",
  ];

  public static get isCategoryTab() {
    // Known issue: Cannot detect the category when the Home tab is hidden and the first tab is selected.
    return window.location.pathname.match(/^\/[^/]+\/(videos|shorts|streams)$/);
  }

  public lastSortKind: SortKind = "Latest";

  public constructor(public categoryKind: CategoryKind) {}

  public static async mount() {
    const categoryTab = new CategoryTab(ChannelPage.categoryKind!);
    if (SortTab.sortButtonHolder) {
      await categoryTab.renderPlayAllButton(SortTab.sortKind ?? "Latest");
    }
    await categoryTab.startSortUiSync();
  }

  public async renderPlayAllButton(sortKind: SortKind) {
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
      SortTab.sortButtonHolder?.appendChild(playAllButton);
    }
  }

  public startSortUiSync() {
    const sortStateObserver = new MutationObserver(async (_records) => {
      const sortKind = SortTab.sortKind;
      const isSortChanged = sortKind && sortKind !== this.lastSortKind;
      if (isSortChanged) {
        this.lastSortKind = sortKind;
        await this.renderPlayAllButton(this.lastSortKind);
      }
    });
    // buttonHolder may be rerendered; therefore, observe the document instead
    sortStateObserver.observe(document, {
      subtree: true,
      childList: false,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });

    const rerendererObserver = new MutationObserver(async (records) => {
      const sortButtonRelatedSet = new Set(SortTab.sortButtonLineages.flat());
      const sortButtonRelatedRecords = records.filter(
        (r) =>
          r.target instanceof Element && sortButtonRelatedSet.has(r.target),
      );
      const isButtonRerendered = sortButtonRelatedRecords.length > 0;
      if (CategoryTab.isCategoryTab && isButtonRerendered) {
        await this.renderPlayAllButton(this.lastSortKind);
      }
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
export type { SortKind };
