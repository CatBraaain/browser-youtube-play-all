import type { CategoryKind } from "./category-page";
import { fetchChannelId } from "./youtube-api";

export class ChannelPage {
  public static get isChannelPage() {
    return fetchChannelId(window.location.href) !== undefined;
  }

  public static get categoryKind(): CategoryKindNullable {
    const categoryKind = window.location.pathname
      .split("/")
      .at(-1)!
      .split("?")[0];
    switch (categoryKind) {
      case "videos":
        return "Videos";
      case "shorts":
        return "Shorts";
      case "streams":
        return "Streams";
      default:
        return null;
    }
  }
}

type CategoryKindNullable = CategoryKind | null;
