import EventEmitter from "eventemitter3";

import { logger } from "../../logger";
import { Channel } from "./channel";
import { advancePageEpoch, currentPageEpoch, isPageStale } from "./ui-scheduler";
import { fetchChannelPageState } from "./youtube-api";
import { YoutubeDOM } from "./youtube-dom";

export const YTD_EVENTS = {
  NAVIGATION_START: "yt-navigate-start",
  NAVIGATION_END: "yt-navigate-finish",
} as const;

export const YTM_EVENTS = {
  NAVIGATION_START: "state-navigatestart",
  NAVIGATION_END: "state-navigateend",
} as const;

export const YTX_EVENTS = {
  PAGE_ENTER: "ytx-page-enter",
  PAGE_LEAVE: "ytx-page-leave",

  CHANNEL_ENTER: "ytx-channel-enter",
  CATEGORY_ENTER: "ytx-category-enter",

  SORT_CHANGED: "ytx-sort-changed",
  SORT_RERENDERED: "ytx-sort-rerendered",
} as const;

export const ytxEventEmitter = new EventEmitter<{
  [YTX_EVENTS.PAGE_ENTER]: () => void;
  [YTX_EVENTS.PAGE_LEAVE]: () => void;
  [YTX_EVENTS.CHANNEL_ENTER]: (channel: Channel) => void;
  [YTX_EVENTS.CATEGORY_ENTER]: (channel: Channel) => void;
  [YTX_EVENTS.SORT_CHANGED]: (channel: Channel) => void;
  [YTX_EVENTS.SORT_RERENDERED]: (channel: Channel) => void;
}>();

export function registerHooks() {
  registerNavigationHooks();
  registerChannelHooks();
  registerCategoryHooks();
  registerSortHooks();
  registerLoggingHooks();
}

function registerNavigationHooks() {
  window.addEventListener(YTD_EVENTS.NAVIGATION_START, () => {
    ytxEventEmitter.emit(YTX_EVENTS.PAGE_LEAVE);
  });
  window.addEventListener(YTM_EVENTS.NAVIGATION_START, () => {
    ytxEventEmitter.emit(YTX_EVENTS.PAGE_LEAVE);
  });

  window.addEventListener(YTD_EVENTS.NAVIGATION_END, () => {
    emitPageEnter();
  });
  window.addEventListener(YTM_EVENTS.NAVIGATION_END, () => {
    emitPageEnter();
  });
}

export function emitPageEnter() {
  advancePageEpoch();
  ytxEventEmitter.emit(YTX_EVENTS.PAGE_ENTER);
}

function registerChannelHooks() {
  let currentChannel: Channel | null = null;
  ytxEventEmitter.on(YTX_EVENTS.PAGE_ENTER, async () => {
    // A fetch completing after a later page transition belongs to the
    // previous page and must not emit. Sort changes are intentionally not
    // part of this check: the channel is unchanged by a sort switch, so the
    // chain must survive them (only page transitions advance pageEpoch).
    const latestEpoch = currentPageEpoch();
    const { channelId, sortLabels } = await fetchChannelPageState(window.location.href);
    if (isPageStale(latestEpoch)) {
      return;
    }
    // The chip bar's canonical labels feed the sort resolution before any
    // CHANNEL_ENTER consumer reads it (YT-SPEC.md "Sort dropdown UI").
    YoutubeDOM.learnSortLabels(sortLabels);
    const oldChannelId = currentChannel?.id;
    const isChannelIdChanged = channelId !== oldChannelId;
    if (channelId === undefined) {
      currentChannel = null;
    } else {
      if (isChannelIdChanged) {
        currentChannel = Channel.load(channelId);
      }
      ytxEventEmitter.emit(YTX_EVENTS.CHANNEL_ENTER, currentChannel!);
    }
  });
}

function registerCategoryHooks() {
  ytxEventEmitter.on(YTX_EVENTS.CHANNEL_ENTER, async (currentChannel) => {
    const categoryKind = YoutubeDOM.categoryKind;
    if (categoryKind) {
      ytxEventEmitter.emit(YTX_EVENTS.CATEGORY_ENTER, currentChannel);
    }
  });
}

function registerSortHooks() {
  // sort changed hook: fires when the resolved sort actually changes. This
  // covers classic chip selections and dropdown-UI sort picks (the dropdown
  // chip's label swap rewrites no aria-selected of its own), and ignores the
  // audience filter chips that also flip aria-selected on membership
  // channels (YT-SPEC.md "Sort dropdown UI").
  ytxEventEmitter.on(YTX_EVENTS.CATEGORY_ENTER, async (currentChannel: Channel) => {
    let resolvedSort = YoutubeDOM.sortKind;
    const sortChangeObserver = new MutationObserver(() => {
      const sort = YoutubeDOM.sortKind;
      if (sort !== null && sort !== resolvedSort) {
        resolvedSort = sort;
        ytxEventEmitter.emit(YTX_EVENTS.SORT_CHANGED, currentChannel);
      }
    });
    sortChangeObserver.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });
    [YTX_EVENTS.PAGE_ENTER, YTX_EVENTS.PAGE_LEAVE].forEach((e) => {
      ytxEventEmitter.once(e, () => {
        sortChangeObserver.disconnect();
      });
    });
  });

  // sort rerendered hook
  ytxEventEmitter.on(YTX_EVENTS.CATEGORY_ENTER, async (currentChannel: Channel) => {
    const rerendererObserver = new MutationObserver(async (records) => {
      const sortButtonRelatedSet = new Set(YoutubeDOM.sortButtonLineages.flat());
      const sortButtonRelatedRecords = records.filter(
        (r) => r.target instanceof Element && sortButtonRelatedSet.has(r.target),
      );
      const isSortButtonRerendered = sortButtonRelatedRecords.length > 0;
      if (isSortButtonRerendered) {
        ytxEventEmitter.emit(YTX_EVENTS.SORT_RERENDERED, currentChannel);
      }
    });
    rerendererObserver.observe(document, {
      subtree: true,
      childList: true,
      attributes: false,
    });
    [YTX_EVENTS.PAGE_ENTER, YTX_EVENTS.PAGE_LEAVE].forEach((e) => {
      ytxEventEmitter.once(e, () => {
        rerendererObserver.disconnect();
      });
    });
  });
}

function registerLoggingHooks() {
  [YTX_EVENTS.PAGE_ENTER, YTX_EVENTS.PAGE_LEAVE].forEach((e) => {
    ytxEventEmitter.on(e, () => {
      logger.info(`${e} fired`, {
        categoryKind: YoutubeDOM.categoryKind,
        sortKind: YoutubeDOM.sortKind,
      });
    });
  });

  [
    YTX_EVENTS.CHANNEL_ENTER,
    YTX_EVENTS.CATEGORY_ENTER,
    YTX_EVENTS.SORT_CHANGED,
    YTX_EVENTS.SORT_RERENDERED,
  ].forEach((e) => {
    ytxEventEmitter.on(e, (channel) => {
      logger.info(`${e} fired`, {
        channel,
        categoryKind: YoutubeDOM.categoryKind,
        sortKind: YoutubeDOM.sortKind,
      });
    });
  });
}
