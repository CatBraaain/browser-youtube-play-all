import { expect } from "@playwright/test";

import { YTD_EVENTS } from "@/entrypoints/play-all-button.content/youtube-hooks";

import { ytxTest } from "../fixture";
import { PLAYLIST_PREFIXES, PUBLIC_OLDEST_LIST_ID, YtSearchPage } from "../utils";
import { nasaMenuEntries, type MenuEntry } from "./combinations";

const origin = "https://www.youtube.com";
const channelHandle = "@MembershipFixture";
const channelSuffix = "a".repeat(22);
const oldestVideoIds = new Map([
  ["UULF", "videos00001"],
  ["UUSH", "shorts00001"],
  ["UULV", "stream00001"],
  ["UUMF", "member00001"],
  ["UUMS", "member00002"],
  ["UUMV", "member00003"],
]);
const videosOldestHref = menuHref({ audience: "Public", category: "Videos", sort: "Oldest" });
const shortsOldestHref = menuHref({ audience: "Public", category: "Shorts", sort: "Oldest" });

ytxTest(
  "A02: uses resolved menu links while public Videos Oldest is pending",
  async ({ context, page, eventWatcher }, testInfo) => {
    ytxTest.skip(testInfo.project.name !== "chrome-desktop-e2e", "A02 uses Chrome desktop");

    ytxTest.setTimeout(15_000);

    let releaseVideosOldest!: () => void;
    const holdVideosOldest = new Promise<void>((resolve) => {
      releaseVideosOldest = resolve;
    });
    let isVideosOldestHeld = false;
    await context.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === `/${channelHandle}`) {
        await route.fulfill({
          contentType: "text/html",
          body: `<!doctype html>
<link rel="canonical" href="${origin}/channel/UC${channelSuffix}">
<yt-flexible-actions-view-model></yt-flexible-actions-view-model>
<script>window.dispatchEvent(new Event(${JSON.stringify(YTD_EVENTS.NAVIGATION_END)}))</script>`,
        });
        return;
      }
      if (url.pathname + url.search === shortsOldestHref) {
        await route.fulfill({ body: "Shorts Oldest destination" });
        return;
      }

      const listId = url.searchParams.get("list");
      const prefix = listId?.slice(0, 4);
      const videoId = prefix && oldestVideoIds.get(prefix);
      if (url.pathname !== "/playlist" || !videoId || listId !== prefix + channelSuffix) {
        await route.fulfill({ status: 404 });
        return;
      }
      const hasIndex = url.searchParams.has("index");
      if (prefix === PLAYLIST_PREFIXES.public.Videos.Latest && !hasIndex) {
        isVideosOldestHeld = true;
        await holdVideosOldest;
      }
      const playlistState = hasIndex
        ? { currentVideoEndpoint: { watchEndpoint: { videoId } } }
        : { header: { playlistHeaderRenderer: { stats: [{ runs: [{ text: "1 video" }] }] } } };
      await route.fulfill({
        contentType: "text/html",
        body: `<script type="application/json" id="yt-initial-data">${JSON.stringify(playlistState)}</script>`,
      });
    });

    const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
    const toggle = dropdown.getByRole("button").describe("Play All menu toggle");
    const links = dropdown.getByRole("link").describe("Play All menu links");
    const expectedLinks = nasaMenuEntries.map((entry) => ({
      label: `${entry.category} (${entry.audience === "Members only" ? "Members " : ""}${entry.sort})`,
      href: menuHref(entry),
    }));
    const linksWhileHeld = expectedLinks.filter(({ href }) => href !== videosOldestHref);
    function readVisibleLinks() {
      return links.evaluateAll((nodes) =>
        nodes.map((node) => ({ label: node.textContent, href: node.getAttribute("href") })),
      );
    }

    async function openMenuWithVideosOldestHeld() {
      isVideosOldestHeld = false;
      await new YtSearchPage(page, eventWatcher).navigateToChannel(channelHandle, "hard");
      await expect.poll(() => isVideosOldestHeld).toBe(true);
      await toggle.click();
    }

    try {
      await ytxTest.step(
        "Open the channel menu with public Videos Oldest held",
        openMenuWithVideosOldestHeld,
      );
      await ytxTest.step("Use a resolved link without releasing Videos Oldest", async () => {
        await expect.poll(readVisibleLinks).toEqual(linksWhileHeld);
        const shortsOldest = dropdown
          .locator(`a[href="${shortsOldestHref}"]`)
          .describe("Public Shorts Oldest link");
        await shortsOldest.click();
        await expect(page).toHaveURL(origin + shortsOldestHref);
        await expect(page.locator("body")).toHaveText("Shorts Oldest destination");
      });
      await ytxTest.step("Return to the menu and release Videos Oldest", async () => {
        await openMenuWithVideosOldestHeld();
        await expect.poll(readVisibleLinks).toEqual(linksWhileHeld);
        releaseVideosOldest();
        await expect.poll(readVisibleLinks).toEqual(expectedLinks);
      });
    } finally {
      releaseVideosOldest();
    }
  },
);

function menuHref({ audience, category, sort }: MenuEntry): string {
  if (audience === "Public" && sort !== "Oldest") {
    return `/playlist?list=${PLAYLIST_PREFIXES.public[category][sort]}${channelSuffix}&playnext=1`;
  }
  if (audience === "Public") {
    const videoId = oldestVideoIds.get(PLAYLIST_PREFIXES.public[category].Latest);
    return `/watch?v=${videoId}&list=${PUBLIC_OLDEST_LIST_ID}`;
  }
  const membersPrefix = PLAYLIST_PREFIXES.members[category];
  const membersListId = membersPrefix + channelSuffix;
  if (sort === "Oldest") {
    return `/watch?v=${oldestVideoIds.get(membersPrefix)}&list=${membersListId}&index=1`;
  }
  return `/playlist?list=${membersListId}&playnext=1`;
}
