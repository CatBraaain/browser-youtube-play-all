# YouTube Navigation Reference

How YouTube performs page navigation. This is the shared reference for the
extension implementation and the tests; the test-side waiting rules live in
`AGENTS.md`.

This describes YouTube, not the extension. The extension's own contract is
`SPEC.md`. YouTube changes this behavior without notice; when a test fails in
a way this document does not explain, update it together with the fix.

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

DOM can render before the router's internal state is ready; clicks on in-app
anchors during that window can be silently dropped between step 1 and step 2.

Mobile YouTube is a separate implementation with its own event names. The
extension maps them in `src/entrypoints/play-all-button.content/youtube-hooks.ts`:

| Scope   | Navigation start      | Navigation end       |
| ------- | --------------------- | -------------------- |
| Desktop | `yt-navigate-start`   | `yt-navigate-finish` |
| Mobile  | `state-navigatestart` | `state-navigateend`  |

## Sort changes are not navigations

Clicking a sort chip (Latest / Popular / Oldest) does not go through the SPA
router. No `yt-navigate-start`/`yt-navigate-finish` (desktop) or
`state-navigatestart`/`state-navigateend` (mobile) fires, and the URL keeps its
current query. The page refreshes in place instead:

| Step | What happens                                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | The chip's `aria-selected` flips within ~100 ms (an already-selected chip can flip off and back on, on mobile)                                                                                                                                                   |
| 2    | The browse response lands a few hundred ms later and the page re-renders: the video grid swaps to the new sort's videos by DOM replacement, and on desktop the chip bar is rebuilt in the same pass, detaching nodes anchored inside it — including extension UI |
| 3    | Re-clicking the already-selected chip still swaps the grid; it is not a no-op                                                                                                                                                                                    |

Observed 2026-09-29 with muted Chromium probes on desktop and mobile. An
element resolved before step 2 can be detached mid-interaction; the test-side
sync rules for this live in `AGENTS.md`.
