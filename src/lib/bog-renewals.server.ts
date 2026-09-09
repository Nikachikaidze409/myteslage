// Bank of Georgia automatic renewals — SERVER ONLY.
//
// Nothing here trusts the browser or a redirect: a membership is only ever
// extended after BOG's own receipt confirms a completed subscription payment
// on the correct parent order for the correct trusted amount.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BOG_RECURRING_AMOUNTS,
  computeRenewalPeriod,
  createBogRenewalCharge,
  fetchBogPaymentDetails,
  isPlanKey,
  newRenewalReference,
  renewalPaymentMatches,
  type BogPaymentDetails,
  type PlanKey,
} from "./bog.server";
import {
  RENEWAL_LOCK_MS,
  afterFailedAttempt,
  shouldAttemptRenewal,
  type RenewalSubscription,
} from "./bog-renewals";

const ORDER_COLUMNS =
  "id, user_id, plan, amount, currency, status, provider_order_id, external_order_id, subscription_id, parent_order_id, billing_period_end, attempt_no, kind";

export interface RenewalOrderRow {
  id: string;
  user_id: string;
  plan: string;
  amount: number | string;
  currency: string;
  status: string;
  provider_order_id: string | null;
  external_order_id: string | null;
  subscription_id: string | null;
  parent_order_id: string | null;
  billing_period_end: string | null;
  attempt_no: number | null;
  kind: string | null;
}

/* ------------------------------------------------------------------ *
 * Settlement (used by the shared BOG callback and by reconciliation).
 * ------------------------------------------------------------------ */

export type SettleResult = "extended" | "already_settled" | "rejected" | "unverified" | "error";

export async function settleRenewalOrder(
  order: RenewalOrderRow,
  details: BogPaymentDetails,
  now: Date = new Date(),
): Promise<SettleResult> {
  if (order.status === "completed") return "already_settled";
  if (!isPlanKey(order.plan)) {
    console.error("[BOG] renewal refused: unknown plan on renewal order");
    return "error";
  }
  const plan: PlanKey = order.plan;

  const { data: sub, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, user_id, provider, provider_parent_order_id, current_period_end, last_payment_order_id, renewal_attempts",
    )
    .eq("id", order.subscription_id ?? "")
    .maybeSingle();

  if (subError) {
    console.error("[BOG] could not read subscription for renewal", subError.message);
    return "error";
  }
  if (!sub || sub.user_id !== order.user_id || (sub.provider ?? "") !== "bog") {
    console.error("[BOG] renewal refused: subscription mismatch");
    return "error";
  }

  if (
    !sub.provider_parent_order_id ||
    !renewalPaymentMatches(details, order, {
      parentOrderId: sub.provider_parent_order_id,
      plan,
    })
  ) {
    return details.statusKey && details.statusKey !== "completed" ? "rejected" : "unverified";
  }

  // Recovery-safe: a previous attempt may have extended the period and then
  // failed before settling the order. Never extend the same order twice.
  const alreadyExtended = sub.last_payment_order_id === order.provider_order_id;

  if (!alreadyExtended) {
    const period = computeRenewalPeriod(plan, sub.current_period_end, now);
    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: period.start.toISOString(),
        current_period_end: period.end.toISOString(),
        next_billing_at: period.end.toISOString(),
        last_payment_order_id: order.provider_order_id,
        renewal_status: "idle",
        renewal_attempts: 0,
        last_renewal_attempt_at: now.toISOString(),
        renewal_lock_until: null,
      })
      .eq("id", sub.id)
      .eq("user_id", order.user_id);

    if (updateError) {
      console.error("[BOG] could not extend membership", updateError.message);
      return "error";
    }
  }

  const { error: orderError } = await supabaseAdmin
    .from("payment_orders")
    .update({ status: "completed" })
    .eq("id", order.id);

  if (orderError) {
    console.error("[BOG] could not settle renewal order", orderError.message);
    return "error";
  }

  return alreadyExtended ? "already_settled" : "extended";
}

/* ------------------------------------------------------------------ *
 * Reconciliation of a renewal order that is still pending at BOG.
 * ------------------------------------------------------------------ */

async function markAttemptFailed(subscriptionId: string, attemptsBefore: number, now: Date) {
  await supabaseAdmin
    .from("subscriptions")
    .update(afterFailedAttempt(attemptsBefore, now))
    .eq("id", subscriptionId);
}

/**
 * Never start a second charge while a previous BOG order is unresolved.
 * Returns true when the period is still occupied by an unresolved attempt.
 */
async function reconcilePending(
  pending: RenewalOrderRow,
  attemptsBefore: number,
  now: Date,
): Promise<boolean> {
  if (!pending.provider_order_id) return true;

  let details: BogPaymentDetails;
  try {
    details = await fetchBogPaymentDetails(pending.provider_order_id);
  } catch {
    return true; // unknown -> keep waiting, never double charge
  }

  const status = details.statusKey ?? "";
  if (status === "completed") {
    await settleRenewalOrder(pending, details, now);
    return true;
  }
  if (status === "rejected" || status === "refunded_partially" || status === "refunded") {
    await supabaseAdmin
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("id", pending.id)
      .eq("status", "pending");
    if (pending.subscription_id) {
      await markAttemptFailed(pending.subscription_id, attemptsBefore, now);
    }
    return true;
  }
  // created / processing -> keep waiting.
  return true;
}

/* ------------------------------------------------------------------ *
 * Scheduler entry point.
 * ------------------------------------------------------------------ */

export interface RenewalRunSummary {
  examined: number;
  charged: number;
  skipped: number;
  failed: number;
}

export async function processDueBogRenewals(
  now: Date = new Date(),
  batchSize = 25,
): Promise<RenewalRunSummary> {
  const summary: RenewalRunSummary = { examined: 0, charged: 0, skipped: 0, failed: 0 };
  const nowMs = now.getTime();

  const { data: due, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, user_id, provider, product_id, auto_renew, cancel_at_period_end, provider_parent_order_id, next_billing_at, current_period_end, renewal_status, renewal_attempts, last_renewal_attempt_at, renewal_lock_until",
    )
    .eq("provider", "bog")
    .eq("auto_renew", true)
    .lte("next_billing_at", now.toISOString())
    .order("next_billing_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("[BOG] could not read due renewals", error.message);
    return summary;
  }

  for (const row of due ?? []) {
    summary.examined += 1;
    const sub = row as unknown as RenewalSubscription & { user_id: string; product_id: string };
    const gate = shouldAttemptRenewal(sub, nowMs);
    if (!gate.attempt) {
      summary.skipped += 1;
      continue;
    }

    // Claim: two workers can never own the same subscription at once.
    const lockUntil = new Date(nowMs + RENEWAL_LOCK_MS).toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("subscriptions")
      .update({ renewal_lock_until: lockUntil, renewal_status: "pending" })
      .eq("id", sub.id)
      .or(`renewal_lock_until.is.null,renewal_lock_until.lt.${now.toISOString()}`)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    const attemptsBefore = sub.renewal_attempts ?? 0;
    const plan = planOf(sub.product_id);
    if (!plan) {
      summary.skipped += 1;
      await supabaseAdmin
        .from("subscriptions")
        .update({ renewal_lock_until: null, renewal_status: "idle" })
        .eq("id", sub.id);
      continue;
    }

    const billingPeriodEnd = sub.current_period_end;

    // An unresolved earlier attempt for this exact period blocks a new charge.
    const { data: existing } = await supabaseAdmin
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .eq("subscription_id", sub.id)
      .eq("kind", "renewal")
      .eq("billing_period_end", billingPeriodEnd ?? "")
      .in("status", ["pending", "completed"])
      .maybeSingle();

    if (existing) {
      const row = existing as unknown as RenewalOrderRow;
      if (row.status === "pending") await reconcilePending(row, attemptsBefore, now);
      await releaseLock(sub.id);
      summary.skipped += 1;
      continue;
    }

    const externalOrderId = newRenewalReference();
    const { data: reserved, error: reserveError } = await supabaseAdmin
      .from("payment_orders")
      .insert({
        user_id: sub.user_id,
        provider: "bog",
        kind: "renewal",
        plan,
        amount: BOG_RECURRING_AMOUNTS[plan],
        currency: "GEL",
        status: "pending",
        external_order_id: externalOrderId,
        subscription_id: sub.id,
        parent_order_id: sub.provider_parent_order_id,
        billing_period_end: billingPeriodEnd,
        attempt_no: attemptsBefore + 1,
        pricing_reason: "standard",
        base_amount: BOG_RECURRING_AMOUNTS[plan],
        credit_amount: 0,
        final_amount: BOG_RECURRING_AMOUNTS[plan],
      })
      .select("id")
      .maybeSingle();

    if (reserveError || !reserved) {
      // Unique index hit: another worker already reserved this exact period.
      await releaseLock(sub.id);
      summary.skipped += 1;
      continue;
    }

    try {
      const created = await createBogRenewalCharge(sub.provider_parent_order_id!, externalOrderId);
      await supabaseAdmin
        .from("payment_orders")
        .update({ provider_order_id: created.orderId })
        .eq("id", reserved.id);
      await supabaseAdmin
        .from("subscriptions")
        .update({
          renewal_status: "pending",
          last_renewal_attempt_at: now.toISOString(),
          renewal_lock_until: null,
        })
        .eq("id", sub.id);
      summary.charged += 1;
    } catch {
      await supabaseAdmin.from("payment_orders").update({ status: "failed" }).eq("id", reserved.id);
      await markAttemptFailed(sub.id, attemptsBefore, now);
      summary.failed += 1;
    }
  }

  return summary;
}

async function releaseLock(subscriptionId: string) {
  await supabaseAdmin
    .from("subscriptions")
    .update({ renewal_lock_until: null })
    .eq("id", subscriptionId);
}

function planOf(productId: string | null): PlanKey | null {
  if (!productId) return null;
  if (productId.endsWith("monthly")) return "monthly";
  if (productId.endsWith("quarterly")) return "quarterly";
  return null;
}
