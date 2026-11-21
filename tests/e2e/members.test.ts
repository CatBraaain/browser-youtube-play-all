import { expect, type Locator, type Page } from "@playwright/test";

import { ytxTest, type EventWatcher } from "../fixture";
import { readFullReferencePlaylist } from "../helpers/playlist";
import {
  membersPlaylistHref,
  YtChannelPage,
  YtVideoPage,
  type MembersPlaylistCategory,
} from "../utils";

const memberChannel = "@NakiriAyame";
const noMemberChannel = "@Apple";
const allMembersKinds = ["Videos", "Shorts", "Streams"] as const;
// @NakiriAyame posts members-only videos and streams but no members-only
// shorts (no UUMS playlist), so its menu lists no Shorts entry.
const memberChannelEntryKinds = ["Videos", "Streams"] as const;
const membersSorts = ["Latest", "Oldest"] as const;

ytxTest.setTimeout(300_000);

function menuItemName(kind: MembersPlaylistCategory, sort: "Latest" | "Oldest") {
  return `${kind} (Members ${sort})`;
}

async function openPlayAllMenu(page: Page) {
  const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
  await dropdown.waitFor({ timeout: 30_000 });
  await dropdown.locator("button").describe("Play All menu toggle").click();
  const menu = dropdown.locator(":scope > div").describe("Play All menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByText("Videos (Latest)", { exact: true })).toBeVisible({ timeout: 30_000 });
  return menu;
}

async function expectMenuEntryLinksToMembersPlaylist(
  menu: Locator,
  kind: MembersPlaylistCategory,
  sort: "Latest" | "Oldest",
) {
  const link = menu
    .getByText(menuItemName(kind, sort), { exact: true })
    .describe(menuItemName(kind, sort));
  await expect(link).toHaveAttribute("href", membersPlaylistHref(kind, sort), { timeout: 60_000 });
  return link;
}

async function activateMenuEntry(
  page: Page,
  watcher: EventWatcher,
  link: Locator,
  expectedListId: string,
) {
  const since = await watcher.captureNavigationBaseline();
  await link.click();
  await watcher.waitForNavigationEnd({
    since,
    expectedUrl: new RegExp(`[?&]list=${expectedListId}(?:&|$)`),
    timeout: 60_000,
  });
  expect(new URL(page.url()).searchParams.get("list")).toBe(expectedListId);
}

ytxTest("Members: menu entries follow the channel's membership", async ({ page, eventWatcher }) => {
  const channelPage = new YtChannelPage(memberChannel, page, eventWatcher);
  await channelPage.navigateToCategory("Videos", "hard");
  const menu = await openPlayAllMenu(page);
  for (const kind of memberChannelEntryKinds) {
    for (const sort of membersSorts) await expectMenuEntryLinksToMembersPlaylist(menu, kind, sort);
  }
  for (const sort of membersSorts) {
    await expect(menu.getByText(menuItemName("Shorts", sort), { exact: true })).toHaveCount(0);
  }

  const other = new YtChannelPage(noMemberChannel, page, eventWatcher);
  await other.navigateToCategory("Videos", "hard");
  const otherMenu = await openPlayAllMenu(page);
  for (const kind of allMembersKinds) {
    for (const sort of membersSorts) {
      await expect(otherMenu.getByText(menuItemName(kind, sort), { exact: true })).toHaveCount(0);
    }
  }
});

for (const kind of memberChannelEntryKinds) {
  for (const sort of membersSorts) {
    ytxTest(
      `Members: ${sort} menu destination matches the independent ${kind} playlist`,
      async ({ page, eventWatcher }) => {
        const channel = new YtChannelPage(memberChannel, page, eventWatcher);
        await channel.navigateToCategory("Videos", "hard");
        const menu = await openPlayAllMenu(page);
        const link = await expectMenuEntryLinksToMembersPlaylist(menu, kind, sort);
        const url = new URL((await link.getAttribute("href"))!, page.url());
        const listId = url.searchParams.get("list")!;
        const reference = await readFullReferencePlaylist(page, listId);
        const expectedIds = reference.map((row) => row.videoId);
        expect(expectedIds.length).toBeGreaterThan(0);
        const videos = new YtVideoPage(page);
        if (sort === "Oldest") {
          const oldestId = expectedIds.at(-1)!;
          expect(url.searchParams.get("v")).toBe(oldestId);
          expect(url.searchParams.get("index")).toBe(String(expectedIds.length));
          if (kind === "Streams") expect(expectedIds.slice(0, 3)).not.toContain(oldestId);
          await activateMenuEntry(page, eventWatcher, link, listId);
          expect(new URL(page.url()).searchParams.get("v")).toBe(oldestId);
          await expect
            .poll(() => videos.getPlaylistSelectedVideoId(), { timeout: 60_000 })
            .toBe(oldestId);
        } else {
          await activateMenuEntry(page, eventWatcher, link, listId);
          const leadingIds = expectedIds.slice(0, 3);
          await expect
            .poll(() => videos.getPlaylistVideoIds(leadingIds.length), { timeout: 60_000 })
            .toEqual(leadingIds);
        }
      },
    );
  }
}
