# YouTube Navigation Reference

How YouTube performs page navigation. This is the shared reference for
the extension implementation and the tests; the test-side waiting rules live in
`AGENTS.md`.

This describes YouTube, not the extension. The extension's own contract is
`SPEC.md`. YouTube changes this behavior without notice; when a test fails in
a way this document does not explain, update it together with the fix.

## Navigation signals and what each proves

| Signal                                                         | What it is                                             | What it proves                                          | What it does not prove                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `domcontentloaded`                                             | The HTML document is parsed                            | The document exists                                     | That the SPA rendered or routed anything                                             |
| Navigation start (`yt-navigate-start` / `state-navigatestart`) | The router accepted a transition                       | A transition began                                      | That it completed, or which route it lands on                                        |
| Navigation end (`yt-navigate-finish` / `state-navigateend`)    | The router finished a transition                       | The transition ended on the URL recorded at firing time | That follow-up UI (grids, chips) has rendered, or that no further transition started |
| URL change                                                     | `pushState` (soft) or a document load (hard)           | The visible route moved                                 | For soft changes: that the router's internal state is ready (see drop window below)  |
| Sort response + grid swap                                      | The sort's own `/youtubei/v1/browse` response rendered | The clicked sort was applied (see below)                | Nothing about navigation — sorts are not navigations                                 |

Hard navigation (full page load): the router fires navigation end once after
the initial load; no start event precedes it. Soft (in-app) navigation: start,
then end. A committed-document replacement (hard navigation, redirect) resets
all page state — listeners, flags, and data included.

## How soft navigation works

A click on an in-app anchor never performs a browser navigation. The router
handles it in steps:

| Step | What happens                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 1    | A document-level router listener captures the click and calls `preventDefault()` on the anchor             |
| 2    | The navigation-start event fires, and page data is requested (`/youtubei/v1/browse` and related endpoints) |
| 3    | The SPA re-renders the page and updates the URL via `pushState`                                            |
| 4    | The navigation-end event fires                                                                             |

DOM can render before the router's internal state is ready; clicks on in-app
anchors during that window can be silently dropped between step 1 and step 2 —
no navigation event fires and the URL does not move, so "the click was
swallowed" is only provable from the absence of every start signal, never from
elapsed time alone. A dropped-window click can also happen on repeated clicks
to the same anchor.

Mobile YouTube is a separate implementation with its own event names. The
extension maps them in `src/entrypoints/play-all-button.content/youtube-hooks.ts`:

| Scope   | Navigation start      | Navigation end       |
| ------- | --------------------- | -------------------- |
| Desktop | `yt-navigate-start`   | `yt-navigate-finish` |
| Mobile  | `state-navigatestart` | `state-navigateend`  |

Mobile hard navigations to `www.youtube.com` redirect to `m.youtube.com` as a
single committed document whose initial load fires the mobile navigation-end
event once (a second firing has also been observed on some loads). A hash-only
URL change such as `m.youtube.com/#searching` from the m root stays in the
same document and fires no navigation event: it opens the search UI, it is not
a route.

### Search results URLs

The results page URL is `…/results?search_query=<query>`, but extra query
parameters can precede or follow it (a preserved mobile trace showed
`/results?sp=mAEA&search_query=%40Apple`). Parameter order and extra
parameters are not contractual: validate the parsed pathname and the decoded
`search_query` value, not a positional pattern. What appends the extra
parameters is unknown (it did not appear in every mobile run).

## Sort changes are not navigations

Clicking a sort chip (Latest / Popular / Oldest) does not go through the SPA
router. No navigation event fires and the URL keeps its current query. The
page refreshes in place instead:

| Step | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | The chip's `aria-selected` flips quickly (an already-selected chip can flip off and back on, on mobile)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2    | The click issues exactly one `/youtubei/v1/browse` request from the page context (fetch) whose body carries the clicked chip's continuation token (the `chip-view-model` data's `tapCommand.innertubeCommand.continuationCommand.token`); the response carries a next-page continuation token. All three chips expose tokens, including the selected one; on mobile the data can attach after the chip renders. The request body is gzip-compressed when the client supports it, so a test observing the body must decode it before parsing |
| 3    | Shortly after the click, before the response arrives, the grid can re-render the OLD sort's videos: the first video node is replaced by a new node with the SAME href                                                                                                                                                                                                                                                                                                                                                                       |
| 4    | The browse response lands and the page re-renders with it: the video grid swaps to the new sort's videos by DOM replacement, and on desktop the chip bar is rebuilt in the same pass, detaching nodes anchored inside it — including extension UI                                                                                                                                                                                                                                                                                           |
| 5    | Re-clicking the already-selected chip re-issues the browse request and still swaps the grid; it is not a no-op, and the replacement node can keep the same href                                                                                                                                                                                                                                                                                                                                                                             |

Because of step 3, "the first video node was replaced" alone does not prove
the clicked sort was applied, and an unrelated browse response plus a
re-render proves nothing either. The causal gate is identity plus applied
content, not ordering: the response whose request body carries the clicked
chip's continuation token must have arrived, and the grid's ordered visible
video ids must match that response's. A bounded quiet window on top lets the
grid settle; it is a test heuristic, not a YouTube guarantee. Ordering between
the render and the response arrival is deliberately not relied on; whether a
render can precede its own response is unresolved. When no chip token or no
matching response is observable, fail closed. The extension's Play All button
resolves separately and can lag the grid (network-backed Oldest playlists).

Occasionally, a sort click flips `aria-selected` but issues no browse request
and never changes the grid (seen repeatedly in one long series of rapid fresh
headless contexts on a single machine; not seen in e2e-like sessions). The
trigger is unknown; such sessions are another reason the token-matched gate
fails closed instead of waiting on replacement alone.

## Sort dropdown UI on membership channels

Channels that provide membership render the category sort differently, on
desktop and mobile web alike: instead of the three sort chips, the chip bar
holds a sort dropdown chip plus audience filter chips.

| Element               | DOM                                                                                                                                                  | Behavior                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sort dropdown chip    | `chip-bar-view-model button[role=combobox]` (desktop inside `ytd-browse[page-subtype='channels'] #primary`, mobile inside `ytm-browse .tab-content`) | Its label text (`.ytChipShapeText`) is the current sort; its own `aria-selected` stays `false` and carries no sort state |
| Audience filter chips | `button[role=tab]` with `aria-selected`, observed as "Members only" and "Public"                                                                     | Audience filters for the grid; they flip `aria-selected` like sort buttons do but are not sort controls                  |
| Sort options sheet    | Desktop: `button[role=menuitem]` items inside `ytd-popup-container`; mobile: the same items inside `bottom-sheet-container`                          | Canonical item order Latest, Popular, Oldest; each item's tap command carries a `continuationCommand.token` like a chip  |

Selecting a sort from the sheet is not a navigation: no navigation event fires
and the URL keeps its query (the mobile URL can gain a `#bottom-sheet` hash
while the sheet is open). The chosen sort surfaces only in the DOM:

- The combobox label becomes the chosen sort.
- On desktop the whole chip bar is rebuilt in the same pass (the combobox
  element is replaced); on mobile only the label text swaps in place and the
  combobox element survives.
- The grid swaps as with a classic sort (the same first-node replacement
  pattern).

The combobox label and the sheet item titles are localized (observed English
Latest / Popular / Oldest and Japanese 新しい順 / 人気の動画 / 古い順). The
sheet items carry no structural selected marker — their DOM shapes are
identical, and the selection shows only as the combobox label. The sheet
model's `isSelected` and the token identifying a sheet item's browse
response live on the chip's view-model data in the main world, which a
content script cannot read.

The sort resets to Latest whenever the viewer leaves the tab and returns,
and on every hard reload (observed signed-out). The label→sort mapping is
learned up front from the fetched category page instead of the live page:
the fetched ytInitialData holds a `chipBarViewModel` at the same path for
classic and membership channels alike, with the sort labels in the chips'
own texts (classic) or in the combobox chip's sheet model (membership), so
one extraction serves both UIs. A label the mapping does not know resolves
to Latest.

## Channel tabs

Channel pages render tabs as `yt-tab-shape` elements (desktop and mobile web).
They expose a localized `tab-title` attribute (e.g. ホーム/動画/ショート/ライブ)
and `aria-selected`, but no href; a `tab-identifier` signal property exists on
`yt-tab-shape` but was unset in every observation. The observed order is Home,
Videos, Shorts, Live, Playlists, (Search); clicking the Live tab routes to
`/@channel/streams`. Labels are localized and the order is not contractual,
but tab identity is machine-readable in the page data model: one
`tabRenderer` per tab whose `endpoint.commandMetadata.webCommandMetadata.url`
holds the category route (e.g. `/@Apple/videos`), under
`contents.twoColumnBrowseResultsRenderer.tabs` (desktop) /
`contents.singleColumnBrowseResultsRenderer.tabs` (mobile).

Which object holds that model depends on how the page was reached:

- After a hard load, `ytInitialData` is the current page's model.
- After a soft arrival, `ytInitialData` still holds the initial hard load's
  model, and the document can hold several `ytd-browse`/`ytm-browse` elements
  at once — stale hidden ones from previously routed pages (observed: a hidden
  home browse stayed first in the document) plus the current page's browse,
  whose element `.data` carries the current model. A first-match read resolves
  a foreign page's model, so the current model must be located by content:
  the tab endpoint matching the expected route. The current browse's data can
  also attach after the landing, so locating it requires waiting for the
  matching endpoint, not for any array-shaped model.
- Neither exposes `.data.tabs` directly; the tabs live under
  `.data.contents.*BrowseResultsRenderer.tabs` (`yt-tab-shape` own `.data` is
  null).

The model's tab order matched the `yt-tab-shape` DOM order in every
observation; the landing URL remains the causal check that the right route was
reached if that assumption ever breaks.

## Observation scope and unknowns

Observed on desktop and mobile web Chromium and desktop Firefox, in headless
probe sessions and e2e-like sessions with the test extension, Japanese and
English UI, on a small set of channels (@Apple and similar). Raw probe logs
and detailed experiment records live with this repository's test working
notes, not in this file. Unknowns:

- Whether the chip-token ↔ request-body equality holds long-term and across
  channels.
- What triggers the no-request sort sessions described above.
- Whether a grid render can precede its own sort response (ordering is not
  relied on).
- Whether re-clicking the already-selected _category_ tab re-fires
  navigation-end.
- How much tab order varies across channels, and whether the tab model's order
  can ever diverge from the `yt-tab-shape` DOM order (assumed 1:1; a divergence
  would surface as a wrong tab click caught later by the landing-URL wait).
- What appends extra parameters to the search results URL, and how reliably
  they appear.
- The applied-content check assumes the grid's leading visible video ids equal
  the response's leading `videoId` values in walk order; a response whose
  leading items are not rendered (filtered/unavailable) would fail closed.
