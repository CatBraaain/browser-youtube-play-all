import type { CategoryKind } from "./category-page";

export class ChannelPage {
  public static get isChannelPage() {
    const url = window.location.href;
    const channelUrlPattern = /https:\/\/www.youtube.com\/(@.*|channel\/UC).*/;
    return channelUrlPattern.test(url);
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
    const match = html.match(/<link rel="canonical" href="(.*?)"/i);
    const href = match![1];
    const channelId = href.split("/").at(-1)!;
    return channelId;
  }
}

type CategoryKindNullable = CategoryKind | null;
