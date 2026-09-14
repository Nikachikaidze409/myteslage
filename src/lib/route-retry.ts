// Failure backoff for route requests.
//
// Two separate policies, both pure so they can be tested without a browser:
//
//  * INITIAL route (a destination was chosen but no route exists yet):
//    attempt immediately, then 5 s, then 15 s, then stop automatic retries
//    and wait for an explicit user action or a real destination/settings
//    change. A changing GPS fix alone must never reset this.
//
//  * REROUTE (navigation engine confirmed a deviation): the FIRST reroute is
//    never delayed. Only after a failure does a backoff apply — 3 s, 10 s,
//    then 30 s — so a systemic failure cannot produce one paid Google call
//    per GPS fix. Any successfully installed route resets it.

export interface RetryState {
  failures: number;
  lastFailureAt: number;
  nextRetryAt: number;
}

export const NO_FAILURES: RetryState = { failures: 0, lastFailureAt: 0, nextRetryAt: 0 };

/** 1st failure → 5 s, 2nd → 15 s, 3rd → manual only. */
export const INITIAL_BACKOFF_MS = [5_000, 15_000];
export const MAX_AUTOMATIC_INITIAL_FAILURES = INITIAL_BACKOFF_MS.length + 1;

/** 1st failure → 3 s, 2nd → 10 s, 3rd and beyond → 30 s. */
export const REROUTE_BACKOFF_MS = [3_000, 10_000, 30_000];

function backoffFor(schedule: number[], failures: number, overrideMs?: number): number {
  const base = schedule[Math.min(failures, schedule.length) - 1] ?? schedule[schedule.length - 1] ?? 0;
  return Math.max(base, overrideMs ?? 0);
}

/** Record a failed INITIAL route request. */
export function registerInitialFailure(
  state: RetryState,
  now: number,
  overrideMs?: number,
): RetryState {
  const failures = state.failures + 1;
  return {
    failures,
    lastFailureAt: now,
    nextRetryAt:
      failures > INITIAL_BACKOFF_MS.length
        ? Number.POSITIVE_INFINITY
        : now + backoffFor(INITIAL_BACKOFF_MS, failures, overrideMs),
  };
}

/** Record a failed REROUTE request. */
export function registerRerouteFailure(
  state: RetryState,
  now: number,
  overrideMs?: number,
): RetryState {
  const failures = state.failures + 1;
  return {
    failures,
    lastFailureAt: now,
    nextRetryAt: now + backoffFor(REROUTE_BACKOFF_MS, failures, overrideMs),
  };
}

/** May an automatic attempt start right now? */
export function canAttempt(state: RetryState, now: number): boolean {
  return now >= state.nextRetryAt;
}

/** Automatic initial retries exhausted: only an explicit user action helps. */
export function needsManualRetry(state: RetryState): boolean {
  return state.failures >= MAX_AUTOMATIC_INITIAL_FAILURES;
}

export function resetRetry(): RetryState {
  return { ...NO_FAILURES };
}
