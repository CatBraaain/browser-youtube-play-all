import { errors, expect, type Page, type Route } from "@playwright/test";

import { ytTest } from "../fixture";
import { YtChannelPage } from "../utils";

// Synthetic channel pages served under https://synthetic.test — no live
// YouTube. Chip clicks mimic YouTube's sort flow (YT-SPEC.md): the chip carries
// a continuation token (chip-view-model data), the click issues one real
// /youtubei/v1/browse POST whose body carries that token, and the grid
// re-renders from the response's videos. Responses are served by a Playwright
// route so the helper observes actual network traffic.
type ChipScript = {
  token: string | null;
  unrelatedResponse?: { continuation: string; atMs: number };
  preResponseRerender?: { atMs: number; videoIds: string[] };
  matchedResponse?: { atMs: number; renderIds?: string[] | null };
};

// Chips sit inside chip-view-model hosts whose data carries the tap command,
// like the real sort chip bar.
const chipsHtml = ["Latest", "Popular", "Oldest"]
  .map(
    (label, i) =>
      `<chip-view-model><button aria-selected="${i === 0}" style="display:inline-block;padding:8px 16px">${label}</button></chip-view-model>`,
  )
  .join("");

const sortPage = (
  scripts: Record<number, ChipScript>,
  chips = chipsHtml,
) => `<!doctype html><html><body style="margin:0">
<ytd-browse page-subtype="channels" role="main">
  <div id="primary">
    <div id="sort">${chips}</div>
    <div id="contents"><a href="/watch?v=AAAAAAAAAAA">Original</a></div>
  </div>
</ytd-browse>
<script>
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const renderGrid = (ids) => {
    document.querySelector("#contents").innerHTML = ids
      .map((id) => \`<a href="/watch?v=\${id}">Sorted \${id}</a>\`)
      .join("");
  };
  const browse = (continuation) =>
    fetch("/youtubei/v1/browse", {
      method: "POST",
      body: JSON.stringify({ continuation }),
    }).then((res) => res.json());

  document.querySelectorAll("#sort button").forEach((button, index) => {
    const script = ${JSON.stringify(scripts)}[String(index)] ?? {};
    // The chip's tap command with its continuation token, on the
    // chip-view-model host like the real chip bar.
    const host = button.closest("chip-view-model");
    host.data = script.token === null
      ? { tapCommand: { innertubeCommand: {} } }
      : { tapCommand: { innertubeCommand: { continuationCommand: { token: script.token } } } };
    button.addEventListener("click", () => {
      if (script.unrelatedResponse) {
        sleep(script.unrelatedResponse.atMs).then(() =>
          browse(script.unrelatedResponse.continuation),
        );
      }
      if (script.preResponseRerender) {
        sleep(script.preResponseRerender.atMs).then(() =>
          renderGrid(script.preResponseRerender.videoIds),
        );
      }
      if (script.matchedResponse) {
        const m = script.matchedResponse;
        sleep(m.atMs)
          .then(() => browse(script.token))
          .then((json) => {
            if (m.renderIds !== null) renderGrid(m.renderIds ?? json.videos.map((v) => v.videoId));
          });
      }
    });
  });
</script>
</body></html>`;

const routePage = (body: string) => async (route: Route) => {
  await route.fulfill({ contentType: "text/html", body });
};

// Serves /youtubei/v1/browse POSTs with the requested videos. Register after
// the /** page route: the most recently registered route wins.
const browseRoute =
  (responses: Record<string, { videoIds: string[]; delayMs?: number }> = {}) =>
  async (route: Route) => {
    const body = route.request().postDataJSON() as { continuation: string };
    const response = responses[body.continuation] ?? { videoIds: ["XXXXXXXXXXX"] };
    if (response.delayMs) await new Promise((r) => setTimeout(r, response.delayMs));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ videos: response.videoIds.map((videoId) => ({ videoId })) }),
    });
  };

// Playwright's Page keeps an internal event-listener registry; listenerCount
// reads it (playwright-core uses it itself) but it is absent from the public
// types, hence the narrow cast.
const responseListenerCount = (page: Page) =>
  (page as unknown as { listenerCount(event: string): number }).listenerCount("response");

const latestOnly =
  '<button aria-selected="true" style="display:inline-block;padding:8px 16px">Latest</button>';

ytTest(
  "waits for the first video to be replaced, not an unrelated link insertion",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          2: {
            token: "sort-oldest",
            preResponseRerender: { atMs: 100, videoIds: ["AAAAAAAAAAA"] },
            matchedResponse: { atMs: 0 },
          },
        }),
      ),
    );
    await page.route(
      "https://synthetic.test/youtubei/v1/browse",
      browseRoute({ "sort-oldest": { videoIds: ["BBBBBBBBBBB"], delayMs: 2_000 } }),
    );
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    let completed = false;
    const sorting = channel.navigateToSort("Oldest").then(() => {
      completed = true;
    });
    await page.waitForTimeout(1_500);
    expect(completed).toBe(false);
    await sorting;
    await expect(page.locator("#contents a").first()).toHaveAttribute(
      "href",
      "/watch?v=BBBBBBBBBBB",
    );
  },
);

ytTest(
  "waits for a re-click to replace the video node even when its href is unchanged",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          0: { token: "sort-latest", matchedResponse: { atMs: 20 } },
        }),
      ),
    );
    await page.route(
      "https://synthetic.test/youtubei/v1/browse",
      browseRoute({ "sort-latest": { videoIds: ["AAAAAAAAAAA"] } }),
    );
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToSort("Latest");
    await expect(page.locator("#contents a").first()).toHaveText("Sorted AAAAAAAAAAA");
  },
);

ytTest(
  "an unrelated browse response plus an old-grid re-render does not complete the sort",
  async ({ page, eventWatcher }) => {
    // The M2 hole: an unrelated /youtubei/v1/browse response (different
    // continuation) resolves while the OLD sort's grid re-renders. Only the
    // click's own response (matched by the chip's continuation token) may
    // complete the wait.
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          2: {
            token: "sort-oldest",
            unrelatedResponse: { continuation: "unrelated", atMs: 200 },
            preResponseRerender: { atMs: 400, videoIds: ["AAAAAAAAAAA"] },
            matchedResponse: { atMs: 0 },
          },
        }),
      ),
    );
    await page.route(
      "https://synthetic.test/youtubei/v1/browse",
      browseRoute({
        unrelated: { videoIds: ["CCCCCCCCCCC"] },
        "sort-oldest": { videoIds: ["BBBBBBBBBBB"], delayMs: 3_000 },
      }),
    );
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    let completed = false;
    const sorting = channel.navigateToSort("Oldest", { timeout: 10_000 }).then(() => {
      completed = true;
    });
    await page.waitForTimeout(1_600);
    expect(completed).toBe(false);
    await sorting;
    await expect(page.locator("#contents a").first()).toHaveAttribute(
      "href",
      "/watch?v=BBBBBBBBBBB",
    );
  },
);

ytTest(
  "fails closed when no browse response matches the chip's continuation token",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          2: {
            token: "sort-oldest",
            unrelatedResponse: { continuation: "unrelated", atMs: 100 },
            preResponseRerender: { atMs: 300, videoIds: ["AAAAAAAAAAA"] },
          },
        }),
      ),
    );
    await page.route(
      "https://synthetic.test/youtubei/v1/browse",
      browseRoute({ unrelated: { videoIds: ["CCCCCCCCCCC"] } }),
    );
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await expect(channel.navigateToSort("Oldest", { timeout: 1_200 })).rejects.toThrow(
      /continuation token|sort/i,
    );
  },
);

ytTest(
  "fails closed when the sort chip exposes no continuation token",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          1: { token: null, matchedResponse: { atMs: 20 } },
        }),
      ),
    );
    await page.route("https://synthetic.test/youtubei/v1/browse", browseRoute());
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await expect(channel.navigateToSort("Popular", { timeout: 2_000 })).rejects.toThrow(
      /no continuation token|token/i,
    );
    expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
  },
);

ytTest(
  "rejects a matching sort response with invalid JSON after an old-grid replacement",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          2: {
            token: "sort-oldest",
            preResponseRerender: { atMs: 100, videoIds: ["AAAAAAAAAAA"] },
            matchedResponse: { atMs: 0, renderIds: ["AAAAAAAAAAA"] },
          },
        }),
      ),
    );
    await page.route("https://synthetic.test/youtubei/v1/browse", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{" });
    });
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    const baseline = responseListenerCount(page);
    await expect(channel.navigateToSort("Oldest")).rejects.toThrow(
      /sort.*invalid|invalid.*sort|sort.*unreadable|unreadable.*sort/i,
    );
    expect(responseListenerCount(page)).toBe(baseline);
    expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
  },
);

ytTest(
  "rejects a matching sort response without video IDs after an old-grid replacement",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          2: {
            token: "sort-oldest",
            preResponseRerender: { atMs: 100, videoIds: ["AAAAAAAAAAA"] },
            matchedResponse: { atMs: 0, renderIds: ["AAAAAAAAAAA"] },
          },
        }),
      ),
    );
    await page.route("https://synthetic.test/youtubei/v1/browse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ videos: [] }),
      });
    });
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    const baseline = responseListenerCount(page);
    await expect(channel.navigateToSort("Oldest")).rejects.toThrow(/sort.*missing video IDs/i);
    expect(responseListenerCount(page)).toBe(baseline);
    expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
  },
);

for (const videoId of ["", " \t "]) {
  ytTest(
    `rejects a matching sort response with unusable video ID ${JSON.stringify(videoId)}`,
    async ({ page, eventWatcher }) => {
      await page.route(
        "https://synthetic.test/**",
        routePage(
          sortPage({
            2: { token: "sort-oldest", matchedResponse: { atMs: 0 } },
          }),
        ),
      );
      await page.route("https://synthetic.test/youtubei/v1/browse", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ videos: [{ videoId }] }),
        });
      });
      await page.goto("https://synthetic.test/@example/videos");

      const channel = new YtChannelPage("@example", page, eventWatcher);
      const baseline = responseListenerCount(page);
      await expect(channel.navigateToSort("Oldest")).rejects.toThrow(/sort.*missing video IDs/i);
      expect(responseListenerCount(page)).toBe(baseline);
      expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
    },
  );
}

ytTest(
  "a matched response whose videos are not rendered does not complete the sort",
  async ({ page, eventWatcher }) => {
    // Response identity alone is not enough: if the grid never comes to show
    // the matched response's videos (here it re-renders the OLD ids instead),
    // the applied state is unproven and the wait must fail closed.
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage({
          1: { token: "sort-popular", matchedResponse: { atMs: 100, renderIds: ["AAAAAAAAAAA"] } },
        }),
      ),
    );
    await page.route(
      "https://synthetic.test/youtubei/v1/browse",
      browseRoute({ "sort-popular": { videoIds: ["BBBBBBBBBBB"] } }),
    );
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await expect(channel.navigateToSort("Popular", { timeout: 1_800 })).rejects.toBeInstanceOf(
      errors.TimeoutError,
    );
  },
);

ytTest("disposes the grid watch after a completed sort", async ({ page, eventWatcher }) => {
  await page.route(
    "https://synthetic.test/**",
    routePage(
      sortPage({
        1: { token: "sort-popular", matchedResponse: { atMs: 20 } },
      }),
    ),
  );
  await page.route(
    "https://synthetic.test/youtubei/v1/browse",
    browseRoute({ "sort-popular": { videoIds: ["BBBBBBBBBBB"] } }),
  );
  await page.goto("https://synthetic.test/@example/videos");

  const channel = new YtChannelPage("@example", page, eventWatcher);
  await channel.navigateToSort("Popular");
  expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
});

ytTest("disposes the grid watch when the sort chip is missing", async ({ page, eventWatcher }) => {
  // Only the Latest chip exists, so the Popular click fails before any wait.
  await page.route(
    "https://synthetic.test/**",
    routePage(
      sortPage(
        {
          0: { token: "sort-latest", matchedResponse: { atMs: 20 } },
        },
        latestOnly,
      ),
    ),
  );
  await page.route("https://synthetic.test/youtubei/v1/browse", browseRoute());
  await page.goto("https://synthetic.test/@example/videos");

  const channel = new YtChannelPage("@example", page, eventWatcher);
  await expect(channel.navigateToSort("Popular", { timeout: 500 })).rejects.toThrow();
  expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
});

ytTest(
  "no armed response listener or unhandled rejection leaks when the click fails before the response wait",
  async ({ page, eventWatcher }) => {
    // F4: the response wait is armed before the click; a failing click must
    // not leave it behind — neither as a listener that stays armed until its
    // own deadline nor as a later unhandled rejection attributed to an
    // arbitrary point.
    const chipsWithHiddenPopular = ["Latest", "Popular", "Oldest"]
      .map(
        (label, i) =>
          `<chip-view-model><button aria-selected="${i === 0}" style="display:${
            label === "Popular" ? "none" : "inline-block"
          };padding:8px 16px">${label}</button></chip-view-model>`,
      )
      .join("");
    await page.route(
      "https://synthetic.test/**",
      routePage(
        sortPage(
          { 1: { token: "sort-popular", matchedResponse: { atMs: 20 } } },
          chipsWithHiddenPopular,
        ),
      ),
    );
    await page.route("https://synthetic.test/youtubei/v1/browse", browseRoute());
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    const baseline = responseListenerCount(page);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(channel.navigateToSort("Popular", { timeout: 600 })).rejects.toThrow();
      // The invocation's own response listener is gone at exit, not left
      // armed until the deadline.
      expect(responseListenerCount(page)).toBe(baseline);
      // Wait past the armed response wait's own deadline: with the leak, its
      // rejection would surface here as an unhandled rejection.
      await page.waitForTimeout(1_500);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
  },
);

ytTest(
  "navigateToSort cleans up its response watcher when the page closes mid-sort",
  async ({ page, eventWatcher }) => {
    // Page close is one of the exits: the response watcher must not outlive
    // the invocation, nothing may reject late, and the surfaced error must
    // come from the sort operation, never from disposing the grid watch on
    // the closed page.
    let releaseBrowseRoute!: () => void;
    const holdBrowseRoute = new Promise<void>((resolve) => {
      releaseBrowseRoute = resolve;
    });
    await page.route(
      "https://synthetic.test/**",
      routePage(sortPage({ 1: { token: "sort-popular", matchedResponse: { atMs: 0 } } })),
    );
    await page.route("https://synthetic.test/youtubei/v1/browse", async (route) => {
      const requestBody = route.request().postDataJSON() as { continuation: string };
      if (requestBody.continuation !== "sort-popular") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ videos: [{ videoId: "XXXXXXXXXXX" }] }),
        });
        return;
      }
      await holdBrowseRoute;
      // Closing the page may dispose the route before this abort runs.
      await route.abort().catch(() => {});
    });
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    const baseline = responseListenerCount(page);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const matchingBrowseRequest = page.waitForRequest(
      (request) =>
        request.url() === "https://synthetic.test/youtubei/v1/browse" &&
        request.method() === "POST" &&
        (request.postDataJSON() as { continuation: string }).continuation === "sort-popular",
    );
    // Request dispatch and Playwright's click acknowledgement can interleave.
    // Preserve the operation's rejection rather than assuming which one wins.
    const sorting = channel.navigateToSort("Popular", { timeout: 1_500 }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    );
    try {
      // The matching request proves the click handler dispatched its browse.
      await matchingBrowseRequest;
      await page.close();
      releaseBrowseRoute();

      const sortError = await sorting;
      if (!(sortError instanceof Error)) {
        throw new Error("Expected the sort operation to reject after page close");
      }
      if (sortError instanceof errors.TimeoutError) {
        expect(sortError.message).toMatch(
          /No \/youtubei\/v1\/browse response matched.*continuation token/i,
        );
      } else {
        expect(sortError.message).toMatch(/^locator\.click:/i);
        expect(sortError.message).toMatch(/closed/i);
        expect(sortError.message).not.toMatch(/page\.evaluate|disposeGridSwapWatch/i);
      }
      expect(responseListenerCount(page)).toBe(baseline);
      // Past the abandoned deadline nothing rejects late.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      expect(unhandled).toEqual([]);
    } finally {
      releaseBrowseRoute();
      if (!page.isClosed()) await page.close();
      process.off("unhandledRejection", onUnhandled);
    }
  },
);

ytTest("disposes the grid watch when the swap wait times out", async ({ page, eventWatcher }) => {
  await page.route(
    "https://synthetic.test/**",
    routePage(sortPage({ 2: { token: "sort-oldest" } })),
  );
  await page.route(
    "https://synthetic.test/youtubei/v1/browse",
    browseRoute({ "sort-oldest": { videoIds: ["BBBBBBBBBBB"] } }),
  );
  await page.goto("https://synthetic.test/@example/videos");

  const channel = new YtChannelPage("@example", page, eventWatcher);
  await expect(channel.navigateToSort("Oldest", { timeout: 800 })).rejects.toBeInstanceOf(
    errors.TimeoutError,
  );
  expect(await page.evaluate(() => (window as any).__gridSwapWatch)).toBeUndefined();
});
