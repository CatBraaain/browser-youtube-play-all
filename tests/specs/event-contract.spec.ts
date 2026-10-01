import { errors, expect } from "@playwright/test";

import { ytTest } from "../fixture";
import { YtChannelPage, YtPage } from "../utils";

const channelHtml = (emitStart = true) => `<!doctype html><html><body>
<yt-tab-shape role="tab">Target category</yt-tab-shape>
<script>
  window.ytInitialData = { contents: { twoColumnBrowseResultsRenderer: {
    tabs: [{ tabRenderer: { endpoint: { commandMetadata: {
      webCommandMetadata: { url: "/@example/videos" }
    } } } }]
  } } };
  const fire = name => document.dispatchEvent(new CustomEvent(name, { bubbles: true }));
  fire("yt-navigate-start");
  fire("yt-navigate-finish");
  document.querySelector("yt-tab-shape").addEventListener("click", () => {
    window.clicks = (window.clicks ?? 0) + 1;
    ${emitStart ? 'fire("yt-navigate-start");' : ""}
    history.pushState({}, "", "/@example/videos");
  });
</script></body></html>`;

ytTest(
  "the event contract rejects a pre-action end while wait=false leaves the soft end pending",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelHtml() }),
    );
    await page.goto("https://synthetic.test/@example/shorts");
    const ytPage = new YtPage(page, eventWatcher);
    const startSince = await eventWatcher.captureNavigationBaseline(ytPage.NavigationStartEvent);
    const endSince = await eventWatcher.captureNavigationBaseline();
    const channel = new YtChannelPage("@example", page, eventWatcher);

    await channel.navigateToCategory("Videos", "soft", false);
    await eventWatcher.expect({
      eventName: ytPage.NavigationStartEvent,
      fired: true,
      since: startSince,
      timeout: 500,
    });
    await expect(
      eventWatcher.expect({
        eventName: ytPage.NavigationEndEvent,
        fired: true,
        since: endSince,
        timeout: 200,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);

    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
    );
    await eventWatcher.expect({
      eventName: ytPage.NavigationEndEvent,
      fired: true,
      since: endSince,
      timeout: 500,
    });
    expect((await eventWatcher.captureNavigationBaseline()).docId).toBe(endSince.docId);
    expect(await page.evaluate(() => (window as any).clicks)).toBe(1);
  },
);

ytTest(
  "a category no-op cannot claim soft start or end from pre-action events",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelHtml() }),
    );
    await page.goto("https://synthetic.test/@example/videos");
    const ytPage = new YtPage(page, eventWatcher);
    const startSince = await eventWatcher.captureNavigationBaseline(ytPage.NavigationStartEvent);
    const endSince = await eventWatcher.captureNavigationBaseline();

    await new YtChannelPage("@example", page, eventWatcher).navigateToCategory(
      "Videos",
      "soft",
      false,
    );
    await eventWatcher.expect({
      eventName: ytPage.NavigationStartEvent,
      fired: false,
      since: startSince,
      timeout: 500,
    });
    await expect(
      eventWatcher.expect({
        eventName: ytPage.NavigationEndEvent,
        fired: true,
        since: endSince,
        timeout: 200,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);
    expect(await page.evaluate(() => (window as any).clicks)).toBeUndefined();
  },
);

ytTest(
  "URL movement and a fresh end cannot replace the soft contract's fresh start",
  async ({ page, eventWatcher }) => {
    await page.route("https://synthetic.test/**", (route) =>
      route.fulfill({ contentType: "text/html", body: channelHtml(false) }),
    );
    await page.goto("https://synthetic.test/@example/shorts");
    const ytPage = new YtPage(page, eventWatcher);
    const startSince = await eventWatcher.captureNavigationBaseline(ytPage.NavigationStartEvent);
    const endSince = await eventWatcher.captureNavigationBaseline();
    await new YtChannelPage("@example", page, eventWatcher).navigateToCategory(
      "Videos",
      "soft",
      false,
    );
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent("yt-navigate-finish", { bubbles: true })),
    );
    await expect(
      eventWatcher.expect({
        eventName: ytPage.NavigationStartEvent,
        fired: true,
        since: startSince,
        timeout: 500,
      }),
    ).rejects.toBeInstanceOf(errors.TimeoutError);
    await eventWatcher.expect({
      eventName: ytPage.NavigationEndEvent,
      fired: true,
      since: endSince,
      timeout: 500,
    });
  },
);

ytTest(
  "hard navigation across www to mobile asserts no start and the destination's fresh end",
  async ({ page, eventWatcher }) => {
    await page.route("https://www.youtube.com/@example/shorts", (route) =>
      route.fulfill({ contentType: "text/html", body: channelHtml() }),
    );
    await page.route("https://www.youtube.com/@example/videos", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><script>location.replace("https://m.youtube.com/@example/videos");</script></html>`,
      }),
    );
    await page.route("https://m.youtube.com/@example/videos", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><script>document.dispatchEvent(new CustomEvent("state-navigateend", { bubbles: true }));</script></html>`,
      }),
    );
    await page.goto("https://www.youtube.com/@example/shorts");
    const ytPage = new YtPage(page, eventWatcher);
    const startSince = await eventWatcher.captureNavigationBaseline(ytPage.NavigationStartEvent);
    const endSince = await eventWatcher.captureNavigationBaseline();

    await new YtChannelPage("@example", page, eventWatcher).navigateToCategory(
      "Videos",
      "hard",
      false,
    );
    await expect(page).toHaveURL("https://m.youtube.com/@example/videos");
    await eventWatcher.expect({
      eventName: ytPage.NavigationStartEvent,
      fired: false,
      since: startSince,
      timeout: 500,
    });
    await eventWatcher.expect({
      eventName: ytPage.NavigationEndEvent,
      fired: true,
      since: endSince,
      timeout: 500,
    });
    expect((await eventWatcher.captureNavigationBaseline()).docId).not.toBe(endSince.docId);
    await expect(page).toHaveURL("https://m.youtube.com/@example/videos");
  },
);
