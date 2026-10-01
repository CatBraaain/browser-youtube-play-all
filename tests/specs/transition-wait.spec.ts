import { errors, expect, type Page, type Route } from "@playwright/test";

import { ytTest } from "../fixture";

// Synthetic pages served under https://synthetic.test — no live YouTube. The
// route must be installed before goto so the fixture's init scripts
// (window.__ytSync) run in each committed document.
const fulfill = (html: string) => (route: Route) =>
  route.fulfill({ contentType: "text/html", body: html });

const blank = "<html><body>blank</body></html>";
const firing = `<html><body><script>document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true }));</script>fired</body></html>`;

const dispatchEnd = (page: Page) =>
  page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
  );

ytTest(
  "a stale navigation-end does not satisfy a transition-scoped wait",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", fulfill(blank));
    await page.goto("https://synthetic.test/stale");

    // A firing with no wait pending (e.g. an unconsumed earlier transition)…
    await dispatchEnd(page);
    // …must not satisfy a wait armed after it.
    const since = await eventWatcher.captureNavigationBaseline();
    await expect(eventWatcher.waitForNavigationEnd({ since, timeout: 700 })).rejects.toBeInstanceOf(
      errors.TimeoutError,
    );

    await dispatchEnd(page);
    await eventWatcher.waitForNavigationEnd({ since, timeout: 2_000 });
  },
);

ytTest(
  "a firing whose landing URL does not match the expected route never satisfies the wait",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", fulfill(blank));
    await page.goto("https://synthetic.test/wrong-route");

    const since = await eventWatcher.captureNavigationBaseline();
    await dispatchEnd(page); // ends while still on /wrong-route
    await expect(
      eventWatcher.waitForNavigationEnd({
        since,
        expectedUrl: /synthetic\.test\/expected/,
        timeout: 700,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);

    await page.evaluate(() => history.pushState({}, "", "/expected"));
    await dispatchEnd(page);
    await eventWatcher.waitForNavigationEnd({
      since,
      expectedUrl: /synthetic\.test\/expected/,
      timeout: 2_000,
    });
  },
);

ytTest(
  "a hard navigation's first firing in the fresh document satisfies the wait",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/firing", fulfill(firing));
    await page.route("https://synthetic.test/silent", fulfill(blank));
    await page.route("https://synthetic.test/before", fulfill(blank));
    await page.goto("https://synthetic.test/before");

    const since = await eventWatcher.captureNavigationBaseline();
    await page.goto("https://synthetic.test/firing");
    await eventWatcher.waitForNavigationEnd({
      since,
      expectedUrl: /synthetic\.test\/firing/,
      timeout: 5_000,
    });

    // A document replacement alone is not a completion signal: without a new
    // firing in the fresh document the scoped wait still times out.
    const freshDocSince = await eventWatcher.captureNavigationBaseline();
    await page.goto("https://synthetic.test/silent");
    await expect(
      eventWatcher.waitForNavigationEnd({ since: freshDocSince, timeout: 700 }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);
  },
);

ytTest(
  "a matching end followed by a moved route never satisfies the wait",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", fulfill(blank));
    await page.goto("https://synthetic.test/matched");

    const since = await eventWatcher.captureNavigationBaseline();
    await page.evaluate(() => history.pushState({}, "", "/expected"));
    await dispatchEnd(page); // ends on /expected (recorded URL matches)
    // …but the route then moved on: the page no longer shows the expected URL.
    await page.evaluate(() => history.pushState({}, "", "/wrong-route"));
    await expect(
      eventWatcher.waitForNavigationEnd({
        since,
        expectedUrl: /synthetic\.test\/expected/,
        timeout: 700,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);

    // Returning to the expected route with a fresh firing satisfies again.
    await page.evaluate(() => history.pushState({}, "", "/expected"));
    await dispatchEnd(page);
    await eventWatcher.waitForNavigationEnd({
      since,
      expectedUrl: /synthetic\.test\/expected/,
      timeout: 2_000,
    });
  },
);

ytTest(
  "an in-flight navigation-start blocks a wait whose end already matched",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", fulfill(blank));
    await page.goto("https://synthetic.test/inflight");

    const since = await eventWatcher.captureNavigationBaseline();
    await page.evaluate(() => history.pushState({}, "", "/expected"));
    await dispatchEnd(page); // qualifies by count and recorded URL…
    // …but a new transition has started and not ended: the wait must hold.
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent("yt-navigate-start", { bubbles: true })),
    );
    await expect(
      eventWatcher.waitForNavigationEnd({
        since,
        expectedUrl: /synthetic\.test\/expected/,
        timeout: 700,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);

    await dispatchEnd(page); // the in-flight transition ends on the same route
    await eventWatcher.waitForNavigationEnd({
      since,
      expectedUrl: /synthetic\.test\/expected/,
      timeout: 2_000,
    });
  },
);
