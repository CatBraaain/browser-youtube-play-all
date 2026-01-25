import type { CategoryKind } from "./category-page";

export class ChannelPage {
  public static get isChannelPage() {
    const channelUrlPattern = /\/(@.*|channel\/UC).*/;
    return channelUrlPattern.test(window.location.pathname);
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

  public static async fetchChannelId() {
    const res = await fetch(window.location.href);
    const html = await res.text();
    const match = html.match(
      /<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.*?)">/i,
    );
    const channelId = match![1];
    return channelId;
  }
}

type CategoryKindNullable = CategoryKind | null;
