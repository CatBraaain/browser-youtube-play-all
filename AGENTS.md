# Spec files

`SPEC.md` is the canonical English spec for this OSS project. `SPEC.ja.md` is its Japanese counterpart. When either file changes, update the other in the same change so both describe the same behavior.

# Development flow

Before writing or changing tests that trigger navigation on YouTube, read `YT-SPEC.md` for how YouTube's SPA navigation works, and follow the navigation test rules below.

1. Check that the test cases in `SPEC.md` and `SPEC.ja.md` mean the same, then align the test implementation with those cases. Do not weaken a case just to make a test pass.
2. Run the tests, then converge the implementation until they pass. A case is converged only when a test covers it.

# YouTube navigation test rules

- Prefer the helpers in `tests/utils.ts` over raw clicks and `goto` calls; they encode the waiting rules below.
- An element being visible does not mean the navigation is complete. Wait for the navigation-end event before interacting with anything that depends on the routed page, and before clicking the next link.
- A sort chip click is not a navigation: no navigation event fires and the URL stays unchanged, while the chip bar (desktop) and the video grid re-render asynchronously (`YT-SPEC.md`), detaching nodes resolved before the rebuild. Wait for the video grid's first video node to be replaced and the grid to settle (`YtChannelPage.navigateToSort`), then wait for the target UI to be ready before clicking it once. Do not replay a click on detach: the first click may already have taken effect.
- DOM can render before the router's internal state is ready (`YT-SPEC.md`); clicks during that window can be silently dropped, so helpers retry clicks until the page actually lands (e.g. `YtSearchPage.clickChannelThumbnailButton`).
- The spec tests verify the navigation contracts: `tests/specs/event.spec.ts` (soft navigation fires both navigation-start and navigation-end; hard navigation fires only navigation-end) and `tests/specs/channel-id.spec.ts` (after navigating from search results, the channel id is reachable via the navigation-end event, canonical link, `ytInitialData`, and `ytCommand`).

# Design change reports

When work changes the design, serve the Playwright HTML report and provide its URL to the user. Start the server in the background with `CLAUDECODE=1 bunx playwright show-report` so no browser window opens automatically, then share the URL it prints (default: `http://localhost:9323`).

The `CLAUDECODE=1` prefix is not Claude Code specific: Playwright skips auto-opening the browser whenever its coding-agent detection sees the `CLAUDECODE` or `COPILOT_CLI` env var set, so the prefix works for any agent.
