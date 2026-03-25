import { logger } from "../../logger";
import type { CategoryKind } from "./category-tab";
import { fetchChannelId } from "./youtube-api";

export class ChannelPage {
  public static async isChannelPage() {
    const isChannel =
      (await fetchChannelId(window.location.href)) !== undefined;
    logger.info("ChannelPage.isChannelPage()", {
      url: window.location.href,
      isChannel,
    });
    return isChannel;
  }

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
