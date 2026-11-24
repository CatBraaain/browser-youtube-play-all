import { defineContentScript } from "#imports";

import type { Channel } from "./channel";
import {
  advanceUiEpoch,
  isPageStale,
  isUiStale,
  schedulePageTask,
  scheduleUiTask,
} from "./ui-scheduler";
import { MEMBERS_KINDS, MEMBERS_SORTS, SYNC_SORTS } from "./youtube-api";
import type { MembersSortKind } from "./youtube-api";
import { YoutubeDOM, type SortKind } from "./youtube-dom";
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
  ytxEventEmitter.on(YTX_EVENTS.FILTER_CHANGED, async (channel) => {
    // A filter change invalidates UI renders still awaiting the previous
    // filter's playlist path, mirroring the sort-change handling: the
    // channel itself is unchanged by a filter toggle.
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

  // The Members only filter switches the button to the current category's
  // members-only playlist (SPEC.md "Selected sort"). Every category has one,
  // but with Latest and Oldest only, so when the current sort is Popular
  // the button has no destination to offer and is hidden.
  const membersMode = YoutubeDOM.audienceFilterKind === "MembersOnly";
  const membersSort: MembersSortKind | null =
    sortKind === "Popular" ? null : sortKind === "Oldest" ? "Oldest" : "Latest";
  if (membersMode && membersSort === null) {
    document.querySelector(".play-all-btn")?.remove();
    return;
  }

  // The button's own classes encode the full routed state, so a re-render is
  // skipped only when every class matches exactly: a compound-class query
  // selector would also match a superset button rendered for the opposite
  // filter state.
  const buttonClasses = [
    "play-all-btn",
    categoryKind.toLowerCase(),
    sortKind.toLowerCase(),
    ...(membersMode ? ["members"] : []),
  ];
  const existingButton = document.querySelector<HTMLElement>(".play-all-btn");
  if (
    existingButton &&
    existingButton.classList.length === buttonClasses.length &&
    buttonClasses.every((className) => existingButton.classList.contains(className))
  ) {
    equalizeLeadingGap(existingButton);
    return;
  }

  const playAllButton = document.createElement("a");
  buttonClasses.forEach((className) => playAllButton.classList.add(className));
  const href = await (membersMode && membersSort
    ? channel.getMembersPlaylistPath(categoryKind, membersSort)
    : channel.getPlaylistPath(categoryKind, sortKind));
  if (isUiStale(latestEpoch)) {
    return;
  }
  // Omit the href on resolution failures so the error button cannot navigate,
  // and surface the failure on the button instead of silently hiding it.
  if (href) {
    playAllButton.href = href;
  }
  // The chip bar is YouTube's fixed-height UI, where a longer label wraps
  // and clips, so the button's own label keeps the short sort form — the
  // adjacent Members only chip already names the filter state — and the
  // Members distinction stays in the Play All menu entries.
  const label = `Play All (${membersMode && membersSort ? membersSort : sortKind})`;
  playAllButton.textContent = href ? label : `${label} (error)`;

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

// The dropdown's listeners include a document-wide click-to-close handler,
// which must not outlive its dropdown: YouTube detaches the dropdown when a
// channel navigation rebuilds the header, and a surviving document handler
// would keep that detached subtree alive and run on every click. Appending a
// replacement dropdown releases the previous listener set through this
// controller (page-leave DOM removal is left to YouTube's re-rendering).
let dropdownListeners: AbortController | null = null;

// A hidden stale page can hold the document-order first flexible actions
// (YT-SPEC.md "Stale pages stay attached and hidden").
function findVisibleFlexibleActions(): HTMLElement | null {
  const containers = document.querySelectorAll<HTMLElement>("yt-flexible-actions-view-model");
  for (const container of containers) {
    if (container.checkVisibility?.() ?? true) {
      return container;
    }
  }
  return containers[0] ?? null;
}

async function renderDropdown(channel: Channel, latestEpoch: number) {
  const container = document.createElement("div");
  container.className = "play-all-btns";
  container.dataset.ytxPageEpoch = String(latestEpoch);

  const button = document.createElement("button");
  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Play All Buttons ▼";
  button.appendChild(toggleLabel);

  const menu = document.createElement("div");
  menu.className = "hidden";

  const publicEntries = YoutubeDOM.categories.flatMap((category) =>
    YoutubeDOM.sorts.map((sort) => ({ category, sort })),
  );
  const publicLinks: (HTMLAnchorElement | undefined)[] = [];

  function insertMenuEntry(href: string, label: string, before: HTMLAnchorElement | null = null) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    menu.insertBefore(link, before);
    return link;
  }

  async function insertPublicEntries(sorts: SortKind[]) {
    for (const [index, { category, sort }] of publicEntries.entries()) {
      if (!sorts.includes(sort)) continue;
      const href = await channel.getPlaylistPath(category, sort);
      if (isPageStale(latestEpoch)) return;
      if (!href) continue;

      // Insert before the next visible entry rather than waiting for missing links.
      const nextLink = publicLinks.slice(index + 1).find((link) => link !== undefined);
      publicLinks[index] = insertMenuEntry(href, `${category} (${sort})`, nextLink ?? null);
    }
  }

  function isMountedForThisEpoch() {
    const holder = findVisibleFlexibleActions();
    const mounted = holder?.querySelector<HTMLElement>(".play-all-btns");
    return mounted?.dataset.ytxPageEpoch === String(latestEpoch);
  }

  await insertPublicEntries(SYNC_SORTS);

  if (isPageStale(latestEpoch)) {
    return;
  }

  container.append(button, menu);

  if (!isMountedForThisEpoch()) {
    dropdownListeners?.abort();
    dropdownListeners = new AbortController();
    const { signal } = dropdownListeners;

    let isOpen = false;
    button.addEventListener(
      "click",
      (e) => {
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
          const firstItem = menu.querySelector("a");
          const itemPaddingLeft = firstItem
            ? parseFloat(getComputedStyle(firstItem).paddingLeft)
            : 0;
          menu.style.left = `${toggleLabel.getBoundingClientRect().left - container.getBoundingClientRect().left - itemPaddingLeft}px`;
        }
      },
      { signal },
    );
    menu.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
      },
      { signal },
    );
    // Capture phase: YouTube stops click propagation inside its own UI (e.g.
    // the search box), so those clicks never reach a bubble-phase listener
    // here and the menu would stay open. Capture runs before any page handler
    // can stop the event. Clicks inside the dropdown are skipped: the toggle
    // manages its own state, and a menu click must not close the menu.
    document.addEventListener(
      "click",
      (e) => {
        if (e.target instanceof Node && container.contains(e.target)) {
          return;
        }
        isOpen = false;
        menu.classList.add("hidden");
      },
      { signal, capture: true },
    );

    function mountDropdown() {
      const holder = findVisibleFlexibleActions();
      if (holder === null) {
        return;
      }
      const mounted = holder.querySelector<HTMLElement>(".play-all-btns");
      if (mounted?.dataset.ytxPageEpoch === String(latestEpoch)) {
        return;
      }
      mounted?.remove();
      holder.appendChild(container);
    }
    mountDropdown();
    const mountWatcher = new MutationObserver(() => {
      if (isPageStale(latestEpoch)) {
        mountWatcher.disconnect();
        return;
      }
      mountDropdown();
    });
    mountWatcher.observe(document, { childList: true, subtree: true });
  }

  const networkSorts = YoutubeDOM.sorts.filter((sort) => !SYNC_SORTS.includes(sort));
  await insertPublicEntries(networkSorts);
  if (isPageStale(latestEpoch)) {
    return;
  }

  // Members-only entries resolve last and are appended after the category
  // links: they exist only on channels with membership perks, and a failed
  // resolution (a channel without them) simply appends nothing.
  for (const membersKind of MEMBERS_KINDS) {
    for (const sortKind of MEMBERS_SORTS) {
      const href = await channel.getMembersPlaylistPath(membersKind, sortKind);
      if (isPageStale(latestEpoch)) {
        return;
      }
      if (href) {
        insertMenuEntry(href, `${membersKind} (Members ${sortKind})`);
      }
    }
  }
}
