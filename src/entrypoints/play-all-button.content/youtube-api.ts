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
    const playlistUrl = new URL(
      resolveFilteredPlaylistUrl(channelId, categoryKind, "Latest"),
      window.location.href,
    ).toString();
    const oldest = await getOldestItem(playlistUrl);
    if (oldest === null) {
      return "";
    }
    return `/watch?v=${oldest.videoId}&list=UL01234567890`;
  } else {
    return `${resolveFilteredPlaylistUrl(channelId, categoryKind, sortKind)}&playnext=1`;
  }
}

export type MembersKind = "Videos" | "Streams";
export type MembersSortKind = "Latest" | "Oldest";

export const MEMBERS_KINDS: MembersKind[] = ["Videos", "Streams"];
export const MEMBERS_SORTS: MembersSortKind[] = ["Latest", "Oldest"];

// Members-only playlists have no Popular variant and no reverse-order (UL)
// playlist, so Oldest resolves the oldest member and starts playback at it.
export async function resolveMembersPlaylistPath(
  channelId: string,
  membersKind: MembersKind,
  sortKind: MembersSortKind,
): Promise<string> {
  const playlistUrl = resolveMembersPlaylistUrl(channelId, membersKind);
  // The playlist fetches resolve the path against the document location:
  // the content-script sandbox on Firefox does not resolve relative fetch
  // URLs (the same reason getOldestItem fetches an absolute URL).
  const fetchUrl = new URL(playlistUrl, window.location.href).toString();
  if (sortKind === "Latest") {
    const header = (await fetchYtInitialData(fetchUrl)).header;
    return header === undefined ? "" : `${playlistUrl}&playnext=1`;
  }
  const oldest = await getOldestItem(fetchUrl);
  if (oldest === null) {
    return "";
  }
  return `/watch?v=${oldest.videoId}&list=${membersPlaylistId(channelId, membersKind)}&index=${oldest.index}`;
}

function membersPlaylistId(channelId: string, membersKind: MembersKind): string {
  return `${membersKind === "Videos" ? "UUMF" : "UUMV"}${channelId.slice(2)}`;
}

function resolveMembersPlaylistUrl(channelId: string, membersKind: MembersKind): string {
  return `/playlist?list=${membersPlaylistId(channelId, membersKind)}`;
}

// Resolves the oldest item of a playlist: the item count comes from the
// playlist header, and the item at that index is the oldest one. Returns the
// item's playlist index too, so reverse-order destinations can link to it.
async function getOldestItem(
  playlistUrl: string,
): Promise<{ videoId: string; index: number } | null> {
  const playlistHeader = (await fetchYtInitialData(playlistUrl)).header;
  if (playlistHeader === undefined) {
    return null;
  }

  const index = playlistHeader.playlistHeaderRenderer.stats[0].runs[0].text.match(/\d/g)?.join("");
  if (index === undefined) {
    return null;
  }

  const oldestData = await fetchYtInitialData(`${playlistUrl}&index=${index}&playnext=1`);
  const currentVideoEndpoint = oldestData.currentVideoEndpoint;
  // The watch URL moved into commandMetadata: currentVideoEndpoint used to
  // embed watchEndpoint.videoId directly, now it only carries a URL such as
  // "/watch?v=…&list=…&index=…". Support both layouts.
  const videoId =
    currentVideoEndpoint?.watchEndpoint?.videoId ??
    currentVideoEndpoint?.commandMetadata?.webCommandMetadata?.url
      ?.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      ?.at(1);
  if (videoId === undefined || videoId === null) {
    return null;
  }

  return { videoId, index: Number(index) };
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
  const ytInitialData = parseYtInitialData(html);
  if (ytInitialData === undefined) {
    throw new Error(`ytInitialData not found in response for ${url}`);
  }
  return ytInitialData;
}

// YouTube serves the same ytInitialData JSON in two script layouts chosen per
// session: a `var ytInitialData = …` assignment, or a dedicated
// <script id="yt-initial-data"> element (the newer template). Mobile
// responses additionally wrap the JSON in a single-quoted JS string with
// \\xXX escapes. Parse both layouts so a template switch does not read as a
// resolution failure.
function parseYtInitialData(html: string) {
  const elementJson = html.match(
    /<script[^>]*\bid="yt-initial-data"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  const varJson = elementJson
    ? undefined
    : YoutubeDOM.isMobile
      ? html.match(/var ytInitialData\s*=\s*'([\s\S]*?)';/)?.[1]
      : html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});/)?.[1];
  const json = elementJson ?? varJson;
  if (json === undefined) {
    return undefined;
  }
  return JSON.parse(
    !elementJson && YoutubeDOM.isMobile
      ? json
          .replace(/\\\\\\x22/g, '\\\\\\"')
          .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      : json,
  );
}
