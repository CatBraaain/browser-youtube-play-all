import path from "node:path";

import type { Page } from "@playwright/test";
import { chromium, errors, expect, firefox, test } from "@playwright/test";
import { withExtension } from "playwright-webextext";

import { YTD_EVENTS, YTM_EVENTS } from "@/entrypoints/play-all-button.content/youtube-hooks";

import { YtPage } from "./utils";

export type NavigationBaseline = { eventName: string; docId: string; count: number };

// How a wait qualifies the route: either a regexp tested against the URL, or
// a parsed-URL expectation (pathname equality plus query parameter values by
// key). The parsed form exists because parameter order is not contractual:
// the mobile results URL can carry extra leading parameters
// (/results?sp=mAEA&search_query=…), which a leading pattern cannot match.
export type ExpectedUrl = RegExp | { pathname: string; searchParams: Record<string, string> };

export class EventWatcher {
  // Firing counts already consumed by waitForFired, per event name and
  // document. A fresh document (hard navigation) resets consumption.
  private consumed: Record<string, { docId: string; count: number }> = {};

  constructor(private page: Page) {}

  // The navigation-end event of this watcher's page, resolved per platform.
  public get navigationEndEvent(): string {
    return new YtPage(this.page, this).NavigationEndEvent;
  }

  // Installs the page-side synchronization state at document-start. It lives
  // on `window.__ytSync` and records, for every watched event name:
  // - a per-document id (docId): a changed docId means a hard navigation
  //   replaced the document and all counters restarted at zero;
  // - a monotonic firing count, the event detail and the page URL recorded at
  //   firing time (events[name].urls[i] belongs to firing i+1), so a firing
  //   can be matched to the route it ended on, race-free;
  // - an in-flight navigation counter (a start whose end has not fired).
  public async setInitScripts(eventNames: string[]) {
    await this.page.addInitScript(
      ({ eventNames }: { eventNames: string[] }) => {
        const w = window as any;
        const sync = (w.__ytSync = {
          docId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          events: {} as Record<string, { count: number; detail: unknown; urls: string[] }>,
          inflight: 0,
        });
        for (const name of eventNames) {
          sync.events[name] = { count: 0, detail: undefined, urls: [] };
          w.addEventListener(name, (e: Event) => {
            const state = sync.events[name]!;
            state.count += 1;
            state.detail = (e as CustomEvent).detail;
            state.urls.push(w.location.href);
            // Navigation start names contain "start" (yt-navigate-start,
            // state-navigatestart); end names do not. A hard load fires an
            // end without a start, so the counter floors at zero.
            sync.inflight = name.includes("start")
              ? sync.inflight + 1
              : Math.max(0, sync.inflight - 1);
          });
        }
      },
      { eventNames },
    );
  }

  public async expect(expectation: {
    eventName: string;
    fired: boolean;
    timeout?: number;
    since?: NavigationBaseline;
  }) {
    const { eventName, fired, timeout = 5000, since } = expectation;
    if (fired) {
      await this.waitForFired(eventName, timeout, since);
    } else {
      await expect(this.waitForFired(eventName, timeout, since)).rejects.toBeInstanceOf(
        errors.TimeoutError,
      );
    }
  }

  // Count-based wait: resolves once a firing of `eventName` occurs that this
  // watcher has not consumed yet, then consumes it. Same observable contract
  // as the legacy flag convention it replaces: a firing with no wait pending
  // stays unconsumed and satisfies the next waitForFired immediately, a
  // consumed firing does not satisfy again, and a fresh document resets
  // consumption. With an explicit `since`, checks only post-baseline firings
  // without changing shared consumption; a replacement document starts at zero.
  public async waitForFired(
    eventName: string,
    timeout: number = 30000,
    since?: NavigationBaseline,
  ) {
    const consumed = since ?? this.consumed[eventName] ?? { docId: "", count: 0 };
    const res = await this.page.waitForFunction(
      (state: { eventName: string; docId: string; count: number }) => {
        const sync = (window as any).__ytSync;
        if (!sync) return false;
        const ev = sync.events[state.eventName];
        if (!ev) return false;
        const consumedCount = sync.docId === state.docId ? state.count : 0;
        return ev.count > consumedCount;
      },
      { eventName, docId: consumed.docId, count: consumed.count },
      { timeout: timeout === 0 ? 1 : timeout },
    );
    if (!since) {
      const { docId, count } = await this.page.evaluate((eventName: string) => {
        const sync = (window as any).__ytSync;
        return { docId: sync?.docId ?? "", count: sync?.events[eventName]?.count ?? 0 };
      }, eventName);
      this.consumed[eventName] = { docId, count };
    }
    return res;
  }

  // Captures the current firing count of the page's navigation-end event.
  // Capture it before triggering an action and pass it as `since` to
  // waitForNavigationEnd, so only firings caused by that action can satisfy
  // the wait. A page without instrumentation yet (e.g. about:blank) yields an
  // empty docId: the first committed document is then always "fresh". The
  // event name is re-resolved at wait time, so a baseline taken on a page
  // that hard-navigates across hosts (www → m redirect) still matches the
  // destination document's event.
  public async captureNavigationBaseline(
    eventName: string = this.navigationEndEvent,
  ): Promise<NavigationBaseline> {
    const { docId, count } = await this.page.evaluate((eventName: string) => {
      const sync = (window as any).__ytSync;
      return { docId: sync?.docId, count: sync?.events[eventName]?.count };
    }, eventName);
    return { eventName, docId: docId ?? "", count: count ?? 0 };
  }

  // Transition-scoped wait for the page's navigation-end event. Requires a
  // baseline captured before the action (`since`, mandatory: a wait without
  // one silently accepts any future firing):
  // - same document as `since`: only firings after the baseline count, unless
  //   `requireNewFiring` is false (settled-route check: any firing in the
  //   current document qualifies);
  // - document replaced after the baseline (hard navigation, redirect chain):
  //   the fresh document's own firings; a bare document swap without a firing
  //   still times out;
  // - with expectedUrl: only firings whose page URL at firing time matches,
  //   the current page URL must match too (a matching end followed by a newer
  //   wrong route never qualifies), and no navigation may be in flight (a
  //   started transition holds the wait until it ends).
  public async waitForNavigationEnd(options: {
    since: NavigationBaseline;
    expectedUrl?: ExpectedUrl;
    timeout?: number;
    requireNewFiring?: boolean;
  }) {
    const { since, expectedUrl, timeout = 30_000, requireNewFiring = true } = options;
    // Resolve the event from the page as of the wait: the destination
    // document decides desktop vs mobile names, not the baseline page.
    const eventName = this.navigationEndEvent;
    await this.page.waitForFunction(
      (state: {
        eventName: string;
        docId: string;
        count: number;
        expectedUrl?: ExpectedUrl;
        requireNewFiring: boolean;
      }) => {
        const w = window as any;
        const sync = w.__ytSync;
        if (!sync) return false;
        const ev = sync.events[state.eventName];
        if (!ev) return false;
        const from = state.requireNewFiring && sync.docId === state.docId ? state.count : 0;
        if (ev.count <= from) return false;
        if (state.expectedUrl) {
          const urlMatches = (href: string): boolean => {
            const expected = state.expectedUrl!;
            if (expected instanceof RegExp) return expected.test(href);
            const url = new URL(href);
            return (
              url.pathname === expected.pathname &&
              Object.entries(expected.searchParams).every(
                ([key, value]) => url.searchParams.get(key) === value,
              )
            );
          };
          let matched = false;
          for (let i = from; i < ev.count; i++) {
            if (urlMatches(ev.urls[i])) matched = true;
          }
          if (!matched) return false;
          // The expected route must still be the current route, and no
          // navigation may be in flight (a start whose end has not fired).
          if (!urlMatches(w.location.href)) return false;
          if ((sync.inflight ?? 0) > 0) return false;
        }
        return true;
      },
      { eventName, docId: since.docId, count: since.count, expectedUrl, requireNewFiring },
      { timeout },
    );
  }

  public async getLastEventContent(eventName: string) {
    return await this.page.evaluate(
      (eventName: string) => (window as any).__ytSync?.events[eventName]?.detail,
      eventName,
    );
  }
}

export class ChannelIdFinder {
  private ytPage: YtPage;

  constructor(
    private page: Page,
    private eventWatcher: EventWatcher,
  ) {
    this.ytPage = new YtPage(this.page, this.eventWatcher);
  }

  async expectNavigationEndEvent(exists: boolean | null) {
    const lastEventContent = await this.eventWatcher.getLastEventContent(
      this.ytPage.NavigationEndEvent,
    );
    const channelId = lastEventContent?.endpoint.browseEndpoint?.browseId;
    await this.expectChannelIdCorrect(channelId, exists);
  }

  async expectCanonicalLink(exists: boolean | null) {
    const locator = this.page.locator("[rel='canonical']");
    const channelId =
      (await locator.count()) > 0 ? (await locator.first().getAttribute("href"))! : undefined;
    await this.expectChannelIdCorrect(channelId, exists);
  }

  async expectYtInitialData(exists: boolean | null) {
    const channelId = await this.page.evaluate(
      () =>
        (window as any).ytInitialData.responseContext.serviceTrackingParams
          .find((e: any) => e.service === "GOOGLE_HELP")
          ?.params.find((e: any) => e.key === "browse_id").value,
    );
    await this.expectChannelIdCorrect(channelId, exists);
  }

  async expectYtCommand(exists: boolean | null) {
    const channelId = await this.page.evaluate(
      () => (window as any).ytCommand.browseEndpoint?.browseId,
    );
    await this.expectChannelIdCorrect(channelId, exists);
  }

  async expectChannelIdCorrect(channelId: string | undefined, exists: boolean | null) {
    if (exists === null) {
      return;
    }

    if (exists) {
      expect(channelId).toEqual(expect.stringMatching(/UC.*/));
    } else {
      expect(channelId).not.toEqual(expect.stringMatching(/UC.*/));
    }
  }
}

// Attaches the navigation-event hooks to the given page. Used by the
// eventWatcher fixture and by tests that restart scenarios on a fresh tab.
export async function attachEventWatcher(page: Page): Promise<EventWatcher> {
  const eventWatcher = new EventWatcher(page);
  await eventWatcher.setInitScripts([
    YTD_EVENTS.NAVIGATION_START,
    YTD_EVENTS.NAVIGATION_END,
    YTM_EVENTS.NAVIGATION_START,
    YTM_EVENTS.NAVIGATION_END,
  ]);
  return eventWatcher;
}

// Button journeys retain their tag for Playwright filtering.
export const JOURNEY_TAG = "@journey";

export const ytTest = test.extend<{
  eventWatcher: EventWatcher;
  channelIdFinder: ChannelIdFinder;
}>({
  eventWatcher: async ({ page }, use) => {
    await use(await attachEventWatcher(page));
  },
  channelIdFinder: async ({ page, eventWatcher }, use) => {
    const channelIdFinder = new ChannelIdFinder(page, eventWatcher);
    await use(channelIdFinder);
  },
});

export const ytxTest = ytTest.extend({
  context: async (
    { browserName, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor },
    use,
  ) => {
    const deviceOptions = {
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
    };
    switch (browserName) {
      case "chromium": {
        const chromeExtensionPath = path.join(import.meta.dirname, "../dist/chrome-mv3");
        const context = await chromium.launchPersistentContext("", {
          ...deviceOptions,
          // Extensions only load in headed Chromium; headless drops --load-extension.
          headless: false,
          args: [
            `--disable-extensions-except=${chromeExtensionPath}`,
            `--load-extension=${chromeExtensionPath}`,
            "--mute-audio",
          ],
        });
        await use(context);
        await context.close();
        break;
      }
      case "firefox": {
        const firefoxExtensionPath = path.join(import.meta.dirname, "../dist/firefox-mv2");
        const firefoxWithExt = withExtension(firefox, firefoxExtensionPath);
        const context = await firefoxWithExt.launchPersistentContext("", {
          ...deviceOptions,
          firefoxUserPrefs: {
            "media.autoplay.blocking_policy": 2, // altearnative to --mute-audio
          },
        });
        await use(context);
        await context.close();
        break;
      }
      default: {
        throw new Error("Unsupported browser");
      }
    }
  },
});
