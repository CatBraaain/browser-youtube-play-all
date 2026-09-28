# YouTube Navigation Reference

How YouTube performs page navigation, how `tests/specs/` verifies that behavior,
and what has been observed in practice. Read this before writing or changing
tests that trigger navigation on YouTube.

This describes YouTube, not the extension. The extension's own contract is
`SPEC.md`. YouTube changes this behavior without notice; when a test fails in a
way this document does not explain, update the document together with the fix.

## How navigation works

YouTube is a single-page app. A click on an in-app anchor never performs a
browser navigation. The router handles it in steps:

| Step | What happens                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------- |
| 1    | A document-level router listener captures the click and calls `preventDefault()` on the anchor      |
| 2    | `yt-navigate-start` fires, and page data is requested (`/youtubei/v1/browse` and related endpoints) |
| 3    | The SPA re-renders the page and updates the URL via `pushState`                                     |
| 4    | `yt-navigate-finish` fires                                                                          |

A hard navigation (full page load) skips step 1-2's click path; the router still
fires `yt-navigate-finish` once after the initial load completes.

Mobile YouTube is a separate implementation with its own event names. The
extension maps them in `src/entrypoints/play-all-button.content/youtube-hooks.ts`:

| Scope   | Navigation start      | Navigation end       |
| ------- | --------------------- | -------------------- |
| Desktop | `yt-navigate-start`   | `yt-navigate-finish` |
| Mobile  | `state-navigatestart` | `state-navigateend`  |

Consequences for tests:

- An element being visible does not mean the navigation is complete. Wait for
  the navigation-end event before interacting with anything that depends on the
  routed page, and before clicking the next link.
- DOM can render before the router's internal state is ready; clicks during that
  window can be silently dropped (see the observations below).

## How `tests/specs/` verifies this

| Spec test                        | Behavior it verifies                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/specs/event.spec.ts`      | soft navigation fires both navigation-start and navigation-end; hard navigation fires only navigation-end                                        |
| `tests/specs/channel-id.spec.ts` | after navigating from search results, the channel id is reachable via the navigation-end event, canonical link, `ytInitialData`, and `ytCommand` |

If a test in this repository triggers navigation, prefer the helpers in
`tests/utils.ts` over raw clicks and `goto` calls; they encode the waiting rules
above.

## Observed behavior

### Swallowed clicks on SPA anchors

Observed 2026-09-28 in `firefox-desktop-e2e` (search-result channel card,
`ui-sync.test.ts`). The trace showed:

| Observation                                                                               | Conclusion                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Playwright clicked `<a href="/@YouTube" id="channel-thumbnail">`, hit-target check passed | The click reached the right element                              |
| The URL stayed on `/results?...`                                                          | No browser navigation happened, so `preventDefault()` was called |
| `/youtubei/v1/browse` was never requested                                                 | The SPA transition never started (step 2 above was not reached)  |
| A `log_event` telemetry request was sent                                                  | The click itself reached YouTube's event system                  |

Interpretation: the router dropped the transition between step 1 and step 2,
likely a hydration guard while the search result was still initializing. This
has not been observed on Chromium. Retrying the click after it was swallowed
succeeded.

Defense: `YtSearchPage.clickChannelThumbnailButton` in `tests/utils.ts` retries
the click until the browser lands on the channel page (`expect(...).toPass()`).

### Search results sometimes have no channel card

Search results occasionally come back without the channel card for a query that
normally shows one. Waiting does not help. Tests that need the card detect this
(`locator.count() === 0`) and retry on a fresh tab, or skip via
`testInfo.skip()` — the absence is an external condition, not an extension
defect.

### Channel link formats

Search-result channel cards use varying `href` formats:

- `/@handle`
- `/channel/UC...` (legacy channel id)
- `link:///@handle` (rewritten by YouTube's router; see the comment in
  `YtSearchPage.topVideoChannelThumbnailButton`)

URL assertions must accept all reachable formats.

### `EventWatcher.waitForFired` contract

`waitForFired` polls a flag that an init script sets when the event fires, and
resets the flag after a successful wait. Two consequences:

1. If the flag is already set from a previous, unconsumed firing, `waitForFired`
   returns immediately and does not wait for the next transition.
2. Therefore, to wait for transition N's end event, transition N-1's end event
   must have been consumed first. Helpers do this by waiting after every
   navigation step (e.g. `YtSearchPage.search`). Navigating with
   `wait = false` (`YtChannelPage.navigateToCategory`) leaves the flag set; a
   later `waitForFired` then cannot distinguish the two transitions.
