import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type {
  Eligibility,
  PendingOrderRecord,
  SubscriptionRecord,
} from "@/lib/checkout-eligibility";

/**
 * The browser may only name a plan and a provider. Amounts, credits, currency
 * and product ids all come from the trusted server-side tables.
 */
const planSchema = z.object({ plan: z.enum(["monthly", "quarterly"]) });
const eligibilitySchema = z.object({
  provider: z.enum(["bog", "paddle"]),
  plan: z.enum(["monthly", "quarterly"]),
});

/** Loads the trusted membership + pending-checkout state and decides. */
async function resolveEligibility(
  context: { supabase: SupabaseClient<Database>; userId: string },
  input: { provider: "bog" | "paddle"; plan: "monthly" | "quarterly" },
): Promise<Eligibility> {
  const { decideCheckoutEligibility, PENDING_CHECKOUT_TTL_MS } =
    await import("@/lib/checkout-eligibility");
  const { resolvePaddleEnvironment } = await import("@/lib/membership");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = Date.now();

  // Abandoned checkouts must not block a genuine retry forever.
  await supabaseAdmin
    .from("payment_orders")
    .update({ status: "expired" })
    .eq("user_id", context.userId)
    .eq("status", "pending")
    .lt("created_at", new Date(now - PENDING_CHECKOUT_TTL_MS).toISOString());

  const [{ data: subscriptions }, { data: pendingOrders }] = await Promise.all([
    context.supabase
      .from("subscriptions")
      .select(
        "id, status, current_period_start, current_period_end, provider, environment, product_id",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20),
    context.supabase
      .from("payment_orders")
      .select("id, plan, provider, created_at, pricing_reason")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .limit(20),
  ]);

  return decideCheckoutEligibility({
    provider: input.provider,
    plan: input.plan,
    subscriptions: (subscriptions ?? []) as SubscriptionRecord[],
    pendingOrders: (pendingOrders ?? []) as PendingOrderRecord[],
    now,
    paddleEnvironment: resolvePaddleEnvironment(
      process.env["VITE_PAYMENTS_CLIENT_TOKEN"] ?? process.env["PAYMENTS_CLIENT_TOKEN"],
    ),
  });
}

/** Trusted state the checkout UI must consult before offering a payment. */
export const getCheckoutEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => eligibilitySchema.parse(data))
  .handler(async ({ data, context }) => resolveEligibility(context, data));

export const createBogCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => planSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { BOG_PLANS, buildOrderPayload, createBogOrder, BOG_UPGRADE_DESCRIPTION } =
      await import("@/lib/bog.server");
    const { isPayableStatus } = await import("@/lib/checkout-eligibility");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Server-side gate: the UI state is never trusted.
    const eligibility = await resolveEligibility(context, { provider: "bog", plan: data.plan });
    if (!isPayableStatus(eligibility.status)) {
      return { ...eligibility, redirectUrl: null as string | null };
    }

    const plan = BOG_PLANS[data.plan];
    const upgrade = eligibility.status === "upgrade_prorated";
    const baseAmount = upgrade ? (eligibility.baseAmount ?? plan.amount) : plan.amount;
    const creditAmount = upgrade ? (eligibility.creditAmount ?? 0) : 0;
    const finalAmount = upgrade ? (eligibility.finalAmount ?? plan.amount) : plan.amount;

    // Opaque: carries no user identifier.
    const externalOrderId = `tsn_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

    // Reserve the pending slot FIRST: a unique index on (user_id, provider,
    // plan) for pending rows makes a double-click or a second tab impossible.
    const { data: reserved, error: reserveError } = await supabaseAdmin
      .from("payment_orders")
      .insert({
        user_id: context.userId,
        provider: "bog",
        external_order_id: externalOrderId,
        plan: data.plan,
        amount: finalAmount,
        base_amount: baseAmount,
        credit_amount: creditAmount,
        final_amount: finalAmount,
        upgrade_from_subscription_id: upgrade
          ? (eligibility.upgradeFromSubscriptionId ?? null)
          : null,
        pricing_reason: upgrade ? "monthly_to_quarterly_proration" : "standard",
        currency: plan.currency,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (reserveError) {
      if (reserveError.code === "23505") {
        return { ...eligibility, status: "payment_in_progress" as const, redirectUrl: null };
      }
      console.error("[BOG] could not record payment order", reserveError.message);
      throw new Error("Could not start checkout. Please try again.");
    }

    let created;
    try {
      created = await createBogOrder(
        buildOrderPayload(data.plan, externalOrderId, {
          amount: finalAmount,
          ...(upgrade ? { description: BOG_UPGRADE_DESCRIPTION } : {}),
        }),
      );
    } catch (error) {
      // Release the reservation so the user can try again immediately.
      if (reserved?.id) {
        await supabaseAdmin
          .from("payment_orders")
          .update({ status: "failed" })
          .eq("id", reserved.id);
      }
      throw error;
    }

    // STANDARD purchases only may become an automatic-renewal parent. A
    // prorated upgrade is charged below the full price, and BOG reuses the
    // parent's amount for every future renewal — so it is never saved.
    if (!upgrade) {
      const { enableBogAutomaticSubscription } = await import("@/lib/bog.server");
      const accepted = await enableBogAutomaticSubscription(created.orderId);
      if (!accepted) {
        // Never breaks checkout: the user pays normally, without auto-renew.
        console.error("[BOG] automatic subscription not established for this order");
      }
    }

    const { error: linkError } = await supabaseAdmin
      .from("payment_orders")
      .update({ provider_order_id: created.orderId })
      .eq("id", reserved!.id);
    if (linkError) {
      console.error("[BOG] could not link payment order", linkError.message);
      throw new Error("Could not start checkout. Please try again.");
    }

    return { ...eligibility, orderId: created.orderId, redirectUrl: created.redirectUrl };
  });

/**
 * Trusted membership state for the success page. A redirect back from the bank
 * is never treated as proof of payment — only this database state counts.
 *
 * Provider-aware: only rows from the requested provider are considered, using
 * the one shared membership-validity rule (membership.ts). An active BOG
 * membership can never make a Paddle checkout look successful and vice versa.
 */
export const getMembershipState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ provider: z.enum(["bog", "paddle"]) }).parse(data ?? { provider: "paddle" }),
  )
  .handler(async ({ data, context }) => {
    const { anyMembershipValid, resolvePaddleEnvironment } = await import("@/lib/membership");
    const { data: rows } = await context.supabase
      .from("subscriptions")
      .select("status, current_period_end, provider, environment")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .order("created_at", { ascending: false })
      .limit(10);

    const active = anyMembershipValid(rows, {
      paddleEnvironment: resolvePaddleEnvironment(
        process.env["VITE_PAYMENTS_CLIENT_TOKEN"] ?? process.env["PAYMENTS_CLIENT_TOKEN"],
      ),
    });

    return { active, provider: data.provider };
  });

/**
 * Verified state of ONE specific payment attempt. An unrelated (Paddle or
 * older BOG) membership can never make this attempt look successful.
 */
export const getBogPaymentState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ externalOrderId: z.string().min(4).max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("payment_orders")
      .select("status")
      .eq("user_id", context.userId)
      .eq("provider", "bog")
      .eq("external_order_id", data.externalOrderId)
      .maybeSingle();

    if (!row) return { state: "pending" as const };
    const status =
      row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "pending";
    return { state: status as "pending" | "completed" | "failed" };
  });

/**
 * Membership summary for the account menu. Read-only, own rows only.
 */
export const getBogSubscriptionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isMembershipRowValid } = await import("@/lib/membership");
    const { planFromProductId } = await import("@/lib/checkout-eligibility");

    const { data: rows } = await context.supabase
      .from("subscriptions")
      .select(
        "id, status, provider, environment, product_id, current_period_end, auto_renew, next_billing_at, cancel_at_period_end, renewal_status",
      )
      .eq("user_id", context.userId)
      .eq("provider", "bog")
      .order("created_at", { ascending: false })
      .limit(10);

    const active = (rows ?? []).filter((row) =>
      isMembershipRowValid(row, { paddleEnvironment: "live" }),
    );
    const current = active.sort(
      (a, b) =>
        new Date(b.current_period_end ?? 0).getTime() -
        new Date(a.current_period_end ?? 0).getTime(),
    )[0];

    if (!current) return { active: false as const };

    // A prorated upgrade is deliberately not an auto-renew parent.
    const { data: lastOrder } = await context.supabase
      .from("payment_orders")
      .select("pricing_reason")
      .eq("user_id", context.userId)
      .eq("provider", "bog")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      active: true as const,
      proratedUpgrade: lastOrder?.pricing_reason === "monthly_to_quarterly_proration",
      plan: planFromProductId(current.product_id),
      validUntil: current.current_period_end,
      autoRenew: current.auto_renew === true,
      nextBillingAt: current.next_billing_at,
      canceled: current.cancel_at_period_end === true || current.renewal_status === "canceled",
    };
  });

/**
 * Turns automatic renewal off. The local state is authoritative: even if the
 * bank's delete-card call fails, the scheduler can never charge again.
 */
export const cancelBogAutoRenew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteBogSavedCard } = await import("@/lib/bog.server");

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("id, provider_parent_order_id, current_period_end")
      .eq("user_id", context.userId)
      .eq("provider", "bog")
      .eq("auto_renew", true)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) return { canceled: false as const };

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        auto_renew: false,
        cancel_at_period_end: true,
        next_billing_at: null,
        renewal_status: "canceled",
        renewal_lock_until: null,
      })
      .eq("id", sub.id)
      .eq("user_id", context.userId);

    if (error) {
      console.error("[BOG] could not cancel automatic renewal", error.message);
      throw new Error("Could not cancel automatic renewal. Please try again.");
    }

    if (sub.provider_parent_order_id) {
      const removed = await deleteBogSavedCard(sub.provider_parent_order_id);
      if (!removed) {
        // Auto-renew stays OFF regardless; only flagged for follow-up.
        console.error("[BOG] saved card deletion needs administrative follow-up");
      }
    }

    return { canceled: true as const, validUntil: sub.current_period_end };
  });
