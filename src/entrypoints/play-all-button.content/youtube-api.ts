import { type CategoryKind, type SortKind, YoutubeDOM } from "./youtube-dom";

// Test hook: Playwright's page.route cannot see fetches made by this content
// script on Firefox (Juggler only hooks page-context requests), so e2e tests
// inject delayed/failed playlist resolutions through the DOM instead. The
// document element is shared between the page and the content-script sandbox
// on every engine. Tests set data-ytx-fetch-gate to JSON such as
// {"delay":["/playlist?list=UULF"]} or {"abort":["/playlist?list=UULF"]} and
// can await data-ytx-fetch-gate-held to observe a delayed fetch.
type FetchGate = { delay?: string[]; abort?: string[] };

function gateModeFor(url: string): "delay" | "abort" | null {
  const raw = document.documentElement.dataset.ytxFetchGate;
  if (!raw) {
    return null;
  }
  let gate: FetchGate;
  try {
    gate = JSON.parse(raw) as FetchGate;
  } catch {
    return null;
  }
  if (gate.abort?.some((pattern) => url.includes(pattern))) {
    return "abort";
  }
  if (gate.delay?.some((pattern) => url.includes(pattern))) {
    return "delay";
  }
  return null;
}

async function applyFetchGate(url: string): Promise<void> {
  for (;;) {
    const mode = gateModeFor(url);
    if (mode === "abort") {
      delete document.documentElement.dataset.ytxFetchGateHeld;
      throw new Error(`fetch aborted by test gate: ${url}`);
    }
    if (mode !== "delay") {
      delete document.documentElement.dataset.ytxFetchGateHeld;
      return;
    }
    document.documentElement.dataset.ytxFetchGateHeld = url;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function fetchChannelId(channelUrl: string) {
  await applyFetchGate(channelUrl);
  const res = await fetch(channelUrl);
  const html = await res.text();
  const matches = [
    ...(html.match(/<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(.*?)">/i) ??
      []),
    ...(html.match(/"https:\/\/www.youtube.com\/channel\/(.*?)"/i) ?? []),
  ];
  const channelId = matches.at(1);
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
  const playlistUrl = new URL(
    `${resolveFilteredPlaylistUrl(channelId, categoryKind, "Latest")}`,
    window.location.href,
  ).toString();

  const playlistHeader = (await fetchYtInitialData(playlistUrl)).header;
  if (playlistHeader === undefined) {
    return null;
  }

  const videoCount = playlistHeader.playlistHeaderRenderer.stats[0].runs[0].text
    .match(/\d/g)
    ?.join("");
  if (videoCount === undefined) {
    return null;
  }

  const oldestVideoId = (await fetchYtInitialData(`${playlistUrl}&index=${videoCount}&playnext=1`))
    .currentVideoEndpoint.watchEndpoint.videoId;

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
  await applyFetchGate(url);
  const htmlRes = await fetch(url);
  const html = await htmlRes.text();
  const ytInitialDataString = html.match(
    YoutubeDOM.isMobile
      ? /var ytInitialData\s*=\s*'([\s\S]*?)';/
      : /var ytInitialData\s*=\s*(\{[\s\S]*?\});/,
  )![1]!;
  const ytInitialData = JSON.parse(
    YoutubeDOM.isMobile
      ? ytInitialDataString
          .replace(/\\\\\\x22/g, '\\\\\\"')
          .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      : ytInitialDataString,
  );
  return ytInitialData;
}
