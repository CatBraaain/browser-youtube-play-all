import { errors, expect, type Route } from "@playwright/test";

import { ytTest } from "../fixture";
import { YtSearchPage } from "../utils";

// The results-URL expectation must validate the parsed URL's pathname and
// search_query value, not a leading regex: the observed mobile results URL
// carries an extra leading parameter (…/results?sp=mAEA&search_query=%40Apple),
// so parameter order cannot be assumed (F2).
const fulfill = (body: string) => (route: Route) =>
  route.fulfill({ contentType: "text/html", body });

ytTest(
  "a parsed-URL expectation matches reordered and extra query parameters",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", fulfill("<html><body>results</body></html>"));
    await page.goto("https://synthetic.test/results?sp=mAEA&search_query=%40Apple");

    const since = await eventWatcher.captureNavigationBaseline();
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
    );
    await eventWatcher.waitForNavigationEnd({
      since,
      expectedUrl: { pathname: "/results", searchParams: { search_query: "@Apple" } },
      timeout: 2_000,
    });
  },
);

ytTest("a parsed-URL expectation matches encoded query values", async ({ page, eventWatcher }) => {
  await page.route("https://synthetic.test/**", fulfill("<html><body>results</body></html>"));
  await page.goto("https://synthetic.test/results?search_query=%40Apple&foo=bar");

  const since = await eventWatcher.captureNavigationBaseline();
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
  );
  await eventWatcher.waitForNavigationEnd({
    since,
    expectedUrl: { pathname: "/results", searchParams: { search_query: "@Apple" } },
    timeout: 2_000,
  });
});

ytTest(
  "a parsed-URL expectation still rejects a genuine wrong query value",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", fulfill("<html><body>results</body></html>"));
    await page.goto("https://synthetic.test/results?search_query=banana");

    const since = await eventWatcher.captureNavigationBaseline();
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
    );
    await expect(
      eventWatcher.waitForNavigationEnd({
        since,
        expectedUrl: { pathname: "/results", searchParams: { search_query: "@Apple" } },
        timeout: 700,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);
  },
);

ytTest("a parsed-URL expectation rejects the wrong pathname", async ({ page, eventWatcher }) => {
  await page.route("https://synthetic.test/**", fulfill("<html><body>watch</body></html>"));
  await page.goto("https://synthetic.test/watch?v=abc&search_query=%40Apple");

  const since = await eventWatcher.captureNavigationBaseline();
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
  );
  await expect(
    eventWatcher.waitForNavigationEnd({
      since,
      expectedUrl: { pathname: "/results", searchParams: { search_query: "@Apple" } },
      timeout: 700,
    }),
  ).rejects.toBeInstanceOf(errors.TimeoutError);
});

// Through the real helper: the results URL can carry a leading extra
// parameter; the soft-search wait must still complete on it.
const homePage = (resultsUrl: string) => `<!doctype html><html><body>
<input class="yt-searchbox-input" type="text">
<script>
  document.querySelector("input").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    document.dispatchEvent(new CustomEvent("yt-navigate-start", { bubbles: true }));
    history.pushState({}, "", ${JSON.stringify(resultsUrl)});
    document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
  });
  document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));
</script>
</body></html>`;

ytTest(
  "search completes when the results URL carries a leading extra parameter",
  async ({ page, eventWatcher }) => {
    await page.route(
      "https://www.youtube.com/**",
      fulfill(homePage("/results?sp=mAEA&search_query=%40Apple")),
    );
    await page.goto("https://www.youtube.com");

    const search = new YtSearchPage(page, eventWatcher);
    await search.search("@Apple", "soft");
    await expect(page).toHaveURL(/\/results\?/);
  },
);
