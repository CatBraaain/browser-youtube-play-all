import { expect, type Locator, type Page } from "@playwright/test";

import { attachEventWatcher } from "../fixture";

export type PlaylistRow = { videoId: string; unplayable: boolean };

type JsonObject = Record<string, unknown>;

export function findObjects(value: unknown, key: string): JsonObject[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => findObjects(item, key));
  const object = value as JsonObject;
  const found = object[key];
  return [
    ...(found && typeof found === "object" ? [found as JsonObject] : []),
    ...Object.values(object).flatMap((item) => findObjects(item, key)),
  ];
}

export function playlistRows(value: unknown, renderer: string): PlaylistRow[] {
  return findObjects(value, renderer).map((row) => {
    if (typeof row.videoId !== "string" || !/^[\w-]{11}$/.test(row.videoId)) {
      throw new Error(`Playlist row has no valid video ID: ${JSON.stringify(row)}`);
    }
    return {
      videoId: row.videoId,
      unplayable: row.unplayableText != null || row.isPlayable === false,
    };
  });
}

// Fetches a relative /playlist URL inside the given page and parses its
// ytInitialData. The fetch runs in the page's own world: it is same-origin
// with the www/m host the journey is on, and YouTube answers with the script
// layout matching the page's own client (desktop var assignment, mobile
// single-quoted \xXX string, or the shared <script id> template). The parsing
// mirrors the extension's own playlist resolution (youtube-api.ts), so a
// layout switch cannot read as a resolution failure.
async function fetchPlaylistPageData(page: Page, url: string): Promise<unknown> {
  return await page.evaluate(async (url) => {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw new Error(`Playlist page fetch failed for ${url}: ${String(error)}`);
    }
    if (!response.ok) throw new Error(`Playlist page HTTP ${response.status} for ${url}`);
    const html = await response.text();
    const elementJson = html.match(
      /<script[^>]*\bid="yt-initial-data"[^>]*>([\s\S]*?)<\/script>/,
    )?.[1];
    const isMobileHost = location.host === "m.youtube.com";
    const varJson = elementJson
      ? undefined
      : isMobileHost
        ? html.match(/var ytInitialData\s*=\s*'([\s\S]*?)';/)?.[1]
        : html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});/)?.[1];
    const json = elementJson ?? varJson;
    if (json === undefined) {
      throw new Error(`No ytInitialData script in the playlist page: ${url}`);
    }
    return JSON.parse(
      !elementJson && isMobileHost
        ? json
            .replace(/\\\\\\x22/g, '\\\\\\"')
            .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        : json,
    );
  }, url);
}

// The video count a playlist page declares in its header (for example
// UULF's "116 videos"). Digits-only extraction matches the extension's own
// count parsing.
export async function readPlaylistHeaderCount(page: Page, listId: string): Promise<number> {
  const data = await fetchPlaylistPageData(page, `/playlist?list=${listId}`);
  const header = findObjects(data, "playlistHeaderRenderer")[0];
  const countText = (header as any)?.stats?.[0]?.runs?.[0]?.text;
  const digits = typeof countText === "string" ? countText.match(/\d/g)?.join("") : undefined;
  if (digits === undefined || digits === "") {
    throw new Error(`Playlist ${listId} declares no readable video count`);
  }
  return Number(digits);
}

// The video id a playlist page's currentVideoEndpoint names: watchEndpoint
// embeds it directly on some layouts, others only carry a watch URL in
// commandMetadata.
function currentVideoEndpointId(data: unknown): string | undefined {
  const endpoint = findObjects(data, "currentVideoEndpoint")[0] as any;
  return (
    endpoint?.watchEndpoint?.videoId ??
    String(endpoint?.commandMetadata?.webCommandMetadata?.url ?? "").match(
      /[?&]v=([a-zA-Z0-9_-]{11})/,
    )?.[1]
  );
}

// Resolves the shared uploads playlist's oldest item the way the extension
// resolves category oldests: the header's video count selects the last row
// (oldest-first is the reverse of the page's newest-first list), and the
// /playlist?index=<count> response names that row in currentVideoEndpoint.
export async function resolveSharedUploadsOldest(
  page: Page,
  channelId: string,
): Promise<{ count: number; videoId: string }> {
  const listId = `UU${channelId.slice(2)}`;
  const count = await readPlaylistHeaderCount(page, listId);
  const data = await fetchPlaylistPageData(
    page,
    `/playlist?list=${listId}&index=${count}&playnext=1`,
  );
  const videoId = currentVideoEndpointId(data);
  if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) {
    throw new Error(`Shared uploads playlist ${listId} resolved no oldest video`);
  }
  return { count, videoId };
}

// Shorts playlists (UUSH/UUMS) list no rows on their playlist pages, so the
// full reference resolves each row by its own index instead: the header
// count bounds the rows, and each index's page names its row in
// currentVideoEndpoint. The index runs 1 (newest) to count (oldest), the
// order the destination panel serves.
export async function readFullShortsReferencePlaylist(
  page: Page,
  listId: string,
): Promise<PlaylistRow[]> {
  const count = await readPlaylistHeaderCount(page, listId);
  const rows = await Promise.all(
    Array.from({ length: count }, (_, offset) =>
      resolvePlaylistRowByIndex(page, listId, offset + 1),
    ),
  );
  const videoIds = new Set(rows.map((row) => row.videoId));
  if (videoIds.size !== rows.length) {
    throw new Error(`Shorts playlist ${listId} resolved duplicate rows across indexes`);
  }
  return rows;
}

export async function readLastShortsReferenceRow(page: Page, listId: string) {
  const index = await readPlaylistHeaderCount(page, listId);
  if (!Number.isSafeInteger(index) || index < 1) {
    throw new Error(`Shorts playlist ${listId} declares an invalid last index: ${index}`);
  }
  const { videoId } = await resolvePlaylistRowByIndex(page, listId, index);
  return { videoId, index };
}

async function resolvePlaylistRowByIndex(
  page: Page,
  listId: string,
  index: number,
): Promise<PlaylistRow> {
  const data = await fetchPlaylistPageData(
    page,
    `/playlist?list=${listId}&index=${index}&playnext=1`,
  );
  const videoId = currentVideoEndpointId(data);
  if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) {
    throw new Error(`Shorts playlist ${listId} resolved no row at index ${index}`);
  }
  return { videoId, unplayable: false };
}

export async function readFullReferencePlaylist(
  page: Page,
  listId: string,
): Promise<PlaylistRow[]> {
  const reference = await page.context().newPage();
  try {
    const watcher = await attachEventWatcher(reference);
    const since = await watcher.captureNavigationBaseline();
    await reference.goto(`https://www.youtube.com/playlist?list=${listId}`, {
      waitUntil: "domcontentloaded",
    });
    await watcher.waitForNavigationEnd({
      since,
      expectedUrl: { pathname: "/playlist", searchParams: { list: listId } },
    });
    await reference.waitForFunction(() => Boolean((window as any).ytInitialData?.contents));
    const initial = await reference.evaluate(() => (window as any).ytInitialData.contents);
    const rows = referenceRows(initial, listId);
    let continuation = continuationToken(initial);
    const seenTokens = new Set<string>();
    const deadline = Date.now() + 90_000;
    while (continuation !== null) {
      if (Date.now() >= deadline) {
        throw new Error(`Full reference playlist timed out: list=${listId}, rows=${rows.length}`);
      }
      if (seenTokens.has(continuation))
        throw new Error(`Repeated playlist continuation: ${listId}`);
      seenTokens.add(continuation);
      const response = await fetchContinuation(reference, "browse", continuation);
      const nextRows = referenceRows(response, listId);
      if (nextRows.length === 0) throw new Error(`Empty playlist continuation: ${listId}`);
      rows.push(...nextRows);
      continuation = continuationToken(response);
    }
    expect(rows.length, `Full reference playlist ${listId} must not be empty`).toBeGreaterThan(0);
    return rows;
  } finally {
    await reference.close();
  }
}

// Reads the destination panel's full ordered list. Two native data paths
// complete it, both observed on YouTube's own clients: desktop panels expose
// continuation tokens, and every panel serves a row window that advances by
// requesting /youtubei/v1/next with a row's own watchEndpoint (mobile panels
// expose no continuation; observed 79-99 row windows advancing ~78 rows per
// request). Rows are stitched by the watchEndpoint index YouTube assigns, so
// overlapping windows cannot hide a gap, a duplicate, or a conflict, and the
// result must cover every index 0..total-1.
export async function readFullDestinationPanel(
  page: Page,
  panel: Locator,
  listId: string,
): Promise<PlaylistRow[]> {
  const initial = await panel.evaluate((element) => (element as any).data);
  expect(initial?.playlistId).toBe(listId);
  const totalVideos = initial.totalVideos;
  expect(totalVideos, `Destination panel ${listId} must declare its total`).toBeGreaterThan(0);
  const byIndex = new Map<number, PlaylistRow>();
  const stitch = (model: JsonObject) => {
    for (const row of indexedPanelRows(model, listId)) {
      const existing = byIndex.get(row.index);
      if (existing) {
        if (existing.videoId !== row.videoId) {
          throw new Error(
            `Destination panel ${listId} serves conflicting rows at index ${row.index}: ${existing.videoId} vs ${row.videoId}`,
          );
        }
        continue;
      }
      byIndex.set(row.index, { videoId: row.videoId, unplayable: row.unplayable });
    }
  };
  stitch(initial);
  let model: JsonObject = initial;
  let continuation = panelContinuation(initial);
  const seen = new Set<string>();
  const deadline = Date.now() + 90_000;
  while (continuation !== null) {
    if (Date.now() >= deadline)
      throw new Error(`Full panel timed out: list=${listId}, rows=${byIndex.size}`);
    if (seen.has(continuation)) throw new Error(`Repeated panel continuation: ${listId}`);
    seen.add(continuation);
    const response = await fetchContinuation(page, "next", continuation);
    const models = findObjects(response, "playlistPanelContinuation");
    expect(
      models,
      `Destination ${listId} continuation must contain one playlist panel`,
    ).toHaveLength(1);
    model = models[0]!;
    stitch(model);
    continuation = panelContinuation(model);
  }
  while (byIndex.size < totalVideos) {
    if (Date.now() >= deadline)
      throw new Error(`Full panel timed out: list=${listId}, rows=${byIndex.size}/${totalVideos}`);
    const cursor = lastRowEndpoint(model, listId);
    if (cursor === null) {
      throw new Error(
        `Destination panel ${listId} stopped at ${byIndex.size}/${totalVideos} rows: no row endpoint to advance`,
      );
    }
    const next = nextPanelOf(await fetchWatchEndpoint(page, cursor));
    expect(next?.playlistId, `Panel window for ${listId} must identify its playlist`).toBe(listId);
    if (next === null) {
      throw new Error(`Panel window for ${listId} returned no playlist model`);
    }
    const before = byIndex.size;
    stitch(next);
    if (byIndex.size === before) {
      throw new Error(
        `Destination panel ${listId} window did not advance coverage (${byIndex.size}/${totalVideos})`,
      );
    }
    model = next;
  }
  const indexes = [...byIndex.keys()].sort((a, b) => a - b);
  expect(indexes, `Destination panel ${listId} must cover its declared total`).toHaveLength(
    totalVideos,
  );
  expect(indexes[0]).toBe(0);
  expect(indexes.at(-1)).toBe(totalVideos - 1);
  return indexes.map((index) => byIndex.get(index)!);
}

type IndexedPlaylistRow = PlaylistRow & { index: number; endpoint: JsonObject };

function indexedPanelRows(model: JsonObject, listId: string): IndexedPlaylistRow[] {
  const contents = Array.isArray(model.contents) ? model.contents : [];
  return contents.flatMap((item) => {
    const row = (item as JsonObject | undefined)?.playlistPanelVideoRenderer as
      | JsonObject
      | undefined;
    if (!row) return [];
    if (typeof row.videoId !== "string" || !/^[\w-]{11}$/.test(row.videoId)) {
      throw new Error(`Destination panel row has no valid video ID: ${JSON.stringify(row)}`);
    }
    const endpoint = (row.navigationEndpoint as JsonObject | undefined)?.watchEndpoint as
      | JsonObject
      | undefined;
    if (endpoint?.playlistId !== listId || typeof endpoint?.index !== "number") {
      throw new Error(`Destination panel row ${row.videoId} has no playlist index for ${listId}`);
    }
    return [
      {
        index: endpoint.index,
        videoId: row.videoId,
        unplayable: row.unplayableText != null || row.isPlayable === false,
        endpoint,
      },
    ];
  });
}

// The cursor for the window walk: the watchEndpoint of the model's highest
// indexed row. Panel-native only — the browse reference never feeds it.
function lastRowEndpoint(model: JsonObject, listId: string): JsonObject | null {
  const rows = indexedPanelRows(model, listId);
  if (rows.length === 0) return null;
  return rows.reduce((highest, row) => (row.index > highest.index ? row : highest)).endpoint;
}

async function fetchWatchEndpoint(page: Page, endpoint: JsonObject): Promise<unknown> {
  return page.evaluate(async (endpoint) => {
    const context = (window as any).ytcfg.get("INNERTUBE_CONTEXT");
    if (!context) throw new Error("YouTube has no INNERTUBE_CONTEXT");
    const response = await fetch("/youtubei/v1/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, ...endpoint }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Panel window HTTP ${response.status}`);
    return response.json();
  }, endpoint);
}

function nextPanelOf(response: unknown): JsonObject | null {
  const contents = (response as JsonObject | undefined)?.contents as JsonObject | undefined;
  const watch = contents?.singleColumnWatchNextResults as JsonObject | undefined;
  const playlist = watch?.playlist as JsonObject | undefined;
  return (playlist?.playlist as JsonObject | undefined) ?? null;
}

async function fetchContinuation(
  page: Page,
  endpoint: "browse" | "next",
  token: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ endpoint, token }) => {
      const context = (window as any).ytcfg.get("INNERTUBE_CONTEXT");
      if (!context) throw new Error("YouTube has no INNERTUBE_CONTEXT");
      const response = await fetch(`/youtubei/v1/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, continuation: token }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Playlist continuation HTTP ${response.status}`);
      return response.json();
    },
    { endpoint, token },
  );
}

function panelContinuation(model: JsonObject): string | null {
  const continuations = findObjects(model.continuations, "nextContinuationData");
  if (continuations.length === 0) return null;
  const token = continuations[0]?.continuation;
  if (continuations.length !== 1 || typeof token !== "string")
    throw new Error("Panel has no unique continuation token");
  return token;
}

function continuationToken(value: unknown): string | null {
  const items = [
    ...findObjects(value, "continuationItemRenderer"),
    ...findObjects(value, "continuationItemViewModel"),
  ];
  if (items.length === 0) return null;
  if (items.length !== 1) throw new Error(`Ambiguous playlist continuations: ${items.length}`);
  const commands = findObjects(items[0], "continuationCommand").filter(
    (command) => typeof command.token === "string",
  );
  const token = commands[0]?.token;
  if (commands.length !== 1 || typeof token !== "string") {
    throw new Error("Playlist continuation item has no unique token");
  }
  return token;
}

function referenceRows(value: unknown, listId: string): PlaylistRow[] {
  const legacy = playlistRows(value, "playlistVideoRenderer");
  if (legacy.length > 0) return legacy;
  return findObjects(value, "lockupViewModel")
    .filter((row) => row.contentType === "LOCKUP_CONTENT_TYPE_VIDEO")
    .map((row) => {
      const endpoints = findObjects(row.rendererContext, "watchEndpoint");
      expect(
        endpoints,
        `Reference row ${String(row.contentId)} must identify its playlist`,
      ).toHaveLength(1);
      expect(endpoints[0]?.playlistId).toBe(listId);
      const videoId = row.contentId;
      if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId))
        throw new Error(`Invalid reference video ID: ${String(videoId)}`);
      return { videoId, unplayable: row.unplayableText != null || row.isPlayable === false };
    });
}
