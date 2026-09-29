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
