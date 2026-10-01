import { expect } from "@playwright/test";

import { ytTest } from "../fixture";
import { YtChannelPage } from "../utils";

// Synthetic channel pages served under https://synthetic.test — no live
// YouTube. Tabs mimic YT-SPEC.md: yt-tab-shape elements with a localized
// tab-title, no href, whose identity is only exposed by the parent data model
// (ytInitialData.contents.*BrowseResultsRenderer.tabs[].tabRenderer.endpoint
// .commandMetadata.webCommandMetadata.url). A tab click runs the SPA flow:
// yt-navigate-start, pushState, yt-navigate-finish. The initial load fires
// yt-navigate-finish once, like a real hard load.
const channelPage = (options: {
  tabs: { label: string; slug: string }[];
  swallowFirstClick?: boolean;
  startDelayMs?: number;
  loadEndDelayMs?: number;
  withDataModel?: boolean;
  // Mimic SPA arrival observed on live YouTube: a hidden stale ytd-browse
  // (the previously routed page, e.g. home) stays first in the document while
  // ytInitialData keeps the initial hard load's model, and the current
  // channels ytd-browse carries its tab model on element .data — optionally
  // attaching late (the current page's model can lag the landing).
  staleInitialModel?: boolean;
  channelDataDelayMs?: number;
}) => {
  const tabs = options.tabs
    .map(
      ({ label, slug }) =>
        `<yt-tab-shape role="tab" data-slug="${slug}" style="display:inline-block;padding:8px 16px;border:1px solid #888">${label}</yt-tab-shape>`,
    )
    .join("");
  const homeModel = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              title: "home",
              endpoint: { commandMetadata: { webCommandMetadata: { url: "/" } } },
            },
          },
        ],
      },
    },
  };
  return `<!doctype html><html><body style="margin:0">
<ytd-browse page-subtype="${options.staleInitialModel ? "home" : "channels"}" role="main"${options.staleInitialModel ? " hidden" : ""}><div id="primary">
<div id="tab-bar">${options.staleInitialModel ? "" : tabs}</div>
<div id="contents"><a href="/watch?v=AAAAAAAAAAA">Original</a></div>
</div></ytd-browse>
${
  options.staleInitialModel
    ? `<ytd-browse page-subtype="channels" role="main"><div id="primary">
<div id="tab-bar">${tabs}</div>
<div id="contents"><a href="/watch?v=AAAAAAAAAAA">Original</a></div>
</div></ytd-browse>`
    : ""
}
<script>
  window.__clicks = {};
  const swallowsLeft = () => (window.__swallowsLeft ??= ${options.swallowFirstClick ? 1 : 0});
  ${
    options.withDataModel === false
      ? ""
      : `window.ytInitialData = ${
          options.staleInitialModel
            ? `JSON.parse(${JSON.stringify(JSON.stringify(homeModel))})`
            : `{ contents: { twoColumnBrowseResultsRenderer: { tabs: ${JSON.stringify(
                options.tabs,
              )}.map(({ slug }) => ({
                tabRenderer: {
                  title: slug,
                  selected: slug === "videos",
                  endpoint: { commandMetadata: { webCommandMetadata: { url: "/@example/" + slug } } },
                },
              })) } } }`
        };`
  }
  const channelModel = () => ({ contents: { twoColumnBrowseResultsRenderer: { tabs: ${JSON.stringify(
    options.tabs,
  )}.map(({ slug }) => ({
    tabRenderer: {
      title: slug,
      selected: slug === "videos",
      endpoint: { commandMetadata: { webCommandMetadata: { url: "/@example/" + slug } } },
    },
  })) } } });
  ${
    options.staleInitialModel
      ? `const channelBrowse = document.querySelector('ytd-browse[page-subtype="channels"]');
  if (channelBrowse) {
    const attach = () => { channelBrowse.data = channelModel(); };
    ${options.channelDataDelayMs ? `setTimeout(attach, ${options.channelDataDelayMs});` : "attach();"}
  }`
      : ""
  }
  ${
    options.staleInitialModel
      ? `document.querySelector('ytd-browse[page-subtype="home"]').data = window.ytInitialData;`
      : ""
  }
  document.querySelectorAll("yt-tab-shape").forEach((tab) => {
    tab.addEventListener("click", () => {
      const slug = tab.dataset.slug;
      window.__clicks[slug] = (window.__clicks[slug] ?? 0) + 1;
      if (swallowsLeft() > 0) {
        // A swallowed click like YouTube's router drop window: no pushState,
        // no navigation event. Only the first click is swallowed.
        window.__swallowsLeft--;
        return;
      }
      window.__tabNavigated = true;
      document.dispatchEvent(new CustomEvent("yt-navigate-start", { bubbles: true }));
      setTimeout(() => {
        history.pushState({}, "", slug ? \`/@example/\${slug}\` : "/@example");
        document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
      }, ${options.startDelayMs ?? 0});
    });
  });
  // The initial hard load fires navigation-end once, like YouTube.
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
  }, ${options.loadEndDelayMs ?? 0});
</script>
</body></html>`;
};

const tabs = [
  { label: "ホーム", slug: "" },
  { label: "動画", slug: "videos" },
  { label: "ショート", slug: "shorts" },
  { label: "ライブ", slug: "streams" },
];

ytTest(
  "navigateToCategory retries a swallowed category-tab click until the page lands",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: channelPage({ tabs, swallowFirstClick: true }),
      }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Shorts", "soft");
    await expect(page).toHaveURL(/\/@example\/shorts\/?$/);
    // Only the Shorts tab was ever clicked — no candidate-tab walking.
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({ shorts: 2 });
  },
);

ytTest(
  "navigateToCategory targets the category tab from the data model when the tab order differs",
  async ({ page, eventWatcher }) => {
    // Videos and Shorts swapped: index-based targeting would click the Videos
    // tab for the Shorts category, then walk other tabs to recover.
    const swapped: { label: string; slug: string }[] = [tabs[0]!, tabs[2]!, tabs[1]!, tabs[3]!];
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelPage({ tabs: swapped }) }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Shorts", "soft");
    await expect(page).toHaveURL(/\/@example\/shorts\/?$/);
    await channel.navigateToCategory("Videos", "soft");
    await expect(page).toHaveURL(/\/@example\/videos\/?$/);
    // Exactly one click per category, on the right tabs.
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({ shorts: 1, videos: 1 });
  },
);

ytTest(
  "navigateToCategory resolves the tab when the matching endpoint is the model's first tab",
  async ({ page, eventWatcher }) => {
    // The readiness poll resolves only on truthy returns: a bare numeric
    // tab index of 0 would read as "not ready" and the gate would fail
    // closed on a model that does match. Shorts is the model's first tab
    // here (tab order varies across channels, YT-SPEC.md unknowns).
    const shortsFirst: { label: string; slug: string }[] = [tabs[2]!, tabs[0]!, tabs[1]!, tabs[3]!];
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelPage({ tabs: shortsFirst }) }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Shorts", "soft");
    await expect(page).toHaveURL(/\/@example\/shorts\/?$/);
    // One click on the right tab — no trial navigation of other tabs.
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({ shorts: 1 });
  },
);

ytTest(
  "navigateToCategory never re-clicks a tab whose navigation started but is slow",
  async ({ page, eventWatcher }) => {
    // The transition starts (event + URL) later than a swallowed-click retry
    // window keyed on URL movement alone would tolerate.
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: channelPage({ tabs, startDelayMs: 5_500 }),
      }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Shorts", "soft");
    await expect(page).toHaveURL(/\/@example\/shorts\/?$/);
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({ shorts: 1 });
  },
);

ytTest(
  "navigateToCategory waits for the pending load's navigation-end on an already-matched URL",
  async ({ page, eventWatcher }) => {
    // M1: the URL matches at entry, but the initial load's navigation-end has
    // not fired yet (router not ready). The helper must not return early: it
    // waits until the load's end fires, so a follow-up click is not dropped.
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: channelPage({ tabs, loadEndDelayMs: 1_500 }),
      }),
    );
    await page.goto("https://synthetic.test/@example/videos");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    const startedAt = Date.now();
    await channel.navigateToCategory("Videos", "soft");
    // The helper returned only after the load's end event (>= the 1.5s delay).
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_000);
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({});
  },
);

ytTest(
  "navigateToCategory performs the hard navigation even when the URL already matches",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelPage({ tabs }) }),
    );
    await page.goto("https://synthetic.test/@example/videos");
    const originDoc = await page.evaluate(() => performance.timeOrigin);

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Videos", "hard");
    // A hard navigation re-commits the document (new timeOrigin) instead of
    // returning early on the matching URL, and lands on the same route.
    const reloadedDoc = await page.evaluate(() => performance.timeOrigin);
    expect(reloadedDoc).not.toBe(originDoc);
    await expect(page).toHaveURL(/\/@example\/videos\/?$/);
  },
);

ytTest(
  "navigateToCategory resolves the tab from the current page's model when the initial model is stale",
  async ({ page, eventWatcher }) => {
    // F1 live failure: after a soft channel arrival the document holds a
    // hidden stale browse of the previously routed page (home) first, and
    // ytInitialData still carries the initial hard load's model. Neither has
    // the channel's tab endpoints; the current channels browse carries them
    // on element .data. A first-match read or an any-array readiness gate
    // resolves the stale model and fails with URLs [null].
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: channelPage({ tabs, staleInitialModel: true }),
      }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Shorts", "soft");
    await expect(page).toHaveURL(/\/@example\/shorts\/?$/);
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({ shorts: 1 });
  },
);

ytTest(
  "navigateToCategory keeps waiting until the current page's model attaches",
  async ({ page, eventWatcher }) => {
    // The current routed page's tab model can attach after the landing: the
    // gate must wait for a model that matches the expected endpoint, not
    // accept the first array-shaped (stale) model and fail on [null] URLs.
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: channelPage({ tabs, staleInitialModel: true, channelDataDelayMs: 1_500 }),
      }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    const startedAt = Date.now();
    await channel.navigateToCategory("Videos", "soft");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_200);
    await expect(page).toHaveURL(/\/@example\/videos\/?$/);
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({ videos: 1 });
  },
);

ytTest(
  "navigateToCategory fails closed when no tab data model is present",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: channelPage({ tabs, withDataModel: false }),
      }),
    );
    await page.goto("https://synthetic.test/@example");

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await expect(channel.navigateToCategory("Shorts", "soft", false)).rejects.toThrow(
      /tab|endpoint|data model/i,
    );
    // No tab was clicked while failing.
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({});
  },
);

ytTest(
  "navigateToCategory is a no-op when the page already settled on the category",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelPage({ tabs }) }),
    );
    await page.goto("https://synthetic.test/@example/videos");
    // Let the load's end fire and settle before the no-op call.
    await page.waitForTimeout(300);

    const channel = new YtChannelPage("@example", page, eventWatcher);
    await channel.navigateToCategory("Videos", "soft");
    expect(await page.evaluate(() => (window as any).__tabNavigated)).toBeUndefined();
    expect(await page.evaluate(() => (window as any).__clicks)).toEqual({});
  },
);
