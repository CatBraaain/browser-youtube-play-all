export class YoutubeDOM {
  public static get isMobile() {
    return window.location.host === "m.youtube.com";
  }

  public static readonly categories: CategoryKind[] = ["Videos", "Shorts", "Streams"];

  public static get categoryKind(): CategoryKind | null {
    // a trailing slash leaves an empty last segment; use the last non-empty segment
    const segments = window.location.pathname.split("/").filter(Boolean);
    const categorySlug = (segments.at(-1) ?? "").split("?")[0];
    const categoryKind = (() => {
      switch (categorySlug) {
        case "videos":
          return "Videos";
        case "shorts":
          return "Shorts";
        case "streams":
          return "Streams";
        default:
          return null;
      }
    })();
    return categoryKind;
  }

  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];

  public static SORT_BUTTON =
    "ytd-browse[page-subtype='channels'] #primary [aria-selected],ytm-browse .tab-content [aria-selected]";

  // Membership channels replace the three sort chips with a sort dropdown
  // chip labeled with the current sort, next to audience filter chips
  // (YT-SPEC.md "Sort dropdown UI").
  public static SORT_COMBOBOX =
    "ytd-browse[page-subtype='channels'] #primary chip-bar-view-model button[role='combobox'],ytm-browse .tab-content chip-bar-view-model button[role='combobox']";

  // The selected control's own text names the sort in both UIs: the dropdown
  // chip's label (dropdown UI) or the selected chip's text (classic UI).
  public static SORT_SELECTED =
    "ytd-browse[page-subtype='channels'] #primary [aria-selected='true'],ytm-browse .tab-content [aria-selected='true']";

  // The label→sort mapping is learned from the page fetch's chip bar before
  // any UI interaction (youtube-api.ts), so no locale-dependent text is
  // hardcoded. Labels never learned map to no sort, and the button falls
  // back to Latest — YouTube resets the sort to Latest on every page load
  // and tab change, so an unlearned label always means Latest (YT-SPEC.md
  // "Sort dropdown UI").
  private static readonly learnedSortLabels = new Map<string, SortKind>();

  public static get sortButtons() {
    // sort buttons may not exist when there are not enough videos
    return Array.from(document.querySelectorAll(YoutubeDOM.SORT_BUTTON));
  }

  public static get sortButtonLineages() {
    return YoutubeDOM.sortButtons.map((e) => {
      const lineage = [];
      let current: Element | null = e;
      while (current) {
        lineage.push(current);
        current = current.parentElement;
      }
      return lineage.reverse();
    });
  }

  public static get sortButtonHolder(): Element | undefined {
    if (YoutubeDOM.sortButtons.length !== 3) {
      return undefined;
    }
    const sortButtonLineages = YoutubeDOM.sortButtonLineages;
    const sortButtonHolder = sortButtonLineages[0]!.findLast((e) =>
      sortButtonLineages.slice(1).every((lineage) => lineage.includes(e)),
    );
    return sortButtonHolder;
  }

  public static get sortCombobox(): Element | null {
    return document.querySelector(YoutubeDOM.SORT_COMBOBOX);
  }

  // Teaches the canonical-order labels of the current page's chip bar. The
  // map is always replaced, so it always mirrors the latest page fetch.
  public static learnSortLabels(labels: string[]): void {
    YoutubeDOM.learnedSortLabels.clear();
    if (labels.length !== YoutubeDOM.sorts.length) {
      return;
    }
    labels.forEach((label, i) => {
      YoutubeDOM.learnedSortLabels.set(label, YoutubeDOM.sorts[i]!);
    });
  }

  public static get sortKind(): SortKind | null {
    const selected = YoutubeDOM.sortCombobox ?? document.querySelector(YoutubeDOM.SORT_SELECTED);
    const label = selected?.textContent?.trim() ?? "";
    return YoutubeDOM.learnedSortLabels.get(label) ?? null;
  }
}

export type CategoryKind = "Videos" | "Shorts" | "Streams";
export type SortKind = "Latest" | "Popular" | "Oldest";
