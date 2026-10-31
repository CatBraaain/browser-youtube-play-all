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
