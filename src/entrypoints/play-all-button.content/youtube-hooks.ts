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
  NAVIGATION_START: "ytx-navigation-start",
  NAVIGATION_END: "ytx-navigation-end",

  CHANNEL_ENTER: "ytx-channel-enter",
  CHANNEL_LEAVE: "ytx-channel-leave",

  CATEGORY_ENTER: "ytx-category-enter",
  CATEGORY_LEAVE: "ytx-category-leave",

  SORT_CHANGED: "ytx-sort-changed",
  SORT_RERENDERED: "ytx-sort-rerendered",
} as const;

export const ytxEventEmitter = new EventEmitter<{
  [YTX_EVENTS.NAVIGATION_START]: () => void;
  [YTX_EVENTS.NAVIGATION_END]: () => void;
  [YTX_EVENTS.CHANNEL_ENTER]: (channel: Channel) => void;
  [YTX_EVENTS.CHANNEL_LEAVE]: () => void;
  [YTX_EVENTS.CATEGORY_ENTER]: (channel: Channel) => void;
  [YTX_EVENTS.CATEGORY_LEAVE]: () => void;
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
    ytxEventEmitter.emit(YTX_EVENTS.NAVIGATION_START);
  });
  window.addEventListener(YTM_EVENTS.NAVIGATION_START, () => {
    ytxEventEmitter.emit(YTX_EVENTS.NAVIGATION_START);
  });

  window.addEventListener(YTD_EVENTS.NAVIGATION_END, () => {
    ytxEventEmitter.emit(YTX_EVENTS.NAVIGATION_END);
  });
  window.addEventListener(YTM_EVENTS.NAVIGATION_END, () => {
    ytxEventEmitter.emit(YTX_EVENTS.NAVIGATION_END);
  });
}

function setChannelHooks() {
  let currentChannel: Channel | null = null;
  ytxEventEmitter.on(YTX_EVENTS.NAVIGATION_END, async () => {
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
      ytxEventEmitter.once(YTX_EVENTS.NAVIGATION_START, () => {
        ytxEventEmitter.emit(YTX_EVENTS.CHANNEL_LEAVE);
      });
    }
  });
}

function setCategoryHooks() {
  ytxEventEmitter.on(YTX_EVENTS.CHANNEL_ENTER, async (currentChannel) => {
    const categoryKind = YoutubeDOM.categoryKind;
    if (categoryKind) {
      ytxEventEmitter.emit(YTX_EVENTS.CATEGORY_ENTER, currentChannel);
      ytxEventEmitter.once(YTX_EVENTS.NAVIGATION_START, () => {
        ytxEventEmitter.emit(YTX_EVENTS.CATEGORY_LEAVE);
      });
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
      ytxEventEmitter.once(YTX_EVENTS.CATEGORY_LEAVE, () => {
        sortChangeObserver.disconnect();
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
      ytxEventEmitter.once(YTX_EVENTS.CATEGORY_LEAVE, () => {
        rerendererObserver.disconnect();
      });
    },
  );
}

function setupHooksLog() {
  [
    YTX_EVENTS.NAVIGATION_START,
    YTX_EVENTS.NAVIGATION_END,
    YTX_EVENTS.CHANNEL_LEAVE,
    YTX_EVENTS.CATEGORY_LEAVE,
  ].forEach((e) => {
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
