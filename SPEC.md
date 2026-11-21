# Test Cases

This specification is for users, developers and agents selecting tests for the YouTube Play All extension. The D01–D03 cases are implemented as E2E tests in `tests/e2e/play-all.test.ts`, driven by the combinations in `tests/e2e/combinations.ts`. A01, E01 and E02 run in `tests/e2e/resolution.test.ts`.

## Scope and notation

### Navigation routes

Each case reaches a channel category page through one of the following routes. A direct category load alone does not cover the route. Direct loads are full page loads.

| Navigation | To search | To channel home | To category |
| --- | --- | --- | --- |
| hard | Load directly | Load directly | Load directly |
| soft1 | Navigate without reloading | Open through the channel thumbnail without reloading | Navigate without reloading |
| soft2 | Navigate without reloading | Open through the channel name without reloading | Navigate without reloading |

A sort selection or audience filter activation is not a navigation.

### Test devices

Check each case with the following combinations.

| Navigation or case | Chrome desktop | Chrome mobile | Firefox desktop |
| --- | --- | --- | --- |
| hard | Included | Included | Included |
| soft1 | Included | Included | Included |
| soft2 | Included | Excluded | Included |
| Other cases | Included | Included | Included |

### Button display combinations

Each cell shows whether the Play All button appears for that category, sort, and audience. Read rows as categories and columns as sorts.

| Category | Audience | Latest | Popular | Oldest |
| --- | --- | --- | --- | --- |
| Videos | Public | shown | shown | shown |
| Shorts | Public | shown | shown | shown |
| Streams | Public | shown | shown | shown |
| Videos | Members only | shown | hidden | shown |
| Shorts | Members only | shown | hidden | shown |
| Streams | Members only | shown | hidden | shown |

## Case list

The D01–D03 rows below define the scope. The E2E tests implement the operations, expected results and screenshot points. The cases below the line are verified automatically only.

| ID | Group | Target page | Category | Sort | Audience | Navigation |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | Display / Destination | Category of the membership-free channel @Apple | Videos / Shorts / Streams | Latest / Popular / Oldest | Public | hard / soft1 / soft2 |
| D02 | Display / Destination | Category of the channel with membership perks @NASASpaceFlight | Videos / Shorts / Streams | Latest / Popular / Oldest | Public / Members only | hard / soft1 / soft2 |
| D03 | Display | Channel home (reached on every route before the category) | — | — | Public / Members only | hard / soft1 / soft2 |
| A01 | Async | Channel category | Videos | Oldest → Latest → Popular | Public / Members only | hard / soft1 / soft2 |
| E01 | Error | Channel category | Videos | Oldest → Popular | Public | hard / soft1 / soft2 |
| E02 | Error | Channel category | Videos / Shorts / Streams | Latest / Oldest | Members only | hard / soft1 / soft2 |

### A01: delayed Oldest resolution

While resolving Videos / Oldest is delayed, the viewer selects Oldest, then Latest, then Popular; Oldest finishes resolving. The button remains "Play All (Popular)", and the selection stays on Popular. With Members only, the toggle also keeps the selection and the delayed resolution never overwrites it.

### E01: Oldest resolution failure

Videos / Oldest alone cannot be resolved. Select Oldest and press the shown "Play All (Oldest) (error)". The error button has no working playlist link, and pressing it leaves the viewer on the same page. Verify these two behaviors separately from that error state:

- Open the extension menu and follow Videos / Popular. Its playlist opens and displays a video.
- On the original category page, select Popular with YouTube's sort control. A working "Play All (Popular)" button appears without leaving the category page.

### E02: members-only playlist resolution failure

The Members only filter is selected, and that category's members-only playlist alone cannot be resolved. The button shows "Play All (Latest) (error)" or "Play All (Oldest) (error)", following the selected sort, instead of a working playlist link.

## Review operation

The E2E tests verify the cases in this specification. The D01–D03 tests capture review screenshots during the same execution as their assertions. Each screenshot has structured metadata for its case, channel, category, sort, audience, route and stage.

Each D01/D02 test runs the D03 home menu check first (toggle open and close, the exact entry set from the button display table, every button visible on screen at the same time, screenshots of the closed and open states, and closing by an outside click). It then performs the cell's operation, asserts the expected result, and captures full-viewport screenshots at the defined points, all in the same run. Screenshots are attached in operation order. Traces for screenshot-bearing tests are retained for successful runs as well as failed runs. Other tests retain traces only on failure (`trace: "retain-on-failure"`). Mobile keeps the Pixel 5 portrait viewport.

The destination comparison excludes rows that YouTube marks as unplayable, and, for the Latest sort, rows that YouTube marks as currently live. The Popular playlists include live streams, so no live exclusion applies there.

The E2E gallery (`e2e-gallery.html`) displays screenshots from the same E2E execution. The Playwright HTML report provides the screenshots and traces. The owner judges the observed behavior from the screenshots. Assertion status stays with the runner's pass/fail, not with how the screenshots look.

### Running and viewing a review

`bun run test` builds the extension and runs all spec and E2E projects across Chrome desktop, Chrome mobile and Firefox desktop. Chrome mobile skips the soft2 routes (they are desktop-only). The gallery uses the screenshots attached by this run.

`bun run review` starts Vite and serves the gallery without running tests. Run `bun run test` first. View it at `e2e-gallery.html` under the URL Vite prints, normally `http://127.0.0.1:5173/e2e-gallery.html`.

Play All buttons keep the extension's normal, hover and focus background colors in preference to ordinary inline background colors. In trace snapshots, Play All buttons keep these colors and suppress the viewer's target outline. Other targets' highlights and click-position markers remain visible.
