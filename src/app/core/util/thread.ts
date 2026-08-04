export const THREAD_COLLAPSE_THRESHOLD = 6;

/** Long threads are collapsed to just the latest N replies until expanded. */
export function visibleResponses<T>(all: T[], expanded: boolean): T[] {
  if (expanded || all.length <= THREAD_COLLAPSE_THRESHOLD) {
    return all;
  }
  return all.slice(-THREAD_COLLAPSE_THRESHOLD);
}
