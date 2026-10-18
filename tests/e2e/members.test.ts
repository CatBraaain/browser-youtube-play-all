import { expect, type Page } from "@playwright/test";

import { ytxTest } from "../fixture";
import { YtChannelPage, YtVideoPage } from "../utils";

// A channel that publishes members-only videos and live streams. Its
// members-only video count is small, which keeps the playlist-page
// comparisons cheap; if the channel ever drops all members-only videos the
// resolution fails and the entries legitimately disappear.
const memberChannel = "@NakiriAyame";
const noMemberChannel = "@Apple";

const membersPlaylistPrefixes = {
  Videos: "UUMF",
  Streams: "UUMV",
} as const;
const membersKinds = ["Videos", "Streams"] as const;
const membersSorts = ["Latest", "Oldest"] as const;

function menuItemName(kind: (typeof membersKinds)[number], sort: (typeof membersSorts)[number]) {
  return `${kind} (Members ${sort})`;
}

// Members-only playlist pages render their rows as lockup view models on
// both desktop and mobile web.
async function openMembersPlaylistPage(page: Page, listId: string) {
  await page.goto(`https://www.youtube.com/playlist?list=${listId}`);
  await expect(
    page
      .locator("yt-lockup-view-model a[href*='watch?v=']")
      .first()
      .describe("First playlist page row"),
  ).toBeVisible({ timeout: 30_000 });
}

async function getPlaylistPageVideoIds(page: Page, limit: number): Promise<string[]> {
  return await page
    .locator("yt-lockup-view-model a[href*='watch?v=']")
    .describe("Playlist page rows")
    .evaluateAll(
      (links, args: { limit: number }) => {
        const ids: string[] = [];
        for (const link of links) {
          if (ids.length >= args.limit) break;
          const id = (link.getAttribute("href") ?? "").match(/[?&]v=([\w-]{11})/)?.[1];
          if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
      },
      { limit },
    );
}

async function openPlayAllMenu(page: Page) {
  const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
  await dropdown.waitFor({ timeout: 30_000 });
  await dropdown.locator("button").describe("Play All menu toggle").click();
  const menu = dropdown.locator(":scope > div").describe("Play All menu");
  await expect(menu).toBeVisible();
  return menu;
}

// The category links resolve before the members-only links in the menu's
// render, so their visibility proves the menu has been rebuilt for this
// channel before any members-only assertion runs.
async function expectMenuResolved(page: Page, menu: ReturnType<Page["locator"]>) {
  await expect(
    menu.getByText("Videos (Latest)", { exact: true }).describe("Videos Latest menu item"),
  ).toBeVisible({ timeout: 30_000 });
}

ytxTest("Members: menu entries follow the channel's membership", async ({ page, eventWatcher }) => {
  const ytChannelPage = new YtChannelPage(memberChannel, page, eventWatcher);
  await ytChannelPage.navigateToCategory("Videos", "hard");
  const menu = await openPlayAllMenu(page);
  await expectMenuResolved(page, menu);

  for (const kind of membersKinds) {
    for (const sort of membersSorts) {
      const link = menu
        .getByText(menuItemName(kind, sort), { exact: true })
        .describe(`${menuItemName(kind, sort)} menu item`);
      const hrefPattern =
        sort === "Latest"
          ? new RegExp(`^/playlist\\?list=${membersPlaylistPrefixes[kind]}[\\w-]+&playnext=1$`)
          : new RegExp(
              `^/watch\\?v=[\\w-]{11}&list=${membersPlaylistPrefixes[kind]}[\\w-]+&index=\\d+$`,
            );
      await expect(link).toHaveAttribute("href", hrefPattern, { timeout: 60_000 });
    }
  }

  const otherChannelPage = new YtChannelPage(noMemberChannel, page, eventWatcher);
  await otherChannelPage.navigateToCategory("Videos", "hard");
  const otherMenu = await openPlayAllMenu(page);
  await expectMenuResolved(page, otherMenu);

  for (const kind of membersKinds) {
    for (const sort of membersSorts) {
      await expect(
        otherMenu
          .getByText(menuItemName(kind, sort), { exact: true })
          .describe(`${menuItemName(kind, sort)} menu item`),
      ).toHaveCount(0);
    }
  }
});

membersKinds.forEach((kind) => {
  ytxTest(
    `Members: Latest destination matches the ${kind} members-only playlist page`,
    async ({ page, eventWatcher }) => {
      const ytChannelPage = new YtChannelPage(memberChannel, page, eventWatcher);
      await ytChannelPage.navigateToCategory("Videos", "hard");
      const menu = await openPlayAllMenu(page);
      await expectMenuResolved(page, menu);

      const link = menu
        .getByText(menuItemName(kind, "Latest"), { exact: true })
        .describe(`${menuItemName(kind, "Latest")} menu item`);
      await expect(link).toHaveAttribute(
        "href",
        new RegExp(`list=${membersPlaylistPrefixes[kind]}[\\w-]+&playnext=1`),
        { timeout: 60_000 },
      );
      const expectedListId = new URL(
        (await link.getAttribute("href"))!,
        page.url(),
      ).searchParams.get("list")!;

      const playlistTab = await page.context().newPage();
      try {
        await openMembersPlaylistPage(playlistTab, expectedListId);
        const expectedIds = await getPlaylistPageVideoIds(playlistTab, 3);
        expect(expectedIds.length).toBeGreaterThan(0);

        await link.click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("list"), { timeout: 30_000 })
          .toBe(expectedListId);
        const ytVideoPage = new YtVideoPage(page);
        await expect
          .poll(() => ytVideoPage.getPlaylistVideoIds(expectedIds.length), { timeout: 60_000 })
          .toEqual(expectedIds);
      } finally {
        await playlistTab.close();
      }
    },
  );

  ytxTest(
    `Members: Oldest destination selects the oldest ${kind} members-only item`,
    async ({ page, eventWatcher }) => {
      const ytChannelPage = new YtChannelPage(memberChannel, page, eventWatcher);
      await ytChannelPage.navigateToCategory("Videos", "hard");
      const menu = await openPlayAllMenu(page);
      await expectMenuResolved(page, menu);

      const link = menu
        .getByText(menuItemName(kind, "Oldest"), { exact: true })
        .describe(`${menuItemName(kind, "Oldest")} menu item`);
      await expect(link).toHaveAttribute(
        "href",
        new RegExp(`list=${membersPlaylistPrefixes[kind]}[\\w-]+&index=\\d+`),
        { timeout: 60_000 },
      );
      const hrefUrl = new URL((await link.getAttribute("href"))!, page.url());
      const expectedVideoId = hrefUrl.searchParams.get("v")!;

      const playlistTab = await page.context().newPage();
      try {
        await openMembersPlaylistPage(playlistTab, hrefUrl.searchParams.get("list")!);
        if (kind === "Videos") {
          // The members-only video playlist is short: the un-scrolled page
          // lists every row, so the selected video must equal its literal
          // last row and the link's index must equal the row count.
          const rows = await getPlaylistPageVideoIds(playlistTab, 100);
          expect(rows.length).toBeGreaterThan(0);
          expect(expectedVideoId).toBe(rows.at(-1));
          expect(String(rows.length)).toBe(hrefUrl.searchParams.get("index"));
        } else {
          // The live-stream playlist is long and lazily loaded. Its oldest
          // item is not among the leading rows, and the Oldest link starts
          // playback at the playlist's final index.
          const leadingIds = await getPlaylistPageVideoIds(playlistTab, 3);
          expect(leadingIds).not.toContain(expectedVideoId);
        }

        await link.click();
        await expect
          .poll(() => new URL(page.url()).searchParams.get("v"), { timeout: 30_000 })
          .toBe(expectedVideoId);
        const ytVideoPage = new YtVideoPage(page);
        await expect
          .poll(() => ytVideoPage.getPlaylistSelectedVideoId(), { timeout: 60_000 })
          .toBe(expectedVideoId);
      } finally {
        await playlistTab.close();
      }
    },
  );
});
