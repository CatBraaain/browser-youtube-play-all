import { expect, test } from "@playwright/test";

import { EventWatcher } from "../fixture";
import { YtChannelPage } from "../utils";

test.beforeEach(async ({ page }) => {
  await page.setContent(`
    <ytd-browse page-subtype="channels" role="main">
      <div id="primary">
        <div id="sort">
          <button aria-selected="true">Latest</button>
          <button aria-selected="false">Popular</button>
          <button aria-selected="false">Oldest</button>
        </div>
        <div id="contents"><a href="/watch?v=AAAAAAAAAAA">Original</a></div>
      </div>
    </ytd-browse>
  `);
});

test("waits for the first video to be replaced, not an unrelated link insertion", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.querySelectorAll("#sort button")[2]!.addEventListener("click", () => {
      setTimeout(() => {
        document
          .querySelector("#contents")!
          .insertAdjacentHTML("beforeend", '<a href="/watch?v=CCCCCCCCCCC">Unrelated</a>');
      }, 20);
      setTimeout(() => {
        document.querySelector("#contents")!.innerHTML =
          '<a href="/watch?v=BBBBBBBBBBB">Sorted</a>';
      }, 2_000);
    });
  });

  const channel = new YtChannelPage("@example", page, new EventWatcher(page));
  let completed = false;
  const sorting = channel.navigateToSort("Oldest").then(() => {
    completed = true;
  });
  await page.waitForTimeout(1_500);
  expect(completed).toBe(false);
  await sorting;
  await expect(page.locator("#contents a").first()).toHaveAttribute("href", "/watch?v=BBBBBBBBBBB");
});

test("waits for a re-click to replace the video node even when its href is unchanged", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.querySelectorAll("#sort button")[0]!.addEventListener("click", () => {
      setTimeout(() => {
        document.querySelector("#contents")!.innerHTML =
          '<a href="/watch?v=AAAAAAAAAAA">Same video, new node</a>';
      }, 20);
    });
  });

  const channel = new YtChannelPage("@example", page, new EventWatcher(page));
  await channel.navigateToSort("Latest");
  await expect(page.locator("#contents a").first()).toHaveText("Same video, new node");
});
