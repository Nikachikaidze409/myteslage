/**
 * Pure automatic-renewal rules for Bank of Georgia memberships.
 *
 * No network, no database: only the decision of WHETHER a subscription may be
 * charged again right now, and what happens after a definitive refusal.
 */

export const MAX_RENEWAL_ATTEMPTS = 3;

/** attempt 1: at due time · attempt 2: ~24h later · attempt 3: ~72h after the first failure. */
export const RETRY_BACKOFF_MS = [0, 24 * 60 * 60 * 1000, 48 * 60 * 60 * 1000];

/** How long one worker owns a subscription while it charges it. */
export const RENEWAL_LOCK_MS = 10 * 60 * 1000;

export interface RenewalSubscription {
  id: string;
  provider: string | null;
  auto_renew: boolean | null;
  cancel_at_period_end: boolean | null;
  provider_parent_order_id: string | null;
  next_billing_at: string | null;
  current_period_end: string | null;
  renewal_status: string | null;
  renewal_attempts: number | null;
  last_renewal_attempt_at: string | null;
  renewal_lock_until: string | null;
}

export type RenewalSkipReason =
  | "not_bog"
  | "auto_renew_off"
  | "canceled"
  | "no_parent_order"
  | "not_due"
  | "locked"
  | "retry_backoff"
  | "exhausted";

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** The single gate used by the scheduler. */
export function shouldAttemptRenewal(
  sub: RenewalSubscription,
  now: number,
): { attempt: boolean; reason?: RenewalSkipReason } {
  if ((sub.provider ?? "").toLowerCase() !== "bog") return { attempt: false, reason: "not_bog" };
  if (sub.auto_renew !== true) return { attempt: false, reason: "auto_renew_off" };
  if (sub.cancel_at_period_end === true) return { attempt: false, reason: "canceled" };
  if (sub.renewal_status === "canceled" || sub.renewal_status === "failed") {
    return { attempt: false, reason: "canceled" };
  }
  if (!sub.provider_parent_order_id) return { attempt: false, reason: "no_parent_order" };

  const due = time(sub.next_billing_at);
  if (due === null || due > now) return { attempt: false, reason: "not_due" };

  const lock = time(sub.renewal_lock_until);
  if (lock !== null && lock > now) return { attempt: false, reason: "locked" };

  const attempts = sub.renewal_attempts ?? 0;
  if (attempts >= MAX_RENEWAL_ATTEMPTS) return { attempt: false, reason: "exhausted" };

  if (attempts > 0) {
    const last = time(sub.last_renewal_attempt_at);
    const wait = RETRY_BACKOFF_MS[attempts] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
    if (last !== null && now - last < wait) return { attempt: false, reason: "retry_backoff" };
  }

  return { attempt: true };
}

/** State written after the bank definitively refuses an attempt. */
export function afterFailedAttempt(
  attemptsBefore: number,
  now: Date,
): {
  renewal_attempts: number;
  renewal_status: "past_due" | "failed";
  auto_renew?: boolean;
  next_billing_at?: null;
  last_renewal_attempt_at: string;
  renewal_lock_until: null;
} {
  const attempts = attemptsBefore + 1;
  if (attempts >= MAX_RENEWAL_ATTEMPTS) {
    return {
      renewal_attempts: attempts,
      renewal_status: "failed",
      auto_renew: false,
      next_billing_at: null,
      last_renewal_attempt_at: now.toISOString(),
      renewal_lock_until: null,
    };
  }
  return {
    renewal_attempts: attempts,
    renewal_status: "past_due",
    last_renewal_attempt_at: now.toISOString(),
    renewal_lock_until: null,
  };
}
