import type { CategoryKind, SortKind } from "./category-page";

export async function resolvePlaylistPath(
  channelUrl: string,
  categoryKind: CategoryKind,
  sortKind: SortKind,
): Promise<string> {
  if (sortKind === "Oldest") {
    const videoId = await getOldestItemId(channelUrl, categoryKind);
    return videoId ? `/watch?v=${videoId}&list=UL01234567890` : "";
  } else {
    const channelId = (await fetchChannelId(channelUrl))!;
    if (categoryKind && sortKind) {
      const playlistPrefix = resolvePlaylistPrefix(categoryKind, sortKind);
      return `/playlist?list=${playlistPrefix}${channelId.slice(2)}&playnext=1`;
    } else {
      return "";
    }
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

function resolvePlaylistPrefix(
  categoryKind: CategoryKind,
  sortKind: SortKind,
): string {
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
}

async function getOldestItemId(
  channelUrl: string,
  categoryKind: CategoryKind,
): Promise<string> {
  const htmlRes = await fetch(`${channelUrl}/${categoryKind.toLowerCase()}`);
  const html = await htmlRes.text();
  const clientVersion = html.match(/"clientVersion":"(.*?)"/)![1];
  const ytInitialData = JSON.parse(
    html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});/)![1],
  ) as YtInitialData;
  const continuationToken = extractContinuationToken(
    ytInitialData,
    categoryKind,
    "Oldest",
  );

  const jsonRes = await fetch("https://www.youtube.com/youtubei/v1/browse", {
    method: "POST",
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: clientVersion,
        },
      },
      continuation: continuationToken,
    }),
  });
  const browseResponse = (await jsonRes.json()) as BrowseResponse;

  const itemsData = browseResponse.onResponseReceivedActions.find(
    (action) =>
      action.reloadContinuationItemsCommand.slot ===
      "RELOAD_CONTINUATION_SLOT_BODY",
  )!;
  const topVideoId = JSON.stringify(itemsData)
    .match(/"videoId":"(.*?)"/i)
    ?.at(1);

  return topVideoId!;
}

function extractContinuationToken(
  ytInitialData: YtInitialData,
  category: CategoryKind,
  sortKind: SortKind,
) {
  const tabRenderers =
    ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs.map(
      (tab) => tab.tabRenderer,
    );
  const categoryTabRenderer = tabRenderers.find((tab) =>
    tab.endpoint.commandMetadata.webCommandMetadata.url.endsWith(
      category.toLowerCase(),
    ),
  )!;
  const rendererHeader = categoryTabRenderer.content.richGridRenderer.header;
  const tokens = Array.from(
    JSON.stringify(rendererHeader)
      .matchAll(/"token":"(.*?)"/g)
      .map((match) => match[1]),
  );
  const [latestVideoToken, popularVideoToken, oldestVideoToken] = tokens;
  switch (sortKind) {
    case "Latest":
      return latestVideoToken;
    case "Popular":
      return popularVideoToken;
    case "Oldest":
      return oldestVideoToken;
  }
}

type YtInitialData = {
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: Array<{
        tabRenderer: {
          endpoint: {
            commandMetadata: {
              webCommandMetadata: {
                url: string;
              };
            };
          };
          content: {
            richGridRenderer: {
              header: object;
            };
          };
        };
      }>;
    };
  };
};

type BrowseResponse = {
  onResponseReceivedActions: Array<{
    reloadContinuationItemsCommand: {
      slot: "RELOAD_CONTINUATION_SLOT_HEADER" | "RELOAD_CONTINUATION_SLOT_BODY";
    };
  }>;
};
