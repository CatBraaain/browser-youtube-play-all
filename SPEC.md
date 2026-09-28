# Test Cases

## Scope

| Cases                                                | Applies on                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| All cases                                            | Desktop and mobile.                                                                                 |
| Cases on a channel's Videos, Shorts, or Streams page | Direct category-page load (hard navigation) and navigation without a page reload (soft navigation). |

## Button and menu

| Case                    | Condition                                              | Operation                                            | Expected result                                                                                               |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Initial button and menu | A channel's Videos page with Latest initially selected | View the page                                        | Exactly one Play All button is shown, labeled "Play All (Latest)". The separate Play All menu starts closed.  |
| Open the menu           | The Play All menu is closed                            | Activate the menu's toggle                           | The menu opens.                                                                                               |
| Close the menu          | The Play All menu is open                              | Activate the toggle again, or click outside the menu | The menu closes.                                                                                              |
| Move to another channel | The viewer is on a channel page                        | Move to another channel                              | The Play All button and menu show links for the new channel, with no links remaining to the previous channel. |
| Watch page              | A video watch page                                     | View the page                                        | Neither the Play All button nor the Play All menu is shown.                                                   |

## Selected sort

| Case                      | Condition                                                                                       | Operation                           | Expected result                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| Follows the selected sort | A category page with the Play All button already shown                                          | Select a different sort on the page | The button shows the newly selected sort, e.g. "Play All (Popular)".         |
| Delayed Oldest resolution | Resolving Videos / Oldest is delayed while the viewer selects Oldest, then Latest, then Popular | Oldest finishes resolving           | The button remains "Play All (Popular)", and the selection stays on Popular. |

## Destination videos

Each case below applies to every category C ∈ {Videos, Shorts, Streams}, covering all nine combinations.

| Condition                                | Operation                     | Expected result                                                                                                                                    |
| ---------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A channel's C page with Latest selected  | Activate "Play All (Latest)"  | The first three videos in the playlist panel at the destination match the first three videos on the channel's C / Latest page, in the same order.  |
| A channel's C page with Popular selected | Activate "Play All (Popular)" | The first three videos in the playlist panel at the destination match the first three videos on the channel's C / Popular page, in the same order. |
| A channel's C page with Oldest selected  | Activate "Play All (Oldest)"  | The selected video in the playlist panel at the destination matches the first video on the channel's C / Oldest page.                              |

## Oldest playlist

| Case                         | Condition                        | Operation                    | Expected result                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared oldest-first playlist | Oldest is selected on a category | Activate "Play All (Oldest)" | The destination is a single playlist containing uploads from all categories in oldest-first order. That category's oldest video is selected. If another category has an older upload, the selected video is not the first item in the playlist panel. |

## Failure

| Case                           | Condition                                | Operation                         | Expected result                                                                                                |
| ------------------------------ | ---------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Oldest resolution failure      | Videos / Oldest alone cannot be resolved | Select Oldest                     | The button shows "Play All (Oldest) (error)" instead of a working playlist link.                               |
| Error button does not navigate | "Play All (Oldest) (error)" is shown     | Activate the button               | The viewer stays on the same page.                                                                             |
| Other sorts stay usable        | Videos / Oldest alone cannot be resolved | Select another sort from the menu | Other available menu choices remain usable, and selecting Popular shows a working "Play All (Popular)" button. |
