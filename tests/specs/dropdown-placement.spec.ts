import { expect } from "@playwright/test";

import { ytxTest } from "../fixture";

// A hidden stale page can hold an earlier yt-flexible-actions-view-model
// (YT-SPEC.md "Stale pages stay attached and hidden").
ytxTest(
  "dropdown renders in the active header despite a hidden stale flexible actions",
  async ({ page, isMobile }) => {
    ytxTest.skip(isMobile, "desktop-only: the stale-page shape and the hook name differ on mobile");

    await page.goto("https://www.youtube.com/@Apple");
    const activeDropdown = page
      .locator("ytd-page-manager .play-all-btns")
      .describe("Play All dropdown in the active header");
    await expect(activeDropdown).toBeVisible({ timeout: 60_000 });

    // Simulate the stale-page shape: no active dropdown, hidden stale copy first.
    await page.evaluate(() => {
      document.querySelector("ytd-page-manager .play-all-btns")?.remove();
      const staleContainer = document.createElement("yt-flexible-actions-view-model");
      staleContainer.setAttribute("hidden", "");
      const staleDropdown = document.createElement("div");
      staleDropdown.className = "play-all-btns";
      staleContainer.appendChild(staleDropdown);
      document.body.prepend(staleContainer);
    });

    await page.evaluate(() => window.dispatchEvent(new Event("yt-navigate-finish")));

    await expect(page.locator(".play-all-btns").describe("All Play All dropdowns")).toHaveCount(2);
    await expect(
      page.locator(".play-all-btns:visible").describe("Visible Play All dropdowns"),
    ).toHaveCount(1);
    await expect(activeDropdown).toBeVisible();
  },
);
