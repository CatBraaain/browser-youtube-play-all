# Test Cases

Youtube Play All is a browser extension that adds Play All buttons to the Videos, Shorts, and Streams categories of YouTube channel pages. This specification defines the expected result when a viewer switches categories and sort orders.

Whether the viewer reaches the channel through soft navigation (without reloading the page) or hard navigation (loading the page directly), selecting a category and Latest, Popular, or Oldest displays a Play All button for that selection. The button opens the corresponding playlist.

| Category | Sort    | Expected video at the button's destination                                                            |
| -------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Videos   | Latest  | The first item in the playlist panel matches the first video on the channel's Videos / Latest page.   |
| Videos   | Popular | The first item in the playlist panel matches the first video on the channel's Videos / Popular page.  |
| Videos   | Oldest  | The selected video matches the first video on the channel's Videos / Oldest page.                     |
| Shorts   | Latest  | The first item in the playlist panel matches the first video on the channel's Shorts / Latest page.   |
| Shorts   | Popular | The first item in the playlist panel matches the first video on the channel's Shorts / Popular page.  |
| Shorts   | Oldest  | The selected video matches the first video on the channel's Shorts / Oldest page.                     |
| Streams  | Latest  | The first item in the playlist panel matches the first video on the channel's Streams / Latest page.  |
| Streams  | Popular | The first item in the playlist panel matches the first video on the channel's Streams / Popular page. |
| Streams  | Oldest  | The selected video matches the first video on the channel's Streams / Oldest page.                    |

Oldest uses a single playlist containing uploads from all categories in oldest-first order. Opening it from a category selects that category's oldest video. If another category has an older upload, the selected video is not the first item in the playlist panel.
