import { logger } from "../../logger";
import type { ChannelMeta } from "./channel-meta";
import { ChannelPage } from "./channel-page";
import { type SortKind, SortTab } from "./sort-tab";
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

  public static async mount(channelMeta: ChannelMeta) {
    const categoryTab = new CategoryTab(ChannelPage.categoryKind!);
    if (SortTab.sortButtonHolder) {
      await categoryTab.renderPlayAllButton(
        channelMeta,
        SortTab.sortKind ?? "Latest",
      );
    }
    await categoryTab.startSortUiSync(channelMeta);
  }

  public async renderPlayAllButton(
    channelMeta: ChannelMeta,
    sortKind: SortKind,
  ) {
    const categoryKind = this.categoryKind;

    const playAllButton = document.createElement("a");
    playAllButton.classList.add("play-all-btn");
    playAllButton.classList.add(categoryKind.toLowerCase());
    playAllButton.classList.add(sortKind.toLowerCase());
    playAllButton.href = await channelMeta.getPlaylistPath(
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
    logger.info("CategoryTab.renderPlayAllButton()", {
      buttonExists: !!targetPlayAllButton,
      buttonHolderExists: !!SortTab.sortButtonHolder,
      href: playAllButton.href,
    });
  }

  public startSortUiSync(channelMeta: ChannelMeta) {
    logger.info("CategoryTab.startSortUiSync", "start");

    const sortStateObserver = new MutationObserver(
      async (_records, observer) => {
        if (this.categoryKind !== ChannelPage.categoryKind) {
          observer.disconnect();
          return;
        }

        const sortKind = SortTab.sortKind;
        const isSortChanged = sortKind && sortKind !== this.lastSortKind;
        if (isSortChanged) {
          logger.info(
            "CategoryTab.startSortUiSync",
            `Sort changed from ${this.lastSortKind} to ${sortKind}`,
          );
          this.lastSortKind = sortKind;
          await this.renderPlayAllButton(channelMeta, this.lastSortKind);
        }
      },
    );
    // buttonHolder may be rerendered; therefore, observe the document instead
    sortStateObserver.observe(document, {
      subtree: true,
      childList: false,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });

    const rerendererObserver = new MutationObserver(
      async (records, observer) => {
        if (this.categoryKind !== ChannelPage.categoryKind) {
          observer.disconnect();
          return;
        }

        const sortButtonRelatedSet = new Set(SortTab.sortButtonLineages.flat());
        const sortButtonRelatedRecords = records.filter(
          (r) =>
            r.target instanceof Element && sortButtonRelatedSet.has(r.target),
        );
        const isSortButtonRerendered = sortButtonRelatedRecords.length > 0;
        if (CategoryTab.isCategoryTab && isSortButtonRerendered) {
          logger.info(
            "CategoryTab.startSortUiSync",
            "sort button was rerendered",
          );
          await this.renderPlayAllButton(channelMeta, this.lastSortKind);
        }
      },
    );
    rerendererObserver.observe(document, {
      subtree: true,
      childList: true,
      attributes: false,
    });

    window.addEventListener(
      YoutubePage.NavigationStartEvent,
      () => {
        logger.info(
          "CategoryTab.startSortUiSync",
          "NavigationStartEvent fired, disconnecting observers",
        );
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
