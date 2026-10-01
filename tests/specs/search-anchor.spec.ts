import { expect } from "@playwright/test";

import { ytTest } from "../fixture";
import { YtSearchPage } from "../utils";

// Synthetic search-result pages served under https://www.youtube.com via
// Playwright routing — no live YouTube. They exercise the real anchor-click
// retry path (YtSearchPage.clickChannelThumbnailButton) against a DOM that
// mimics YouTube's swallowed/slow router behavior.
const resultsPage = (options: {
  startDelayMs?: number;
  swallowFirstClicks?: number;
}) => `<!doctype html><html><body>
<a id="channel-thumbnail" href="/@example">Channel</a>
<script>
  window.__clicks = 0;
  const swallowsLeft = () => (window.__swallowsLeft ??= ${options.swallowFirstClicks ?? 0});
  document.querySelector("#channel-thumbnail").addEventListener("click", (e) => {
    e.preventDefault();
    window.__clicks++;
    if (swallowsLeft() > 0) {
      // A swallowed click: no navigation event, no URL movement.
      window.__swallowsLeft--;
      return;
    }
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("yt-navigate-start", { bubbles: true }));
      history.pushState({}, "", "/@example");
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
    }, ${options.startDelayMs ?? 0});
  });
</script>
</body></html>`;

ytTest(
  "a search-anchor click whose transition starts late is never re-clicked",
  async ({ page, eventWatcher }) => {
    // The anchor's transition starts (event + URL) later than a short
    // swallowed-click window keyed on URL movement alone would tolerate —
    // the same bound the category-tab path guarantees (F6): while no start
    // signal has appeared, retry; once one appears, never click again.
    await page.route("https://www.youtube.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: resultsPage({ startDelayMs: 5_500 }),
      }),
    );
    await page.goto("https://www.youtube.com/results?search_query=example");

    const search = new YtSearchPage(page, eventWatcher);
    await search.clickChannelThumbnailButton("@example");
    await expect(page).toHaveURL(/youtube\.com\/@example\/?$/);
    expect(await page.evaluate(() => (window as any).__clicks)).toBe(1);
  },
);

ytTest(
  "a swallowed search-anchor click is retried until the transition starts",
  async ({ page, eventWatcher }) => {
    await page.route("https://www.youtube.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: resultsPage({ swallowFirstClicks: 2 }),
      }),
    );
    await page.goto("https://www.youtube.com/results?search_query=example");

    const search = new YtSearchPage(page, eventWatcher);
    await search.clickChannelThumbnailButton("@example");
    await expect(page).toHaveURL(/youtube\.com\/@example\/?$/);
    expect(await page.evaluate(() => (window as any).__clicks)).toBe(3);
  },
);

const channelNameResultsPage = () => `<!doctype html><html><head>
<style>#channel-name { display: inline-block; } #channel-name a { display: block; }</style>
</head><body>
<a href="/@Apple">Outside channel link</a>
<div id="channel-info">
  <div id="channel-name"><a href="/@AppleTrack">AppleTrack</a></div>
  <div id="channel-name"><a href="/@Apple">Apple</a></div>
</div>
<script>
  window.__clickedHrefs = [];
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor) return;
    event.preventDefault();
    window.__clickedHrefs.push(anchor.getAttribute("href"));
    document.dispatchEvent(new CustomEvent("yt-navigate-start", { bubbles: true }));
    history.pushState({}, "", anchor.getAttribute("href"));
    document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
  });
  document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
</script>
</body></html>`;

for (const { title, channelName, expectedHref } of [
  {
    title: "soft2 selects the exact channel handle instead of a prefix-sharing result",
    channelName: "@Apple",
    expectedHref: "/@Apple",
  },
  {
    title: "soft2 without a channel handle keeps selecting the first channel name",
    channelName: null,
    expectedHref: "/@AppleTrack",
  },
]) {
  ytTest(title, async ({ page, eventWatcher }) => {
    await page.route("https://www.youtube.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelNameResultsPage() }),
    );
    const loadSince = await eventWatcher.captureNavigationBaseline("yt-navigate-finish");
    await page.goto("https://www.youtube.com/results?search_query=%40Apple");
    await eventWatcher.waitForNavigationEnd({
      since: loadSince,
      expectedUrl: { pathname: "/results", searchParams: { search_query: "@Apple" } },
    });

    const search = new YtSearchPage(page, eventWatcher);
    await expect(search.topVideoChannelNameButton(channelName).locator("a")).toHaveAttribute(
      "href",
      expectedHref,
    );
    const startSince = await eventWatcher.captureNavigationBaseline("yt-navigate-start");
    const endSince = await eventWatcher.captureNavigationBaseline("yt-navigate-finish");

    await search.navigateToChannel(channelName, "soft2");

    await expect(page).toHaveURL(`https://www.youtube.com${expectedHref}`);
    expect(await page.evaluate(() => (window as any).__clickedHrefs)).toEqual([expectedHref]);
    const startAfter = await eventWatcher.captureNavigationBaseline("yt-navigate-start");
    const endAfter = await eventWatcher.captureNavigationBaseline("yt-navigate-finish");
    expect(startAfter.docId).toBe(startSince.docId);
    expect(endAfter.docId).toBe(endSince.docId);
    expect(startAfter.count).toBe(startSince.count + 1);
    expect(endAfter.count).toBe(endSince.count + 1);
  });
}
