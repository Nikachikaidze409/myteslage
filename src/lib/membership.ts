/**
 * ONE shared membership-validity rule, used by both the UI gate (AuthGate) and
 * the server-side Google API gate (map-access.middleware).
 *
 * Rules:
 *  - provider "bog": only live memberships count (never sandbox/test rows).
 *  - provider "paddle" (or legacy rows without a provider): the row's
 *    environment must match the Paddle environment the app currently runs in.
 *  - active / trialing / past_due: valid while the period is open.
 *  - canceled: valid only while a concrete current_period_end is still in the
 *    future (a canceled row with no period end never grants access).
 *  - anything expired or in any other status: no access.
 */

export type PaddleEnv = "sandbox" | "live";

export interface MembershipRow {
  status: string | null;
  current_period_end: string | null;
  provider?: string | null;
  environment?: string | null;
}

const OPEN_STATUSES = ["active", "trialing", "past_due"];

/** Derives the Paddle environment from the client token (test_* = sandbox). */
export function resolvePaddleEnvironment(clientToken: string | undefined | null): PaddleEnv {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

export function isMembershipRowValid(
  row: MembershipRow,
  options: { paddleEnvironment: PaddleEnv; now?: number },
): boolean {
  const now = options.now ?? Date.now();
  const status = row.status ?? "";
  const provider = (row.provider ?? "paddle").toLowerCase();
  const environment = (row.environment ?? "").toLowerCase();

  if (provider === "bog") {
    if (environment !== "live") return false;
  } else {
    // Paddle (and legacy rows): must belong to the environment in use.
    if (environment && environment !== options.paddleEnvironment) return false;
  }

  const endsAt = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
  const periodInFuture = endsAt !== null && Number.isFinite(endsAt) && endsAt > now;

  if (OPEN_STATUSES.includes(status)) {
    return endsAt === null ? true : periodInFuture;
  }
  if (status === "canceled") {
    return periodInFuture;
  }
  return false;
}

export function anyMembershipValid(
  rows: MembershipRow[] | null | undefined,
  options: { paddleEnvironment: PaddleEnv; now?: number },
): boolean {
  return !!rows?.some((row) => isMembershipRowValid(row, options));
}
