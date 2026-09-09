import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The browser may only name a plan. Amount, currency and product ids come from
 * the trusted server-side plan table in bog.server.ts.
 */
const planSchema = z.object({ plan: z.enum(["monthly", "quarterly"]) });

export const createBogCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => planSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { BOG_PLANS, buildOrderPayload, createBogOrder } = await import("@/lib/bog.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const plan = BOG_PLANS[data.plan];
    // Opaque: carries no user identifier.
    const externalOrderId = `tsn_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

    const created = await createBogOrder(buildOrderPayload(data.plan, externalOrderId));

    const { error } = await supabaseAdmin.from("payment_orders").insert({
      user_id: context.userId,
      provider: "bog",
      provider_order_id: created.orderId,
      external_order_id: externalOrderId,
      plan: data.plan,
      amount: plan.amount,
      currency: plan.currency,
      status: "pending",
    });
    if (error) {
      console.error("[BOG] could not record payment order", error.message);
      throw new Error("Could not start checkout. Please try again.");
    }

    return { orderId: created.orderId, redirectUrl: created.redirectUrl };
  });

/**
 * Trusted membership state for the success page. A redirect back from the bank
 * is never treated as proof of payment — only this database state counts.
 */
export const getMembershipState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("status, current_period_end, provider")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const open =
      !!data &&
      ["active", "trialing", "past_due"].includes(data.status) &&
      (!data.current_period_end || new Date(data.current_period_end).getTime() > Date.now());

    return { active: open, provider: data?.provider ?? null };
  });

/**
 * Verified state of ONE specific payment attempt. An unrelated (Paddle or
 * older BOG) membership can never make this attempt look successful.
 */
export const getBogPaymentState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ externalOrderId: z.string().min(4).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("payment_orders")
      .select("status")
      .eq("user_id", context.userId)
      .eq("provider", "bog")
      .eq("external_order_id", data.externalOrderId)
      .maybeSingle();

    if (!row) return { state: "pending" as const };
    const status = row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "pending";
    return { state: status as "pending" | "completed" | "failed" };
  });
