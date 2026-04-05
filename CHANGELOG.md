## [0.4.0] - 2026-04-06

### 💥 BREAKING CHANGE

- Fetch oldest video id from playlist instead of innertube
- Prepare playlist URLs on channel page load

### 🚀 Features

- Add dropdown menu to display all buttons

### ⚡ Performance

- Reuse data across soft navigation

### ⚙️ Miscellaneous Tasks

- _(deps)_ Update dependency typescript to v6 (#8)

## [0.3.1] - 2026-03-25

### 🚀 Features

- Expand supported browser versions

### 🐛 Bug Fixes

- Prevent duplicate observer
- Fix channel page detection not working correctly

## [0.3.0] - 2026-02-23

### 🚀 Features

- Improve stability against YouTube UI changes
- Add mobile support

### 🐛 Bug Fixes

- Remove duplicate subpath from fetch URL
- Prevent stale observers on rapid category and sort changes

## [0.2.3] - 2026-02-20

### 🐛 Bug Fixes

- Fix sorting not updating due to YouTube UI change

## [0.2.2] - 2026-02-09

### 🐛 Bug Fixes

- Fix not showing button after soft navigation
- Stabilize button generation logic

## [0.2.1] - 2026-01-30

### ⚡ Performance

- Reduce api calling and improve speed

## [0.2.0] - 2026-01-29

### 🚀 Features

- Use youtube private api for stalability and future enhancements

### 🐛 Bug Fixes

- Support channel URLs without @ prefix (e.g. /hikakintv)
- Adapt to YouTube internal UI changes

## [0.1.3] - 2026-01-23

### 🐛 Bug Fixes

- Fix oldest PlayAll button links to wrong video or channel

## [0.1.2] - 2025-11-05

### 🚀 Features

- Show oldest playall button for all category pages

## [0.1.1] - 2025-10-30

### 🐛 Bug Fixes

- Fix error on oldest shorts, streams page

## [0.1.0] - 2025-10-30

### 🚀 Features

- [**breaking**] Show oldest playall button only on video page

### 🐛 Bug Fixes

- Correct button placement

### ⚡ Performance

- Make button addition faster

## [0.0.3] - 2025-02-18

### 🐛 Bug Fixes

- Playlist links to previous channel
- Fix minor memory issue of page observer

## [0.0.2] - 2025-02-18

### 🐛 Bug Fixes

- Causing error on other youtube page
- Oldest playlist not working on shorts
- Oldest playlist links to different channel
- Button not working after click navigation

## [0.0.1] - 2025-02-14

### 🚀 Features

- Add play all button
