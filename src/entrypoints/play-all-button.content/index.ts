import { defineContentScript } from "#imports";

import type { Channel } from "./channel";
import {
  advanceUiEpoch,
  isPageStale,
  isUiStale,
  schedulePageTask,
  scheduleUiTask,
} from "./ui-scheduler";
import { MEMBERS_KINDS, MEMBERS_SORTS } from "./youtube-api";
import { YoutubeDOM } from "./youtube-dom";
import { emitPageEnter, registerHooks, YTX_EVENTS, ytxEventEmitter } from "./youtube-hooks";

import "./play-all-button.css";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://m.youtube.com/*"],
  runAt: "document_end",
  main,
});

function main() {
  registerHooks();

  ytxEventEmitter.on(YTX_EVENTS.CHANNEL_ENTER, async (channel) => {
    // The dropdown resolves every category and sort, so it is keyed to the
    // page epoch: a sort change must not drop it mid-resolution.
    await schedulePageTask((latestEpoch) => renderDropdown(channel, latestEpoch));
  });
  [YTX_EVENTS.CATEGORY_ENTER, YTX_EVENTS.SORT_RERENDERED].forEach((e) => {
    ytxEventEmitter.on(e, async (channel) => {
      await scheduleUiTask((latestEpoch) => maybeRenderButton(channel, latestEpoch));
    });
  });
  ytxEventEmitter.on(YTX_EVENTS.SORT_CHANGED, async (channel) => {
    // A sort change invalidates UI renders still awaiting their playlist path
    // for the previous sort. It must not drop the in-flight channel-enter
    // chain: the channel itself is unchanged by a sort switch.
    advanceUiEpoch();
    await scheduleUiTask((latestEpoch) => maybeRenderButton(channel, latestEpoch));
  });

  // Invalidate in-flight renders from the previous page while the new
  // page's channel id is still being fetched.
  emitPageEnter();
}

async function maybeRenderButton(channel: Channel, latestEpoch: number) {
  const sortButtonHolder = YoutubeDOM.sortButtonHolder;
  if (!sortButtonHolder) {
    return;
  }

  const categoryKind = YoutubeDOM.categoryKind;
  if (!categoryKind) {
    return;
  }

  const sortKind = YoutubeDOM.sortKind ?? "Latest";

  const targetPlayAllButton = document.querySelector<HTMLElement>(
    `.play-all-btn.${categoryKind.toLowerCase()}.${sortKind.toLowerCase()}`,
  );
  if (targetPlayAllButton) {
    equalizeLeadingGap(targetPlayAllButton);
    return;
  }

  const playAllButton = document.createElement("a");
  playAllButton.classList.add("play-all-btn");
  playAllButton.classList.add(categoryKind.toLowerCase());
  playAllButton.classList.add(sortKind.toLowerCase());
  const href = await channel.getPlaylistPath(categoryKind, sortKind);
  if (isUiStale(latestEpoch)) {
    return;
  }
  // Omit the href on resolution failures so the error button cannot navigate,
  // and surface the failure on the button instead of silently hiding it.
  if (href) {
    playAllButton.href = href;
  }
  playAllButton.textContent = href ? `Play All (${sortKind})` : `Play All (${sortKind}) (error)`;

  document.querySelector(".play-all-btn")?.remove();
  sortButtonHolder.appendChild(playAllButton);
  equalizeLeadingGap(playAllButton);
}

// The chip row's own spacing (YouTube's chip wrapper margins) stacks with the
// button's static CSS margin, so the gap before the button can be wider than
// the chip-to-chip gaps. Converge the button's leading gap onto the measured
// chip gap with one corrective step; the call is idempotent (a converged gap
// adds zero). On an unmeasurable row (chips missing, hidden, or mid-rerender)
// the static CSS margin is kept.
function equalizeLeadingGap(button: HTMLElement) {
  const chips = YoutubeDOM.sortButtons;
  if (chips.length !== 3) {
    return;
  }
  const rects = [...chips, button].map((e) => e.getBoundingClientRect());
  if (rects.some((r) => r.width === 0)) {
    return;
  }
  const chipGap = rects[1]!.left - rects[0]!.right;
  const leadingGap = rects[3]!.left - rects[2]!.right;
  const marginLeft = parseFloat(getComputedStyle(button).marginLeft);
  if (!Number.isFinite(marginLeft)) {
    return;
  }
  button.style.marginLeft = `${marginLeft + chipGap - leadingGap}px`;
}

async function renderDropdown(channel: Channel, latestEpoch: number) {
  const container = document.createElement("div");
  container.className = "play-all-btns";

  const button = document.createElement("button");
  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Play All Buttons ▼";
  button.appendChild(toggleLabel);

  const menu = document.createElement("div");
  menu.className = "hidden";

  for (const categoryKind of YoutubeDOM.categories) {
    for (const sortKind of YoutubeDOM.sorts) {
      const href = await channel.getPlaylistPath(categoryKind, sortKind);
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = `${categoryKind} (${sortKind})`;
        menu.appendChild(a);
      }
    }
  }

  // Members-only entries resolve last and are appended after the category
  // links: they exist only on channels with membership perks, and a failed
  // resolution (a channel without them) simply appends nothing.
  for (const membersKind of MEMBERS_KINDS) {
    for (const sortKind of MEMBERS_SORTS) {
      const href = await channel.getMembersPlaylistPath(membersKind, sortKind);
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = `Members ${membersKind.toLowerCase()} (${sortKind})`;
        menu.appendChild(a);
      }
    }
  }

  if (isPageStale(latestEpoch)) {
    return;
  }

  container.append(button, menu);

  if (document.querySelector("yt-flexible-actions-view-model .play-all-btns") === null) {
    document.querySelector("yt-flexible-actions-view-model")?.appendChild(container);

    let isOpen = false;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      menu.classList.toggle("hidden", !isOpen);
      if (isOpen) {
        // Keep the open menu inside the viewport: the header sits well below
        // the top of the page, so a full-height menu would render its lower
        // rows off-screen and unclickable. A small minimum keeps the menu
        // scrollable even in that edge case.
        const available = window.innerHeight - button.getBoundingClientRect().bottom - 8;
        menu.style.maxHeight = `${Math.max(available, 160)}px`;
        // Align the toggle label's left edge with the menu items' text left
        // edge: shift the menu left by its item padding, so the characters
        // line up rather than the menu border. The mobile toggle spans the
        // full header width, so its centered label starts far to the right
        // of the button edge the menu otherwise hangs from.
        const itemPaddingLeft =
          parseFloat(getComputedStyle(menu.querySelector("a")).paddingLeft) || 0;
        menu.style.left = `${toggleLabel.getBoundingClientRect().left - container.getBoundingClientRect().left - itemPaddingLeft}px`;
      }
    });
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    document.addEventListener("click", () => {
      isOpen = false;
      menu.classList.add("hidden");
    });
  }
}
