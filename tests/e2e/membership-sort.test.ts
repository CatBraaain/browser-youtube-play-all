import { expect } from "@playwright/test";

import { ytxTest } from "../fixture";
import { YtChannelPage } from "../utils";

// A channel whose category pages render the sort dropdown UI: a sort
// combobox chip labeled with the current sort, next to "Members only" /
// "Public" audience filter chips, instead of the three sort chips
// (YT-SPEC.md "Sort dropdown UI").
const membersChannel = "@NASASpaceflight";

ytxTest(
  "Members: button follows sort picks from the sort dropdown popup",
  async ({ page, eventWatcher }) => {
    const ytChannelPage = new YtChannelPage(membersChannel, page, eventWatcher);
    await ytChannelPage.navigateToCategory("Videos", "hard");
    const latestButton = page
      .locator(".play-all-btn.videos.latest")
      .describe("Play All Latest button");
    await expect(latestButton).toBeVisible({ timeout: 30_000 });
    await expect(latestButton).toHaveAttribute("href", /^\/playlist\?list=UULF[\w-]+&playnext=1$/, {
      timeout: 30_000,
    });

    await ytChannelPage.navigateToSort("Popular");
    const popularButton = page
      .locator(".play-all-btn.videos.popular")
      .describe("Play All Popular button");
    await expect(popularButton).toHaveText("Play All (Popular)", { timeout: 30_000 });
    await expect(popularButton).toHaveAttribute(
      "href",
      /^\/playlist\?list=UULP[\w-]+&playnext=1$/,
      { timeout: 30_000 },
    );

    await ytChannelPage.navigateToSort("Oldest");
    const oldestButton = page
      .locator(".play-all-btn.videos.oldest")
      .describe("Play All Oldest button");
    // The Oldest href needs a network resolution and can lag the label.
    await expect(oldestButton).toHaveAttribute(
      "href",
      /^\/watch\?v=[\w-]{11}&list=UL01234567890$/,
      { timeout: 60_000 },
    );
    await expect(oldestButton).not.toContainText("(error)");
  },
);

ytxTest("Members: audience filter chips keep the button's sort", async ({ page, eventWatcher }) => {
  const ytChannelPage = new YtChannelPage(membersChannel, page, eventWatcher);
  await ytChannelPage.navigateToCategory("Videos", "hard");
  const latestButton = page
    .locator(".play-all-btn.videos.latest")
    .describe("Play All Latest button");
  await expect(latestButton).toBeVisible({ timeout: 30_000 });
  await expect(latestButton).toHaveAttribute("href", /^\/playlist\?list=UULF[\w-]+&playnext=1$/, {
    timeout: 30_000,
  });

  // The filter chips carry aria-selected like sort buttons do; toggling them
  // must never read as a sort change (regression: "Members only" sat at the
  // classic Popular index and relabeled the button "Play All (Popular)").
  const membersOnlyChip = page
    .locator("chip-bar-view-model button[role=tab]")
    .nth(0)
    .describe("Members only filter chip");
  await membersOnlyChip.click();
  await expect(
    page.locator(".play-all-btn.videos.popular").describe("Play All Popular button"),
  ).toHaveCount(0);
  await expect(latestButton).toHaveText("Play All (Latest)");
  await expect(latestButton).toHaveAttribute("href", /^\/playlist\?list=UULF[\w-]+&playnext=1$/);

  const publicChip = page
    .locator("chip-bar-view-model button[role=tab]")
    .nth(1)
    .describe("Public filter chip");
  await publicChip.click();
  await expect(latestButton).toHaveText("Play All (Latest)");
  await expect(latestButton).toHaveAttribute("href", /^\/playlist\?list=UULF[\w-]+&playnext=1$/);
});
