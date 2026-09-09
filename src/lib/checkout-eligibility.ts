/**
 * Pure, server-authoritative checkout eligibility + proration rules.
 *
 * Nothing here reads request input beyond a plan/provider name: every price,
 * credit and final amount is derived from the trusted tables in this module
 * and from database timestamps. The browser can never submit a discount.
 */

import { isMembershipRowValid, type MembershipRow, type PaddleEnv } from "./membership";

export type PlanKey = "monthly" | "quarterly";
export type Provider = "bog" | "paddle";

/** Trusted GEL price list (mirrors BOG_PLANS; kept pure for tests). */
export const PLAN_PRICES_GEL: Record<PlanKey, number> = {
  monthly: 8.0,
  quarterly: 21.6,
};

const PLAN_RANK: Record<PlanKey, number> = { monthly: 1, quarterly: 2 };

/** How long a pending checkout blocks a second one before it is abandoned. */
export const PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000;

/** Safe currency rounding to 2 decimals. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function planFromProductId(productId: string | null | undefined): PlanKey | null {
  if (!productId) return null;
  if (productId.endsWith("monthly")) return "monthly";
  if (productId.endsWith("quarterly")) return "quarterly";
  return null;
}

/* ------------------------------------------------------------------ *
 * Proration: monthly -> quarterly, computed from exact timestamps.
 * ------------------------------------------------------------------ */

export interface ProrationInput {
  periodStart: string | Date | null;
  periodEnd: string | Date | null;
  now: number;
}

export interface Proration {
  unusedFraction: number;
  creditAmount: number;
  baseAmount: number;
  finalAmount: number;
}

function ms(value: string | Date | null): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

export function computeMonthlyToQuarterlyProration(input: ProrationInput): Proration {
  const monthly = PLAN_PRICES_GEL.monthly;
  const quarterly = PLAN_PRICES_GEL.quarterly;

  const start = ms(input.periodStart);
  const end = ms(input.periodEnd);
  const total = start !== null && end !== null ? end - start : null;
  const remaining = end !== null ? Math.max(0, end - input.now) : 0;

  let fraction = 0;
  if (total !== null && total > 0) fraction = remaining / total;
  fraction = Math.min(1, Math.max(0, fraction));

  const creditAmount = Math.min(monthly, Math.max(0, roundMoney(monthly * fraction)));
  const finalAmount = Math.min(quarterly, Math.max(0, roundMoney(quarterly - creditAmount)));

  return { unusedFraction: fraction, creditAmount, baseAmount: quarterly, finalAmount };
}

/* ------------------------------------------------------------------ *
 * Eligibility decision.
 * ------------------------------------------------------------------ */

export type EligibilityStatus =
  | "new_purchase"
  | "already_active"
  | "higher_plan_active"
  | "upgrade_prorated"
  | "payment_in_progress"
  | "provider_switch_blocked";

export interface SubscriptionRecord extends MembershipRow {
  id: string;
  product_id: string | null;
  current_period_start: string | null;
}

export interface PendingOrderRecord {
  id: string;
  plan: string;
  provider: string;
  created_at: string;
  pricing_reason: string | null;
}

export interface EligibilityInput {
  provider: Provider;
  plan: PlanKey;
  subscriptions: SubscriptionRecord[] | null | undefined;
  pendingOrders?: PendingOrderRecord[] | null;
  now: number;
  paddleEnvironment: PaddleEnv;
}

export interface Eligibility {
  status: EligibilityStatus;
  provider: Provider;
  plan: PlanKey;
  /** ISO end of the currently paid period, when one exists. */
  validUntil?: string | null;
  currentPlan?: PlanKey | null;
  currentProvider?: Provider | null;
  /** Only present for upgrade_prorated. All server-computed. */
  baseAmount?: number;
  creditAmount?: number;
  finalAmount?: number;
  upgradeFromSubscriptionId?: string | null;
}

/** The single decision used by BOTH the eligibility endpoint and checkout creation. */
export function decideCheckoutEligibility(input: EligibilityInput): Eligibility {
  const base = { provider: input.provider, plan: input.plan } as const;

  const valid = (input.subscriptions ?? []).filter((row) =>
    isMembershipRowValid(row, { paddleEnvironment: input.paddleEnvironment, now: input.now }),
  );

  // Latest-ending valid membership wins the decision.
  const current = valid
    .slice()
    .sort((a, b) => (ms(b.current_period_end) ?? 0) - (ms(a.current_period_end) ?? 0))[0];

  const pending = (input.pendingOrders ?? []).find(
    (order) =>
      order.plan === input.plan &&
      order.provider === input.provider &&
      input.now - (ms(order.created_at) ?? 0) < PENDING_CHECKOUT_TTL_MS,
  );

  if (!current) {
    if (pending) return { ...base, status: "payment_in_progress" };
    return { ...base, status: "new_purchase" };
  }

  const currentProvider = ((current.provider ?? "paddle").toLowerCase() as Provider) ?? "paddle";
  const currentPlan = planFromProductId(current.product_id);
  const shared = {
    ...base,
    validUntil: current.current_period_end,
    currentPlan,
    currentProvider,
  };

  // Cross-provider: never invent USD <-> GEL credit.
  if (currentProvider !== input.provider) {
    return { ...shared, status: "provider_switch_blocked" };
  }

  if (currentPlan === input.plan) return { ...shared, status: "already_active" };

  if (currentPlan && PLAN_RANK[currentPlan] > PLAN_RANK[input.plan]) {
    return { ...shared, status: "higher_plan_active" };
  }

  // monthly -> quarterly. Immediate proration only where one currency applies.
  if (currentPlan === "monthly" && input.plan === "quarterly" && input.provider === "bog") {
    if (pending) return { ...shared, status: "payment_in_progress" };
    const proration = computeMonthlyToQuarterlyProration({
      periodStart: current.current_period_start,
      periodEnd: current.current_period_end,
      now: input.now,
    });
    return {
      ...shared,
      status: "upgrade_prorated",
      baseAmount: proration.baseAmount,
      creditAmount: proration.creditAmount,
      finalAmount: proration.finalAmount,
      upgradeFromSubscriptionId: current.id,
    };
  }

  // Any other combination (e.g. Paddle upgrade) keeps the paid period intact.
  return { ...shared, status: "already_active" };
}

export function isPayableStatus(status: EligibilityStatus): boolean {
  return status === "new_purchase" || status === "upgrade_prorated";
}
