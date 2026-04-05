import { type CategoryKind, type SortKind, YoutubeDOM } from "./youtube-dom";

export async function fetchChannelId(channelUrl: string) {
  const res = await fetch(channelUrl);
  const html = await res.text();
  const match = html.match(
    /<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.*?)">/i,
  );
  const channelId = match?.at(1);
  return channelId;
}

export async function resolvePlaylistPath(
  channelId: string,
  categoryKind: CategoryKind,
  sortKind: SortKind,
): Promise<string> {
  if (sortKind === "Oldest") {
    const videoId = await getOldestItemId(channelId, categoryKind);
    if (videoId === null) {
      return "";
    }
    return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
  } else {
    return `${resolveFilteredPlaylistUrl(channelId, categoryKind, sortKind)}&playnext=1`;
  }
}

async function getOldestItemId(
  channelId: string,
  categoryKind: CategoryKind,
): Promise<string | null> {
  const playlistUrl = `${resolveFilteredPlaylistUrl(channelId, categoryKind, "Latest")}`;

  const playlistHeader = (await fetchYtInitialData(playlistUrl)).header;
  if (playlistHeader === undefined) {
    return null;
  }

  const videoCount =
    playlistHeader.playlistHeaderRenderer.stats[0].runs[0].text;

  const oldestVideoId = (
    await fetchYtInitialData(`${playlistUrl}&index=${videoCount}&playnext=1`)
  ).currentVideoEndpoint.watchEndpoint.videoId;

  return oldestVideoId;
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

async function fetchYtInitialData(url: string) {
  const htmlRes = await fetch(url);
  const html = await htmlRes.text();
  const ytInitialDataString = html.match(
    YoutubeDOM.isMobile
      ? /var ytInitialData\s*=\s*'([\s\S]*?)';/
      : /var ytInitialData\s*=\s*(\{[\s\S]*?\});/,
  )![1];
  const ytInitialData = JSON.parse(
    YoutubeDOM.isMobile
      ? ytInitialDataString
          .replace(/\\\\\\x22/g, '\\\\\\"')
          .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
          )
      : ytInitialDataString,
  );
  return ytInitialData;
}
