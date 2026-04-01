import { logger } from "../../logger";
import type { CategoryKind, SortKind } from "./category-tab";
import YoutubePage from "./youtube-page";

export async function resolvePlaylistPath(
  channelId: string,
  categoryKind: CategoryKind,
  sortKind: SortKind,
): Promise<string> {
  if (sortKind === "Oldest") {
    const videoId = await getOldestItemId(channelId, categoryKind);
    return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
  } else {
    return `${resolveFilteredPlaylistUrl(channelId, categoryKind, sortKind)}&playnext=1`;
  }
}

export async function fetchChannelId(channelUrl: string) {
  const res = await fetch(channelUrl);
  const html = await res.text();
  const match = html.match(
    /<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.*?)">/i,
  );
  const channelId = match?.at(1);
  return channelId;
}

function resolveFilteredPlaylistUrl(
  channelId: string,
  categoryKind: CategoryKind,
  sortKind: SortKind,
): string {
  const playlistPrefix = (() => {
    switch (true) {
      case categoryKind === "Videos" && sortKind === "Latest":
        return "UULF";
      case categoryKind === "Videos" && sortKind === "Popular":
        return "UULP";
      case categoryKind === "Shorts" && sortKind === "Latest":
        return "UUSH";
      case categoryKind === "Shorts" && sortKind === "Popular":
        return "UUPS";
      case categoryKind === "Streams" && sortKind === "Latest":
        return "UULV";
      case categoryKind === "Streams" && sortKind === "Popular":
        return "UUPV";
      default:
        return "UU";
    }
  })();
  const playlistUrl = `/playlist?list=${playlistPrefix}${channelId.slice(2)}`;
  return playlistUrl;
}

async function getOldestItemId(
  channelId: string,
  categoryKind: CategoryKind,
): Promise<string> {
  const playlistUrl = `${resolveFilteredPlaylistUrl(channelId, categoryKind, "Latest")}`;

  const videoCount = (
    await fetchYtInitialData(`${playlistUrl}&hl=en&persist_hl=1`)
  ).header.playlistHeaderRenderer.stats[0].runs[0].text;
  logger.info({ videoCount });

  const oldestVideoId = (
    await fetchYtInitialData(`${playlistUrl}&index=${videoCount}&playnext=1`)
  ).currentVideoEndpoint.watchEndpoint.videoId;
  logger.info({ oldestVideoId });
  return oldestVideoId;
}

async function fetchYtInitialData(url: string) {
  const htmlRes = await fetch(url);
  const html = await htmlRes.text();
  const ytInitialDataString = html.match(
    YoutubePage.isMobile
      ? /var ytInitialData\s*=\s*'([\s\S]*?)';/
      : /var ytInitialData\s*=\s*(\{[\s\S]*?\});/,
  )![1];
  const ytInitialData = JSON.parse(
    YoutubePage.isMobile
      ? ytInitialDataString
          .replace(/\\\\\\x22/g, '\\\\\\"')
          .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          )
      : ytInitialDataString,
  );
  return ytInitialData;
}
