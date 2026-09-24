import { logger } from "../../logger";

// Two independent epochs guard async work against page state changes:
//
// - pageEpoch advances only when a new page state begins (yt-navigate-finish).
//   The channel-enter chain is tied to this epoch: a sort change leaves the
//   channel itself unchanged, so it must not drop that chain.
// - uiEpoch advances on page transitions and sort changes. Async UI renders
//   capture it when they start and bail out when it has moved on by the time
//   their data is ready.

let pageEpoch = 0;
let uiEpoch = 0;

export function advancePageEpoch(): number {
  const next = ++pageEpoch;
  uiEpoch = next;
  return next;
}

export function currentPageEpoch(): number {
  return pageEpoch;
}

export function isPageStale(latestEpoch: number): boolean {
  return latestEpoch !== pageEpoch;
}

export function advanceUiEpoch(): number {
  return ++uiEpoch;
}

export function isUiStale(latestEpoch: number): boolean {
  return latestEpoch !== uiEpoch;
}

// Like scheduleUiTask, but tied to the page epoch. Use for UI that is
// sort-independent (e.g. the dropdown resolves every category and sort), so a
// sort change must not drop it while a page transition still does.
export async function schedulePageTask(
  task: (latestEpoch: number) => Promise<void>,
): Promise<void> {
  const latestEpoch = pageEpoch;
  try {
    await task(latestEpoch);
  } catch (error) {
    logger.error("page task failed", { error });
  }
}

// Emitter listeners ignore returned promises, so a task failure must be
// logged here instead of surfacing as an unhandled rejection.
export async function scheduleUiTask(task: (latestEpoch: number) => Promise<void>): Promise<void> {
  const latestEpoch = uiEpoch;
  try {
    await task(latestEpoch);
  } catch (error) {
    logger.error("ui task failed", { error });
  }
}
