# Test Cases

This specification is for users, developers and agents selecting tests for the YouTube Play All extension. The table lists required behavior; one row can cover several test combinations.

## Scope and notation

### Navigation routes

Category display and destination rows follow each listed route in order: search → channel home → category. Check D03 at home on every route before continuing. A direct category load alone does not cover the route. Direct loads are full page loads.

| Navigation | To search | To channel home | To category |
| --- | --- | --- | --- |
| hard | Load directly | Load directly | Load directly |
| soft1 | Navigate without reloading | Open through the channel thumbnail without reloading | Navigate without reloading |
| soft2 | Navigate without reloading | Open through the channel name without reloading | Navigate without reloading |

For menu cases on any channel page, hard / soft means direct loading / navigation without a reload. These cases are not restricted to category pages. A sort selection or audience filter activation is not a navigation. Select the row's sort after reaching the category.

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
| Shorts | Members only | hidden | hidden | hidden |
| Streams | Members only | shown | hidden | shown |

### How to check the destination

When checking the destination of a Play All link, the confirmation differs by audience and sort as follows.

| Audience | Sort | What to check |
| --- | --- | --- |
| Public | Latest / Popular | The first three playable videos in the playlist panel at the destination match the first three videos on the channel's <category> / <sort> page, in the same order. This is the first three videos excluding rows that YouTube itself marks as unplayable (such as private videos). |
| Public | Oldest | The selected video in the playlist panel at the destination matches the first video on the channel's <category> / Oldest page. |
| Members only | Latest | The destination is that channel's members-only playlist, and its playlist panel lists the same video ids in the same order as the members-only playlist page. Rows are not filtered by playability: members-only rows are unplayable to signed-out viewers, and the comparison still holds. |
| Members only | Oldest | The selected row in the playlist panel at the destination is the members-only playlist's oldest item — the last row of the members-only playlist page. |

## Case list

A "—" in the "Review screenshot" column means the case is verified automatically only and is not captured for review.

| ID | Group | Target page | Category | Sort | Audience | Navigation | Operation | Expected result | Review screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | Display / Destination | Category of the membership-free channel @Apple | Videos / Shorts / Streams | Latest / Popular / Oldest | Public | hard / soft1 / soft2 | Record the video list of <category>, select <sort>, check the button display, then press "Play All (<sort>)" and navigate to its generated URL. | The "Play All (<sort>)" button is shown, and the destination is per "How to check the destination". | The "Play All (<sort>)" button before pressing → the playlist after navigating. |
| D02 | Display / Destination | Category of the channel with membership perks @NASASpaceFlight | Videos / Shorts / Streams | Latest / Popular / Oldest | Public / Members only | hard / soft1 / soft2 | Select <sort>, then activate Public and then Members only. For combinations where the button is shown with Members only, press "Play All (<sort>)" and navigate to its generated URL. | As per the combination table, the Play All button is shown / not shown. When pressed, the destination is per "How to check the destination". | A screen showing the selected category, sort, and audience and whether the button is shown or hidden. When pressed, the members-only Play All button before pressing → the members-only playlist after navigating. |
| D03 | Display | Channel home | — | — | Public / Members only | hard / soft1 / soft2 | Reach channel home as part of each route, before opening the category. | The Play All dropdown is shown, opens and closes via its toggle, and closes when clicking outside the menu. The open menu lists the entries per the button display combinations table. A channel with membership perks also shows the Members only entries; a channel without them shows the Public entries only. Every expected button in the open menu is visible on screen. | With the dropdown closed, scroll so the toggle aligns with the top edge of the screen and capture it. Then open it and capture the state where every expected button is visible on screen. |
| A01 | Async | Channel category | Videos | Oldest → Latest → Popular | Public / Members only | hard / soft1 / soft2 | While resolving Videos / Oldest is delayed, the viewer selects Oldest, then Latest, then Popular; Oldest finishes resolving. | The button remains "Play All (Popular)", and the selection stays on Popular. With Members only, the toggle also keeps the selection and the delayed resolution never overwrites it. | — |
| E01 | Error | Channel category | Videos | Oldest → Popular | Public | hard / soft1 / soft2 | Videos / Oldest alone cannot be resolved. Select Oldest, press the shown "Play All (Oldest) (error)", then select Popular from the menu. | The button shows "Play All (Oldest) (error)" instead of a working playlist link. After pressing, the viewer stays on the same page, the other available menu choices remain usable, and selecting Popular shows a working "Play All (Popular)" button. | — |
| E02 | Error | Channel category | Videos / Streams | Latest / Oldest | Members only | hard / soft1 / soft2 | The Members only filter is selected, and that category's members-only playlist alone cannot be resolved; Activate "Members only". | The button shows "Play All (Latest) (error)" or "Play All (Oldest) (error)", following the selected sort, instead of a working playlist link. | — |

## Review operation

All cases are managed as E2E tests in `tests/e2e/`. Cases with capture content written in the case list's "Review screenshot" column are the review targets, and their test files are named `*.review.test.ts`. The same case is not defined separately for review; automatic verification and review use the same run results. Cases without review material, such as the async and error cases, are also verified automatically. Review is done from the screenshots attached to Playwright's built-in trace and HTML report.

A review unit is a `test.step()` step named as an operation, pairing one intention with one confirmation, and its assertions are ordinary `expect()`. Major locators are named with `.describe("name")`.

Review-target tests also run with the route and device combinations defined for each case. Mobile keeps the normal project's Pixel 5 portrait viewport.

Captures follow the case list's "Review screenshot" column. Each screenshot captures the full viewport and is attached to the test result in operation order. The HTML report lists test attachments in that attach order.

### Running and viewing a review

`bun run test` runs all E2E tests, including the review targets. Review traces are always retained, including successful attempts; non-review tests retain traces only for failed attempts (`trace: "retain-on-failure"`).

The run results are saved to the same Playwright HTML report and overwritten by the most recent run. They can be viewed after the run without rerunning tests. In the report list, identify review targets by file name and open the `*.review.test.ts` files. Non-review files also remain in the list.

Play All buttons keep the extension's normal, hover and focus background colors in preference to ordinary inline background colors. In trace snapshots, Play All buttons keep these colors and suppress the viewer's target outline. Other targets' highlights and click-position markers remain visible.

`bun run review` first applies the report patch (`scripts/patch-report.ts`) and then starts the report server with `--port 0`. The patch renders the trace viewer's Attachments tab as a two-column grid where each button and destination pair stacks vertically under a category-and-sort heading (for example, `Videos - Latest`), with the Attachments tab initially selected. It is idempotent: serving again applies no further change, and it fails loudly when no report exists yet. The patch fixes the snapshot pane to a small height so the Attachments pane starts at full height; it does not seed the bottom pane height, because a near-maximum seed kept the snapshot pane squeezed to almost nothing and every browser zoom change re-moved the pane boundary. The patch also fixes the trace viewer's film strip height, so that the asynchronous video thumbnail generation does not grow the timeline and move the pane boundary after the trace opens. Open the URL shown at startup and, in the report, pick the test by its name from the review-target files. Opening a test shows its steps and its trace; in the trace viewer's Attachments tab, check the screenshots defined in the case list. Stop the server with Ctrl+C. The owner judges the observed behavior from the screenshots. Assertion status stays with the runner's pass/fail, not with how the screenshots look.
