import { expect, type Page, type TestInfo } from "@playwright/test";

import { YoutubeDOM } from "@/entrypoints/play-all-button.content/youtube-dom";

import { ytxTest, type EventWatcher } from "../fixture";
import { installFetchGate, releaseFetchGate } from "../helpers/fetch-gate";
import { PlayAllJourney } from "../helpers/play-all-journey";
import { YtVideoPage } from "../utils";
import { nasaChannel, type Route } from "./combinations";

const routes: Route[] = ["hard", "soft1", "soft2"];
ytxTest.setTimeout(240_000);

async function reachCategory(
  page: Page,
  watcher: EventWatcher,
  info: TestInfo,
  channel: string,
  route: Route,
  category: "Videos" | "Streams" = "Videos",
) {
  const journey = new PlayAllJourney(page, watcher, info);
  await journey.search(channel, route);
  await journey.openHome(channel, route);
  await journey.openCategory(category, route);
  return journey;
}

function skipMobileSoft2(info: TestInfo, route: Route) {
  ytxTest.skip(info.project.name.includes("mobile") && route === "soft2", "soft2 is desktop-only");
}

for (const route of routes) {
  for (const audience of ["Public", "Members only"] as const) {
    ytxTest(
      `A01: delayed Oldest keeps Popular for ${audience} via ${route}`,
      async ({ page, eventWatcher }, info) => {
        skipMobileSoft2(info, route);
        const delayedPlaylist =
          audience === "Public" ? "/playlist?list=UULF" : "/playlist?list=UUMF";
        const gatedEntryText =
          audience === "Public" ? "Videos (Oldest)" : "Videos (Members Latest)";
        await installFetchGate(page, { delay: [delayedPlaylist] });
        const journey = await reachCategory(
          page,
          eventWatcher,
          info,
          audience === "Public" ? "@Microsoft" : nasaChannel,
          route,
        );
        try {
          await journey.defineCase({
            case: "A01",
            channel: journey.channel,
            category: "Videos",
            sort: "Oldest",
            audience,
            route,
          });
          await expect(page.locator(".play-all-btn.latest")).toBeVisible({ timeout: 30_000 });
          await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.ytxFetchGateHeld), {
              timeout: 30_000,
            })
            .toContain(delayedPlaylist);
          await expect(page.locator(".play-all-btns:visible")).toHaveCount(1);
          await expect(
            page.locator(".play-all-btns:visible").getByText(gatedEntryText, { exact: true }),
          ).toHaveCount(0);
          if (audience === "Members only") {
            await journey.selectSort("Latest");
            await journey.activateAudience("Members only");
            await journey.expectAudience("Members only", "Videos", "Latest");
          }
          await journey.selectSort("Oldest");
          await journey.selectSort("Latest");
          await journey.selectSort("Popular");
          await journey.expectSort("Popular");
          if (audience === "Public") await journey.expectButton("Public", "Popular");
          else {
            await journey.expectAudience("Members only", "Videos", "Popular");
            await journey.channelPage.expectNoPlayAllButton();
          }
          await releaseFetchGate(page);
          await expect(page.locator(".play-all-btns:visible")).toHaveCount(1, { timeout: 60_000 });
          await expect(
            page.locator(".play-all-btns:visible").getByText(gatedEntryText, { exact: true }),
          ).toHaveCount(1);
          await journey.expectSort("Popular");
          if (audience === "Members only") {
            await journey.expectAudience("Members only", "Videos", "Popular");
            await journey.channelPage.expectNoPlayAllButton();
            await journey.activateAudience("Public");
            await journey.expectAudience("Public", "Videos", "Popular");
          }
          await journey.expectButton("Public", "Popular");
          await journey.expectWorkingLink("Public", "Popular");
        } finally {
          await releaseFetchGate(page);
          await journey.dispose();
        }
      },
    );
  }

  for (const outcome of [
    "keeps the menu destination usable",
    "recovers the Popular button",
  ] as const) {
    ytxTest(`E01: failed Oldest ${outcome} via ${route}`, async ({ page, eventWatcher }, info) => {
      skipMobileSoft2(info, route);
      await installFetchGate(page, { abort: ["/playlist?list=UULF"] });
      const journey = await reachCategory(page, eventWatcher, info, "@Microsoft", route);
      try {
        await journey.defineCase({
          case: "E01",
          channel: journey.channel,
          category: "Videos",
          sort: "Oldest",
          audience: "Public",
          route,
        });
        await journey.expectButton("Public", "Latest");
        const dropdown = page.locator(".play-all-btns").describe("Play All dropdown");
        await expect(dropdown).toHaveCount(1, { timeout: 30_000 });
        await expect(dropdown.locator('a[href*="list=UULF"]')).toHaveCount(1);
        await expect(dropdown.locator('a[href*="list=UULP"]')).toHaveCount(1);
        await journey.selectSort("Oldest");
        const button = journey.button("Public", "Oldest");
        await expect(button).toHaveText("Play All (Oldest) (error)", { timeout: 30_000 });
        await expect(button).not.toHaveAttribute("href");
        await page.evaluate(() => {
          (window as any).__errorButtonClicks = 0;
          document.addEventListener(
            "click",
            (event) => {
              if ((event.target as Element).closest(".play-all-btn.oldest"))
                (window as any).__errorButtonClicks++;
            },
            { capture: true },
          );
        });
        const url = page.url();
        await button.click();
        expect(await page.evaluate(() => (window as any).__errorButtonClicks)).toBe(1);
        await expect(page).toHaveURL(url);
        await expect(page.locator(YoutubeDOM.SORT_BUTTON).nth(2)).toHaveAttribute(
          "aria-selected",
          "true",
        );
        if (outcome === "keeps the menu destination usable") {
          await ytxTest.step("Open the menu after the error and follow Popular", async () => {
            await journey.toggle.click();
            await expect(journey.menu).toBeVisible();
            const popular = journey.menu
              .locator('a[href*="list=UULP"]')
              .describe("Public Videos Popular menu link");
            await expect(popular).toBeVisible();
            const listId = new URL(
              (await popular.getAttribute("href"))!,
              page.url(),
            ).searchParams.get("list")!;
            expect(listId).toMatch(/^UULP[\w-]{22}$/);
            const since = await eventWatcher.captureNavigationBaseline();
            await popular.click();
            await eventWatcher.waitForNavigationEnd({
              since,
              expectedUrl: new RegExp(`[?&]list=${listId}(?:&|$)`),
              timeout: 60_000,
            });
            expect(new URL(page.url()).searchParams.get("list")).toBe(listId);
            const videos = new YtVideoPage(page);
            await expect
              .poll(() => videos.getPlaylistVideoIds(1), { timeout: 60_000 })
              .toEqual([expect.stringMatching(/^[\w-]{11}$/)]);
          });
        } else {
          await ytxTest.step("Recover Popular on the original category page", async () => {
            await journey.selectSort("Popular");
            await journey.expectButton("Public", "Popular");
            await journey.expectWorkingLink("Public", "Popular");
            await expect(page).toHaveURL(url);
          });
        }
      } finally {
        await journey.dispose();
      }
    });
  }

  for (const category of ["Videos", "Streams"] as const) {
    for (const sort of ["Latest", "Oldest"] as const) {
      ytxTest(
        `E02: failed members ${category} ${sort} has no link via ${route}`,
        async ({ page, eventWatcher }, info) => {
          skipMobileSoft2(info, route);
          await installFetchGate(page, {
            abort: [`/playlist?list=${category === "Videos" ? "UUMF" : "UUMV"}`],
          });
          const journey = await reachCategory(
            page,
            eventWatcher,
            info,
            nasaChannel,
            route,
            category,
          );
          try {
            await journey.defineCase({
              case: "E02",
              channel: nasaChannel,
              category,
              sort,
              audience: "Members only",
              route,
            });
            await journey.selectSort(sort);
            await journey.expectButton("Public", sort);
            await journey.expectWorkingLink("Public", sort);
            await journey.activateAudience("Members only");
            await journey.expectAudience("Members only", category, sort);
            const button = journey.button("Members only", sort);
            await expect(button).toBeVisible({ timeout: 60_000 });
            await expect(button).toHaveText(`Play All (${sort}) (error)`, { timeout: 60_000 });
            await expect(button).not.toHaveAttribute("href");
            const url = page.url();
            await button.click();
            await expect(page).toHaveURL(url);
            await journey.activateAudience("Public");
            await journey.expectAudience("Public", category, sort);
            await journey.expectButton("Public", sort);
            await journey.expectWorkingLink("Public", sort);
            const other = category === "Videos" ? "Streams" : "Videos";
            await journey.openCategory(other, route);
            await journey.selectSort(sort);
            await journey.activateAudience("Members only");
            await journey.expectAudience("Members only", other, sort);
            await journey.expectButton("Members only", sort);
            await journey.expectWorkingLink("Members only", sort);
          } finally {
            await journey.dispose();
          }
        },
      );
    }
  }
}
