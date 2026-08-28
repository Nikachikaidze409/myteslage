import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const envSchema = z.enum(["sandbox", "live"]);

type PaddleEvent = {
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    product_id?: string;
    custom_data?: { userId?: string } | null;
    items?: Array<{ price?: { id?: string }; product?: { id?: string } }>;
    current_billing_period?: { starts_at?: string; ends_at?: string } | null;
    scheduled_change?: { action?: string } | null;
    cancel_at_period_end?: boolean;
  };
};

function isValidSignature(rawBody: string, signature: string, secret: string): boolean {
  const parts = Object.fromEntries(signature.split(";").map((part) => part.split("=", 2)));
  const timestamp = parts.ts;
  const received = parts.h1;
  if (!timestamp || !received) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = envSchema.parse(new URL(request.url).searchParams.get("env") ?? "sandbox");
        const rawBody = await request.text();
        const signature = request.headers.get("paddle-signature");
        const secret = env === "live" ? process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"] : process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"];
        if (!secret || !signature || !isValidSignature(rawBody, signature, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(rawBody) as PaddleEvent;
        const data = event.data;
        const subscriptionId = data?.id;
        if (!subscriptionId || !data) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const existing = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("paddle_subscription_id", subscriptionId)
          .maybeSingle();
        const userId = data.custom_data?.userId ?? existing.data?.user_id;
        if (!userId) return new Response("ok");

        const { resolveExternalId } = await import("@/lib/paddle.server");
        const priceId = data.items?.[0]?.price?.id;
        const productId = data.items?.[0]?.product?.id ?? data.product_id;
        const [externalPriceId, externalProductId] = await Promise.all([
          priceId ? resolveExternalId(env, "prices", priceId) : Promise.resolve(null),
          productId ? resolveExternalId(env, "products", productId) : Promise.resolve(null),
        ]);
        if (!externalPriceId || !externalProductId) return new Response("ok");

        const status = data.status ?? (event.event_type?.split(".")[1] === "canceled" ? "canceled" : "active");
        const period = data.current_billing_period;
        const { error } = await supabaseAdmin.from("subscriptions").upsert(
          {
            user_id: userId,
            paddle_subscription_id: subscriptionId,
            paddle_customer_id: data.customer_id ?? "unknown",
            product_id: externalProductId,
            price_id: externalPriceId,
            status,
            current_period_start: period?.starts_at ?? null,
            current_period_end: period?.ends_at ?? null,
            cancel_at_period_end: Boolean(data.cancel_at_period_end || data.scheduled_change?.action === "cancel"),
            environment: env,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "paddle_subscription_id" },
        );
        if (error) {
          console.error("Subscription webhook persistence failed", error);
          return new Response("Unable to save subscription", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
