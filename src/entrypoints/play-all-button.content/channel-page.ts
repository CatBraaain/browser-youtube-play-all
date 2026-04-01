import type { CategoryKind } from "./category-tab";

export class ChannelPage {
  public static get categoryKind(): CategoryKindNullable {
    const categorySlug = window.location.pathname
      .split("/")
      .at(-1)!
      .split("?")[0];
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
}

type CategoryKindNullable = CategoryKind | null;
