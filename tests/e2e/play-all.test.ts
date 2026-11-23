import { expect, type Page, type TestInfo } from "@playwright/test";

import { ytxTest, type EventWatcher } from "../fixture";
import { PlayAllJourney, humanClick } from "../helpers/play-all-journey";
import {
  appleChannel,
  d01First3Rows,
  d01OldestRows,
  d02HiddenRows,
  d02MembersLatestRows,
  d02MembersOldestRows,
  d02PublicFirst3Rows,
  d02PublicOldestRows,
  nasaChannel,
  nasaMenuEntries,
  publicMenuEntries,
  type CellRow,
  type MenuEntry,
  type Route,
} from "./combinations";

ytxTest.use({ trace: "on" });

function mobileSkipsSoft2(testInfo: TestInfo, route: Route) {
  return testInfo.project.name.includes("mobile") && route === "soft2";
}

async function verifyCell(
  page: Page,
  eventWatcher: EventWatcher,
  testInfo: TestInfo,
  timeoutMs: number,
  run: (journey: PlayAllJourney) => Promise<void>,
) {
  testInfo.setTimeout(timeoutMs);
  const journey = new PlayAllJourney(page, eventWatcher, testInfo);
  try {
    await ytxTest.step("Verify the cell and capture its evidence", async () => {
      await journey.attachJson("extension-context", {
        project: testInfo.project.name,
        loader: "ytxTest.context",
        headless: true,
      });
      await run(journey);
    });
  } finally {
    await journey.dispose();
  }
}

async function reachChannelHome(journey: PlayAllJourney, channel: string, route: Route) {
  await ytxTest.step("Reach the channel home via search", async () => {
    await journey.search(channel, route);
    const resultsUrl = new URL(journey.page.url());
    expect(resultsUrl.pathname).toBe("/results");
    expect(resultsUrl.searchParams.get("search_query")).toBe(channel);
    await journey.openHome(channel, route);
    expect(new URL(journey.page.url()).pathname.toLowerCase().replace(/\/$/, "")).toBe(
      `/${channel}`.toLowerCase(),
    );
  });
}

async function runD03Home(journey: PlayAllJourney, entries: MenuEntry[]) {
  await ytxTest.step("D03: Verify the home menu and capture its states", async () => {
    await expect(journey.toggle).toBeVisible({ timeout: 60_000 });
    await expect(journey.menu).toBeHidden();
    await humanClick(journey.toggle);
    await expect(journey.menu).toBeVisible();
    await humanClick(journey.toggle);
    await expect(journey.menu).toBeHidden();
    await journey.anchorToggle();
    await journey.capture("home-closed");
    await humanClick(journey.toggle);
    await expect(journey.menu).toBeVisible();
    await journey.expectMenuEntries(entries);
    await journey.expectMenuInViewport();
    await journey.capture("home-open");
    await journey.clickOutside();
    await expect(journey.menu).toBeHidden();
  });
}

async function reachPlaylistCategory(
  journey: PlayAllJourney,
  channel: string,
  row: CellRow,
  homeMenuEntries?: MenuEntry[],
) {
  if (row.route === "hard" && !homeMenuEntries) {
    await ytxTest.step("Load the category directly", () =>
      journey.openDirectCategory(channel, row.category),
    );
    return;
  }
  await reachChannelHome(journey, channel, row.route);
  if (homeMenuEntries) await runD03Home(journey, homeMenuEntries);
  await journey.openCategory(row.category, row.route);
}

async function runPublicFirst3(
  journey: PlayAllJourney,
  channel: string,
  row: CellRow,
  entries: MenuEntry[],
  membershipChannel: boolean,
) {
  await journey.defineCase({
    case: membershipChannel ? "D02" : "D01",
    channel,
    ...row,
    audience: "Public",
  });
  const homeMenuEntries = row.category === "Videos" && row.sort === "Latest" ? entries : undefined;
  await reachPlaylistCategory(journey, channel, row, homeMenuEntries);
  await journey.expectCategory(channel, row.category);
  await journey.selectSort(row.sort);
  await journey.expectSort(row.sort);
  if (membershipChannel) {
    await journey.activateAudience("Public");
    await journey.expectAudience("Public", row.category, row.sort);
  }
  if (row.route === "hard") await journey.saveGridIds(row.category, row.sort, 3);
  await journey.expectButton("Public", row.sort);
  await journey.expectWorkingLink("Public", row.sort);
  await journey.capture("public-button");
  if (row.route !== "hard") return;
  await journey.pressPlayAll("Public", row.sort);
  await journey.expectDestination();
  await expect(journey.panel).toBeVisible({ timeout: 60_000 });
  await journey.comparePublicFirstThree();
  expect(journey.comparedPanelIds).toEqual(journey.savedIds);
  expect(journey.comparisonExcludedIds.every((id) => !journey.comparedPanelIds.includes(id))).toBe(
    true,
  );
  await journey.showPanel(false);
  await journey.capture("public-destination");
}

async function runPublicOldest(
  journey: PlayAllJourney,
  channel: string,
  row: CellRow,
  membershipChannel: boolean,
) {
  await journey.defineCase({
    case: membershipChannel ? "D02" : "D01",
    channel,
    ...row,
    audience: "Public",
  });
  await reachPlaylistCategory(journey, channel, row);
  await journey.expectCategory(channel, row.category);
  if (!membershipChannel || row.category === "Videos") {
    await journey.selectSort("Latest");
    await journey.expectSort("Latest");
    await journey.expectButton("Public", "Latest");
    await journey.expectWorkingLink("Public", "Latest");
    await journey.selectSort("Popular");
    await journey.expectSort("Popular");
    await journey.expectButton("Public", "Popular");
    await journey.expectWorkingLink("Public", "Popular");
  }
  await journey.selectSort("Oldest");
  await journey.expectSort("Oldest");
  if (membershipChannel) {
    await journey.activateAudience("Public");
    await journey.expectAudience("Public", row.category, "Oldest");
  }
  const checkShortsLink = !membershipChannel && row.category === "Shorts";
  if (row.route === "hard" || checkShortsLink) await journey.saveGridIds(row.category, "Oldest", 1);
  await journey.expectButton("Public", "Oldest");
  await journey.expectWorkingLink("Public", "Oldest");
  if (checkShortsLink) {
    const oldestId = journey.savedIds[0]!;
    const grid = journey.testInfo.project.name.includes("mobile")
      ? "ytm-browse .modern-tabs"
      : "ytd-browse[role='main'] #primary #contents";
    await expect(
      journey.page.locator(`${grid} a[href='/shorts/${oldestId}']:visible`).first(),
    ).toBeVisible();
    await expect(journey.page.locator(`${grid} [class*='skeleton' i]:visible`)).toHaveCount(0);
    expect(
      new URL(
        (await journey.button("Public", "Oldest").getAttribute("href"))!,
        journey.page.url(),
      ).searchParams.get("v"),
    ).toBe(oldestId);
  }
  await journey.capture("public-button");
  if (row.route !== "hard") return;
  await journey.resolveChannelId();
  await journey.pressPlayAll("Public", "Oldest");
  await journey.expectDestination();
  await expect(journey.panel).toBeVisible({ timeout: 60_000 });
  await journey.compareSelected(false);
  await journey.verifyOldestSharedDestination();
  await journey.showPanel(true);
  await journey.capture("public-destination");
}

async function runMembersLatest(journey: PlayAllJourney, row: CellRow) {
  await journey.defineCase({ case: "D02", channel: nasaChannel, ...row, audience: "Members only" });
  await reachPlaylistCategory(journey, nasaChannel, row);
  await journey.expectCategory(nasaChannel, row.category);
  await journey.selectSort("Latest");
  await journey.expectSort("Latest");
  await journey.activateAudience("Public");
  await journey.expectAudience("Public", row.category, "Latest");
  await journey.expectButton("Public", "Latest");
  await journey.expectWorkingLink("Public", "Latest");
  await journey.capture("public-state");
  await journey.activateAudience("Members only");
  await journey.expectAudience("Members only", row.category, "Latest");
  await journey.expectButton("Members only", "Latest");
  await journey.expectWorkingLink("Members only", "Latest");
  await journey.capture("members-button");
  await journey.activateAudience("Public");
  await journey.expectAudience("Public", row.category, "Latest");
  await journey.expectWorkingLink("Public", "Latest");
  await journey.activateAudience("Members only");
  await journey.expectAudience("Members only", row.category, "Latest");
  await journey.expectWorkingLink("Members only", "Latest");
  if (row.route !== "hard") return;
  await journey.saveFullMembersPlaylist(row.category);
  await journey.expectCategoryUnchanged();
  await journey.pressPlayAll("Members only", "Latest");
  await journey.expectDestination();
  await journey.expectMembersDestination(row.category);
  await expect(journey.panel).toBeVisible({ timeout: 60_000 });
  await journey.compareFullPanel();
  expect(journey.savedIds).toEqual(journey.referenceRows.map((r) => r.videoId));
  expect(journey.comparedPanelIds).toEqual(journey.savedIds);
  expect(journey.comparisonExcludedIds).toEqual([]);
  await journey.showPanel(false);
  await journey.capture("members-destination");
}

async function runMembersOldest(journey: PlayAllJourney, row: CellRow) {
  await journey.defineCase({ case: "D02", channel: nasaChannel, ...row, audience: "Members only" });
  await reachPlaylistCategory(journey, nasaChannel, row);
  await journey.expectCategory(nasaChannel, row.category);
  await journey.selectSort("Oldest");
  await journey.expectSort("Oldest");
  await journey.activateAudience("Public");
  await journey.expectAudience("Public", row.category, "Oldest");
  await journey.expectButton("Public", "Oldest");
  await journey.expectWorkingLink("Public", "Oldest");
  await journey.capture("public-state");
  await journey.activateAudience("Members only");
  await journey.expectAudience("Members only", row.category, "Oldest");
  await journey.expectButton("Members only", "Oldest");
  await journey.expectWorkingLink("Members only", "Oldest");
  await journey.capture("members-button");
  if (row.route !== "hard") return;
  await journey.saveFullMembersPlaylist(row.category);
  await journey.expectCategoryUnchanged();
  await journey.pressPlayAll("Members only", "Oldest");
  await journey.expectDestination();
  await journey.expectMembersDestination(row.category);
  await expect(journey.panel).toBeVisible({ timeout: 60_000 });
  await journey.compareSelected(true);
  expect(journey.savedIds).toEqual(journey.referenceRows.map((r) => r.videoId));
  expect(journey.savedIds.at(-1)).toMatch(/^[\w-]{11}$/);
  await journey.showPanel(true);
  await journey.capture("members-destination");
}

async function runHidden(journey: PlayAllJourney, row: CellRow) {
  await journey.defineCase({ case: "D02", channel: nasaChannel, ...row, audience: "Members only" });
  await reachChannelHome(journey, nasaChannel, row.route);
  await journey.openCategory(row.category, row.route);
  await journey.expectCategory(nasaChannel, row.category);
  await journey.selectSort(row.sort);
  await journey.expectSort(row.sort);
  await journey.activateAudience("Public");
  await journey.expectAudience("Public", row.category, row.sort);
  await journey.expectButton("Public", row.sort);
  await journey.expectWorkingLink("Public", row.sort);
  await journey.capture("public-state");
  await journey.activateAudience("Members only");
  await journey.expectAudience("Members only", row.category, row.sort);
  await journey.channelPage.expectNoPlayAllButton();
  await journey.capture("members-hidden");
  if (row.category !== "Shorts" && row.sort === "Popular") {
    await journey.selectSort("Oldest");
    await journey.expectAudience("Members only", row.category, "Oldest");
    await journey.expectButton("Members only", "Oldest");
    await journey.expectWorkingLink("Members only", "Oldest");
  }
}

ytxTest.describe("D01: Public on @Apple", () => {
  for (const row of d01First3Rows) {
    ytxTest(
      `D01: Public ${row.sort} opens the matching first 3 videos on ${row.category} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 240_000, (journey) =>
          runPublicFirst3(journey, appleChannel, row, publicMenuEntries, false),
        );
      },
    );
  }
  for (const row of d01OldestRows) {
    ytxTest(
      `D01: Public Oldest selects the first channel video on ${row.category} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 240_000, (journey) =>
          runPublicOldest(journey, appleChannel, row, false),
        );
      },
    );
  }
});

ytxTest.describe("D02: Public on @NASASpaceFlight", () => {
  for (const row of d02PublicFirst3Rows) {
    ytxTest(
      `D02: Public ${row.sort} opens the matching first 3 videos on ${row.category} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 240_000, (journey) =>
          runPublicFirst3(journey, nasaChannel, row, nasaMenuEntries, true),
        );
      },
    );
  }
  for (const row of d02PublicOldestRows) {
    ytxTest(
      `D02: Public Oldest selects the first channel video on ${row.category} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 240_000, (journey) =>
          runPublicOldest(journey, nasaChannel, row, true),
        );
      },
    );
  }
});

ytxTest.describe("D02: Members only on @NASASpaceFlight", () => {
  for (const row of d02MembersLatestRows) {
    ytxTest(
      `D02: Members only Latest keeps every playlist row on ${row.category} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 300_000, (journey) =>
          runMembersLatest(journey, row),
        );
      },
    );
  }
  for (const row of d02MembersOldestRows) {
    ytxTest(
      `D02: Members only Oldest selects the last playlist row on ${row.category} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 300_000, (journey) =>
          runMembersOldest(journey, row),
        );
      },
    );
  }
  for (const row of d02HiddenRows) {
    ytxTest(
      `D02: Members only hides Play All for ${row.category} in ${row.sort} via ${row.route}`,
      async ({ page, eventWatcher }, testInfo) => {
        ytxTest.skip(mobileSkipsSoft2(testInfo, row.route), "soft2 is desktop-only");
        await verifyCell(page, eventWatcher, testInfo, 240_000, (journey) =>
          runHidden(journey, row),
        );
      },
    );
  }
});
