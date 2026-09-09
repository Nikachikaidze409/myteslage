import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BOG_CALLBACK_URL,
  BOG_PLANS,
  bogSuccessUrl,
  isPlanKey,
  bogAmount,
  buildOrderPayload,
  computePeriodEnd,
  extractCreatedOrder,
  parsePaymentDetails,
  paymentMatchesOrder,
  verifyCallbackSignature,
} from "./bog.server";
import { hasMapAccess } from "./map-access.middleware";
import { anyMembershipValid, isMembershipRowValid } from "./membership";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("trusted plan pricing", () => {
  it("monthly is exactly 8 GEL", () => {
    expect(BOG_PLANS.monthly.amount).toBe(8);
    expect(BOG_PLANS.monthly.currency).toBe("GEL");
    expect(bogAmount(BOG_PLANS.monthly.amount)).toBe(8);
  });

  it("quarterly is exactly 21.60 GEL", () => {
    expect(BOG_PLANS.quarterly.amount).toBe(21.6);
    expect(BOG_PLANS.quarterly.currency).toBe("GEL");
    expect(bogAmount(BOG_PLANS.quarterly.amount)).toBe(21.6);
  });

  it("periods are 1 and 3 months", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    expect(computePeriodEnd("monthly", start).toISOString().slice(0, 7)).toBe("2026-02");
    expect(computePeriodEnd("quarterly", start).toISOString().slice(0, 7)).toBe("2026-04");
  });
});

describe("order payload is built server-side only", () => {
  it("takes amount and currency from the plan table, never from input", () => {
    const payload = buildOrderPayload("monthly", "tsn_abc");
    expect(payload.purchase_units.total_amount).toBe(8);
    expect(payload.purchase_units.currency).toBe("GEL");
    expect(payload.purchase_units.basket[0]!.unit_price).toBe(8);
    expect(payload.purchase_units.basket[0]!.product_id).toBe("tesla_map_georgia_monthly");
    expect(payload.callback_url).toBe(BOG_CALLBACK_URL);
    expect(payload.capture).toBe("automatic");
    expect(payload.application_type).toBe("web");
  });

  it("the checkout input schema accepts only a plan name", () => {
    const fn = src("lib/bog.functions.ts");
    expect(fn).toContain('z.object({ plan: z.enum(["monthly", "quarterly"]) })');
    expect(fn).not.toMatch(/amount:\s*z\./);
    expect(fn).not.toMatch(/currency:\s*z\./);
  });

  it("checkout requires an authenticated user", () => {
    expect(src("lib/bog.functions.ts")).toContain(".middleware([requireSupabaseAuth])");
  });

  it("create-order sends an Idempotency-Key", () => {
    expect(src("lib/bog.server.ts")).toContain('"Idempotency-Key": crypto.randomUUID()');
  });

  it("returns only the order id and redirect URL to the browser", () => {
    expect(src("lib/bog.functions.ts")).toContain(
      "return { orderId: created.orderId, redirectUrl: created.redirectUrl };",
    );
  });
});

describe("credentials stay on the server", () => {
  it("BOG credentials and the bearer token are never read in client code", () => {
    for (const file of ["routes/checkout.tsx", "routes/checkout.success.tsx", "lib/bog.functions.ts"]) {
      const content = src(file);
      expect(content).not.toContain("BOG_CLIENT_SECRET");
      expect(content).not.toContain("BOG_CLIENT_ID");
      expect(content).not.toContain("access_token");
    }
  });

  it("the server module reads credentials from process.env only", () => {
    const server = src("lib/bog.server.ts");
    expect(server).toContain('process.env["BOG_CLIENT_ID"]');
    expect(server).toContain('process.env["BOG_CLIENT_SECRET"]');
    expect(server).not.toContain("import.meta.env");
  });
});

describe("callback signature", () => {
  const body = JSON.stringify({ event: "order_payment", body: { order_id: "ord_1" } });

  it("rejects a missing signature", () => {
    expect(verifyCallbackSignature(body, null)).toBe(false);
  });

  it("rejects a forged signature", () => {
    expect(verifyCallbackSignature(body, Buffer.from("nope").toString("base64"))).toBe(false);
  });

  it("is verified before the body is parsed", () => {
    const route = src("routes/api/public/payments/bog/callback.ts");
    const rawIdx = route.indexOf("await request.text()");
    const verifyIdx = route.indexOf("verifyCallbackSignature(rawBody");
    const parseIdx = route.indexOf("JSON.parse(rawBody)");
    expect(rawIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(rawIdx);
    expect(parseIdx).toBeGreaterThan(verifyIdx);
    expect(route).toContain('return new Response("Invalid signature", { status: 401 })');
  });

  it("makes no database call before verification succeeds", () => {
    const route = src("routes/api/public/payments/bog/callback.ts");
    expect(route.indexOf("client.server")).toBeGreaterThan(
      route.indexOf("verifyCallbackSignature(rawBody"),
    );
  });

  it("is idempotent for an already-completed order", () => {
    const route = src("routes/api/public/payments/bog/callback.ts");
    expect(route).toContain('if (order.status === "completed") return new Response("ok");');
  });
});

describe("payment verification", () => {
  const order = { provider_order_id: "ord_1", external_order_id: "tsn_1", amount: 8, currency: "GEL" };
  const good = parsePaymentDetails({
    order_id: "ord_1",
    external_order_id: "tsn_1",
    order_status: { key: "completed" },
    purchase_units: { transfer_amount: "8.00", currency_code: "GEL" },
  });

  it("accepts a completed, matching payment", () => {
    expect(paymentMatchesOrder(good, order)).toBe(true);
  });

  it("rejects a wrong amount", () => {
    const d = parsePaymentDetails({
      order_id: "ord_1",
      external_order_id: "tsn_1",
      order_status: { key: "completed" },
      purchase_units: { transfer_amount: "1.00", currency_code: "GEL" },
    });
    expect(paymentMatchesOrder(d, order)).toBe(false);
  });

  it("rejects a wrong currency", () => {
    const d = parsePaymentDetails({
      order_id: "ord_1",
      external_order_id: "tsn_1",
      order_status: { key: "completed" },
      purchase_units: { transfer_amount: "8.00", currency_code: "USD" },
    });
    expect(paymentMatchesOrder(d, order)).toBe(false);
  });

  it("rejects a mismatched order id", () => {
    const d = parsePaymentDetails({
      order_id: "other",
      external_order_id: "tsn_1",
      order_status: { key: "completed" },
      purchase_units: { transfer_amount: "8.00", currency_code: "GEL" },
    });
    expect(paymentMatchesOrder(d, order)).toBe(false);
  });

  it("rejects a non-completed status", () => {
    const d = parsePaymentDetails({
      order_id: "ord_1",
      external_order_id: "tsn_1",
      order_status: { key: "rejected" },
      purchase_units: { transfer_amount: "8.00", currency_code: "GEL" },
    });
    expect(paymentMatchesOrder(d, order)).toBe(false);
  });

  it("the redirect page never activates a membership on its own", () => {
    const page = src("routes/checkout.success.tsx");
    expect(page).toContain("getBogPaymentState");
    expect(page).not.toContain("subscriptions");
    expect(page).not.toContain("insert");
  });

  it("extracts the hosted checkout link", () => {
    expect(extractCreatedOrder({ id: "ord_1", _links: { redirect: { href: "https://pay" } } })).toEqual({
      orderId: "ord_1",
      redirectUrl: "https://pay",
    });
    expect(extractCreatedOrder({ id: "ord_1" })).toBeNull();
  });
});

describe("provider-neutral map access", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();

  function client(
    rows: Array<{
      status: string;
      current_period_end: string | null;
      provider?: string;
      environment?: string;
    }>,
  ) {
    return {
      rpc: async () => ({ data: false }),
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: rows }) }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("an existing Paddle subscription still grants access", async () => {
    await expect(
      hasMapAccess(client([{ status: "active", current_period_end: future, provider: "paddle", environment: "live" }]), "u1"),
    ).resolves.toBe(true);
  });

  it("a new Bank of Georgia subscription grants access", async () => {
    await expect(
      hasMapAccess(client([{ status: "active", current_period_end: future, provider: "bog", environment: "live" }]), "u2"),
    ).resolves.toBe(true);
  });

  it("an expired subscription does not grant access", async () => {
    await expect(
      hasMapAccess(client([{ status: "active", current_period_end: "2020-01-01T00:00:00Z", provider: "bog", environment: "live" }]), "u3"),
    ).resolves.toBe(false);
  });

  it("no subscription does not grant access", async () => {
    await expect(hasMapAccess(client([]), "u4")).resolves.toBe(false);
  });
});


describe("pre-publish hardening", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = "2020-01-01T00:00:00Z";
  const live = { paddleEnvironment: "live" as const };

  it("the success redirect carries the opaque external order id", () => {
    expect(bogSuccessUrl("tsn_abc")).toBe(
      "https://teslanavi.online/checkout/success?provider=bog&order=tsn_abc",
    );
    expect(buildOrderPayload("monthly", "tsn_abc").redirect_urls.success).toContain("order=tsn_abc");
  });

  it("an active Paddle subscription does not mark a pending BOG order as paid", () => {
    const page = src("routes/checkout.success.tsx");
    // The BOG branch is decided only by the payment_orders row for this attempt.
    expect(page).toContain('getBogPaymentState({ data: { externalOrderId } })');
    expect(page).toContain('result.state === "completed"');
    const fn = src("lib/bog.functions.ts");
    expect(fn).toContain('.from("payment_orders")');
    expect(fn).toContain('.eq("provider", "bog")');
  });

  it("a completed matching BOG payment reports success", () => {
    const details = parsePaymentDetails({
      order_id: "ord_9",
      external_order_id: "tsn_9",
      order_status: { key: "completed" },
      purchase_units: { transfer_amount: "21.60", currency_code: "GEL" },
    });
    expect(
      paymentMatchesOrder(details, {
        provider_order_id: "ord_9",
        external_order_id: "tsn_9",
        amount: 21.6,
        currency: "GEL",
      }),
    ).toBe(true);
  });

  it("a user cannot inspect another user's payment order", () => {
    const fn = src("lib/bog.functions.ts");
    expect(fn).toContain("getBogPaymentState");
    expect(fn).toContain('.eq("user_id", context.userId)');
    expect(fn).toContain('.eq("external_order_id", data.externalOrderId)');
    // Only a coarse state leaves the server.
    expect(fn).toContain('state: status as "pending" | "completed" | "failed"');
  });

  it("a live BOG membership grants access", () => {
    expect(
      isMembershipRowValid(
        { status: "active", current_period_end: future, provider: "bog", environment: "live" },
        live,
      ),
    ).toBe(true);
  });

  it("a sandbox BOG membership never grants access", () => {
    expect(
      isMembershipRowValid(
        { status: "active", current_period_end: future, provider: "bog", environment: "sandbox" },
        live,
      ),
    ).toBe(false);
  });

  it("a sandbox Paddle membership does not grant production access", () => {
    expect(
      isMembershipRowValid(
        { status: "active", current_period_end: future, provider: "paddle", environment: "sandbox" },
        live,
      ),
    ).toBe(false);
    expect(
      isMembershipRowValid(
        { status: "active", current_period_end: future, provider: "paddle", environment: "sandbox" },
        { paddleEnvironment: "sandbox" },
      ),
    ).toBe(true);
  });

  it("a canceled subscription with no period end does not grant indefinite access", () => {
    expect(
      isMembershipRowValid(
        { status: "canceled", current_period_end: null, provider: "bog", environment: "live" },
        live,
      ),
    ).toBe(false);
    expect(
      isMembershipRowValid(
        { status: "canceled", current_period_end: future, provider: "bog", environment: "live" },
        live,
      ),
    ).toBe(true);
    expect(
      isMembershipRowValid(
        { status: "canceled", current_period_end: past, provider: "bog", environment: "live" },
        live,
      ),
    ).toBe(false);
  });

  it("the UI gate and the server gate share one rule", () => {
    expect(src("components/AuthGate.tsx")).toContain("anyMembershipValid");
    expect(src("lib/map-access.middleware.ts")).toContain("anyMembershipValid");
    expect(anyMembershipValid([], live)).toBe(false);
  });

  it("an unknown plan cannot activate a quarterly membership", () => {
    expect(isPlanKey("lifetime")).toBe(false);
    const route = src("routes/api/public/payments/bog/callback.ts");
    expect(route).toContain("if (!isPlanKey(order.plan))");
    expect(route).not.toContain('order.plan === "monthly" ? "monthly" : "quarterly"');
  });

  it("a mismatched external order id cannot activate a membership", () => {
    const details = parsePaymentDetails({
      order_id: "ord_9",
      external_order_id: "tsn_other",
      order_status: { key: "completed" },
      purchase_units: { transfer_amount: "8.00", currency_code: "GEL" },
    });
    expect(
      paymentMatchesOrder(details, {
        provider_order_id: "ord_9",
        external_order_id: "tsn_9",
        amount: 8,
        currency: "GEL",
      }),
    ).toBe(false);
    expect(src("routes/api/public/payments/bog/callback.ts")).toContain("external_order_id");
  });
});

describe("callback recovery safety", () => {
  const route = src("routes/api/public/payments/bog/callback.ts");

  it("finishes settling the payment order when the subscription already exists", () => {
    expect(route).toContain('.eq("provider_subscription_id", orderId)');
    expect(route).toContain("if (!existingSub) {");
    const lookupIdx = route.indexOf("existingSub, error: existingSubError");
    const updateIdx = route.indexOf('.update({ status: "completed" })');
    expect(lookupIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(lookupIdx);
  });

  it("returns 500 when the payment order status update fails", () => {
    expect(route).toContain("orderUpdateError");
    expect(route).toContain('return new Response("Unable to settle payment order", { status: 500 })');
  });

  it("does not create a duplicate subscription on a repeated callback", () => {
    expect(route).toContain('if (order.status === "completed") return new Response("ok");');
    const guardIdx = route.indexOf("if (!existingSub) {");
    const insertIdx = route.indexOf('.from("subscriptions").insert(');
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });

  it("never accepts another user's subscription as proof of payment", () => {
    expect(route).toContain("existingSub.user_id !== order.user_id");
    expect(route).toContain('return new Response("Subscription owner mismatch", { status: 500 })');
  });
});

describe("provider-aware success-page membership check", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it("an active BOG membership must NOT satisfy a Paddle success page", () => {
    // getMembershipState({ provider: "paddle" }) filters rows to paddle only.
    const rows = [
      { status: "active", current_period_end: future, provider: "bog", environment: "live" },
    ].filter((r) => r.provider === "paddle");
    expect(anyMembershipValid(rows, { paddleEnvironment: "live" })).toBe(false);
  });

  it("a valid Paddle membership satisfies the Paddle success page", () => {
    const rows = [
      { status: "active", current_period_end: future, provider: "bog", environment: "live" },
      { status: "active", current_period_end: future, provider: "paddle", environment: "live" },
    ].filter((r) => r.provider === "paddle");
    expect(anyMembershipValid(rows, { paddleEnvironment: "live" })).toBe(true);
  });

  it("getMembershipState filters subscriptions by the requested provider", () => {
    const fn = src("lib/bog.functions.ts");
    expect(fn).toContain('z.enum(["bog", "paddle"])');
    expect(fn).toContain('.eq("provider", data.provider)');
    expect(fn).toContain("anyMembershipValid");
  });

  it("the Paddle success path passes provider=paddle and keeps BOG order-specific", () => {
    const page = src("routes/checkout.success.tsx");
    expect(page).toContain('getMembershipState({ data: { provider: "paddle" } })');
    expect(page).toContain("getBogPaymentState({ data: { externalOrderId } })");
  });
});
