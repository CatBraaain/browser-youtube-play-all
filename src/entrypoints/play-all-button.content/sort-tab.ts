export class SortTab {
  public static readonly sorts: SortKind[] = ["Latest", "Popular", "Oldest"];

  public static SORT_BUTTON =
    "ytd-browse[page-subtype='channels'] #primary [aria-selected],ytm-browse .tab-content [aria-selected]";

  public static get sortButtons() {
    // sort buttons may not exist when there are not enough videos
    return Array.from(document.querySelectorAll(SortTab.SORT_BUTTON));
  }

  public static get sortButtonLineages() {
    return SortTab.sortButtons.map((e) => {
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
    if (SortTab.sortButtons.length !== 3) {
      return undefined;
    }
    const sortButtonLineages = SortTab.sortButtonLineages;
    const sortButtonHolder = sortButtonLineages[0].findLast((e) =>
      sortButtonLineages.slice(1).every((lineage) => lineage.includes(e)),
    );
    return sortButtonHolder;
  }

  public static get sortKind(): SortKind | null {
    const i = Array.from(SortTab.sortButtonHolder?.children || []).findIndex(
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
  }
}

export type SortKind = "Latest" | "Popular" | "Oldest";
