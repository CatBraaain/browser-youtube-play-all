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
