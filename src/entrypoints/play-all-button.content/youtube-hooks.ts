import EventEmitter from "eventemitter3";
import { logger } from "../../logger";
import { Channel } from "./channel";
import { fetchChannelId } from "./youtube-api";
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

export function setHooks() {
  setNavigationHooks();
  setChannelHooks();
  setCategoryHooks();
  setSortHooks();
  setupHooksLog();
}

function setNavigationHooks() {
  window.addEventListener(YTD_EVENTS.NAVIGATION_START, () => {
    ytxEventEmitter.emit(YTX_EVENTS.PAGE_LEAVE);
  });
  window.addEventListener(YTM_EVENTS.NAVIGATION_START, () => {
    ytxEventEmitter.emit(YTX_EVENTS.PAGE_LEAVE);
  });

  window.addEventListener(YTD_EVENTS.NAVIGATION_END, () => {
    ytxEventEmitter.emit(YTX_EVENTS.PAGE_ENTER);
  });
  window.addEventListener(YTM_EVENTS.NAVIGATION_END, () => {
    ytxEventEmitter.emit(YTX_EVENTS.PAGE_ENTER);
  });
}

function setChannelHooks() {
  let currentChannel: Channel | null = null;
  ytxEventEmitter.on(YTX_EVENTS.PAGE_ENTER, async () => {
    const channelId = await fetchChannelId(window.location.href);
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

function setCategoryHooks() {
  ytxEventEmitter.on(YTX_EVENTS.CHANNEL_ENTER, async (currentChannel) => {
    const categoryKind = YoutubeDOM.categoryKind;
    if (categoryKind) {
      ytxEventEmitter.emit(YTX_EVENTS.CATEGORY_ENTER, currentChannel);
    }
  });
}

function setSortHooks() {
  // sort changed hook
  ytxEventEmitter.on(
    YTX_EVENTS.CATEGORY_ENTER,
    async (currentChannel: Channel) => {
      const sortChangeObserver = new MutationObserver(async (records) => {
        const sortButtons = YoutubeDOM.sortButtons;
        const isSortChanged = records.some(
          (r) => r.target instanceof Element && sortButtons.includes(r.target),
        );
        if (isSortChanged) {
          ytxEventEmitter.emit(YTX_EVENTS.SORT_CHANGED, currentChannel);
        }
      });
      sortChangeObserver.observe(document, {
        subtree: true,
        childList: false,
        attributes: true,
        attributeFilter: ["aria-selected"],
      });
      [YTX_EVENTS.PAGE_ENTER, YTX_EVENTS.PAGE_LEAVE].forEach((e) => {
        ytxEventEmitter.once(e, () => {
          sortChangeObserver.disconnect();
        });
      });
    },
  );

  // sort rerendered hook
  ytxEventEmitter.on(
    YTX_EVENTS.CATEGORY_ENTER,
    async (currentChannel: Channel) => {
      const rerendererObserver = new MutationObserver(async (records) => {
        const sortButtonRelatedSet = new Set(
          YoutubeDOM.sortButtonLineages.flat(),
        );
        const sortButtonRelatedRecords = records.filter(
          (r) =>
            r.target instanceof Element && sortButtonRelatedSet.has(r.target),
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
    },
  );
}

function setupHooksLog() {
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
