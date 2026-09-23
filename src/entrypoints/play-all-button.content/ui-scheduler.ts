import { logger } from "../../logger";

// Tracks how many times the youtube page state has changed. Async render
// paths capture the current epoch when they start and bail out when it
// has moved on by the time their data is ready.

let epoch = 0;

export function advanceEpoch(): number {
  return ++epoch;
}

export function currentEpoch(): number {
  return epoch;
}

export function isStale(latestEpoch: number): boolean {
  return latestEpoch !== epoch;
}

// Emitter listeners ignore returned promises, so a task failure must be
// logged here instead of surfacing as an unhandled rejection.
export async function scheduleUiTask(task: (latestEpoch: number) => Promise<void>): Promise<void> {
  const latestEpoch = currentEpoch();
  try {
    await task(latestEpoch);
  } catch (error) {
    logger.error("ui task failed", { error });
  }
}
