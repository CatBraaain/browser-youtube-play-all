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

ytxTest(
  "Members: button follows the audience filter to the members playlist",
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

    // Activating "Members only" switches the button to the members-only
    // playlist of the current category and sort (SPEC.md "Selected sort"),
    // without reading as a sort change (regression: "Members only" sat at the
    // classic Popular index and relabeled the button "Play All (Popular)").
    await ytChannelPage.selectAudienceFilter("MembersOnly");
    const membersLatestButton = page
      .locator(".play-all-btn.videos.latest.members")
      .describe("Play All Members Latest button");
    await expect(membersLatestButton).toHaveText("Play All (Latest)", { timeout: 30_000 });
    await expect(membersLatestButton).toHaveAttribute(
      "href",
      /^\/playlist\?list=UUMF[\w-]+&playnext=1$/,
      { timeout: 30_000 },
    );

    // Activating "Public" switches the button back to the public playlist.
    await ytChannelPage.selectAudienceFilter("Public");
    const publicLatestButton = page
      .locator(".play-all-btn.videos.latest")
      .describe("Play All Latest button");
    await expect(publicLatestButton).toHaveText("Play All (Latest)");
    await expect(publicLatestButton).toHaveAttribute(
      "href",
      /^\/playlist\?list=UULF[\w-]+&playnext=1$/,
    );
  },
);

ytxTest(
  "Members: audience filter hides the button without a members-only Popular",
  async ({ page, eventWatcher }) => {
    const ytChannelPage = new YtChannelPage(membersChannel, page, eventWatcher);
    await ytChannelPage.navigateToCategory("Videos", "hard");
    await ytChannelPage.navigateToSort("Popular");
    await ytChannelPage.selectAudienceFilter("MembersOnly");
    // Members-only playlists have no Popular sort: with the filter active the
    // button has no destination to offer and is not shown (SPEC.md "Selected
    // sort").
    await expect(page.locator(".play-all-btn").describe("Play All button")).toHaveCount(0);

    // With Oldest selected the button is back: the label follows the sort and
    // the destination starts playback at the members-only playlist's oldest
    // item.
    await ytChannelPage.navigateToSort("Oldest");
    const membersOldestButton = page
      .locator(".play-all-btn.videos.oldest.members")
      .describe("Play All Members Oldest button");
    await expect(membersOldestButton).toHaveText("Play All (Oldest)", { timeout: 30_000 });
    await expect(membersOldestButton).toHaveAttribute(
      "href",
      /^\/watch\?v=[\w-]{11}&list=UUMF[\w-]+&index=\d+$/,
      { timeout: 30_000 },
    );
    await expect(membersOldestButton).not.toContainText("(error)");
  },
);

ytxTest("Members: audience filter hides the button on Shorts", async ({ page, eventWatcher }) => {
  const ytChannelPage = new YtChannelPage(membersChannel, page, eventWatcher);
  await ytChannelPage.navigateToCategory("Shorts", "hard");
  const shortsButton = page
    .locator(".play-all-btn.shorts.latest")
    .describe("Play All Shorts Latest button");
  await expect(shortsButton).toBeVisible({ timeout: 30_000 });
  await expect(shortsButton).toHaveAttribute("href", /^\/playlist\?list=UUSH[\w-]+&playnext=1$/, {
    timeout: 30_000,
  });

  // Members-only playlists do not exist for Shorts: with the filter active
  // the button has no destination to offer and is not shown
  // (SPEC.md "Selected sort").
  await ytChannelPage.selectAudienceFilter("MembersOnly");
  await expect(page.locator(".play-all-btn").describe("Play All button")).toHaveCount(0);
});
