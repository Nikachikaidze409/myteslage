import { createFileRoute } from "@tanstack/react-router";

/**
 * Bank of Georgia payment callback.
 *
 * Order of operations is security-critical:
 *   1. read the body as RAW TEXT
 *   2. verify the RSA signature over that raw text
 *   3. only then JSON.parse
 *   4. independently re-read the payment from BOG before touching membership
 */
export const Route = createFileRoute("/api/public/payments/bog/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("Callback-Signature");

        const { verifyCallbackSignature } = await import("@/lib/bog.server");
        if (!verifyCallbackSignature(rawBody, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: { event?: string; body?: { order_id?: string } };
        try {
          event = JSON.parse(rawBody) as typeof event;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        if (event.event !== "order_payment") return new Response("ok");
        const orderId = event.body?.order_id;
        if (!orderId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await supabaseAdmin
          .from("payment_orders")
          .select("id, user_id, plan, amount, currency, status, provider_order_id, external_order_id")
          .eq("provider_order_id", orderId)
          .maybeSingle();

        if (!order) return new Response("ok");
        // Idempotent: a repeated callback for an already-settled order is a no-op.
        if (order.status === "completed") return new Response("ok");

        const { fetchBogPaymentDetails, paymentMatchesOrder, computePeriodEnd, BOG_PLANS, isPlanKey } =
          await import("@/lib/bog.server");

        // An unknown plan value must never be silently treated as quarterly.
        if (!isPlanKey(order.plan)) {
          console.error("[BOG] refusing to activate: unknown plan on payment order");
          return new Response("ok");
        }

        const details = await fetchBogPaymentDetails(orderId);
        if (!paymentMatchesOrder(details, order)) {
          if (details.statusKey && details.statusKey !== "completed") {
            await supabaseAdmin
              .from("payment_orders")
              .update({ status: "failed" })
              .eq("id", order.id)
              .eq("status", "pending");
          }
          return new Response("ok");
        }

        const plan = order.plan;
        const start = new Date();
        const planConfig = BOG_PLANS[plan];

        const { error: subError } = await supabaseAdmin.from("subscriptions").insert({
          user_id: order.user_id,
          provider: "bog",
          provider_subscription_id: orderId,
          provider_parent_order_id: orderId,
          last_payment_order_id: orderId,
          product_id: planConfig.id,
          price_id: planConfig.id,
          status: "active",
          current_period_start: start.toISOString(),
          current_period_end: computePeriodEnd(plan, start).toISOString(),
          environment: "live",
          paddle_subscription_id: null,
          paddle_customer_id: null,
        });
        if (subError) {
          console.error("[BOG] could not activate membership", subError.message);
          return new Response("Unable to save subscription", { status: 500 });
        }

        await supabaseAdmin
          .from("payment_orders")
          .update({ status: "completed" })
          .eq("id", order.id);

        return new Response("ok");
      },
    },
  },
});
