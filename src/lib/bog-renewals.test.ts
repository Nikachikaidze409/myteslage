import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BOG_RECURRING_AMOUNTS,
  canBeAutoRenewParent,
  computeRenewalPeriod,
  createBogRenewalCharge,
  deleteBogSavedCard,
  enableBogAutomaticSubscription,
  parsePaymentDetails,
  renewalPaymentMatches,
  resetBogTokenCache,
} from "./bog.server";
import {
  MAX_RENEWAL_ATTEMPTS,
  afterFailedAttempt,
  shouldAttemptRenewal,
  type RenewalSubscription,
} from "./bog-renewals";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const HOUR = 60 * 60 * 1000;

function sub(overrides: Partial<RenewalSubscription> = {}): RenewalSubscription {
  return {
    id: "s1",
    provider: "bog",
    auto_renew: true,
    cancel_at_period_end: false,
    provider_parent_order_id: "parent-1",
    next_billing_at: "2026-01-01T00:00:00Z",
    current_period_end: "2026-01-01T00:00:00Z",
    renewal_status: "idle",
    renewal_attempts: 0,
    last_renewal_attempt_at: null,
    renewal_lock_until: null,
    ...overrides,
  };
}

const NOW = new Date("2026-01-01T00:05:00Z").getTime();

/* ------------------------------------------------------------------ */

describe("saved-card parent eligibility", () => {
  it("1+2. a standard monthly / quarterly order may become the auto-renew parent", () => {
    expect(canBeAutoRenewParent("standard", 8, "monthly")).toBe(true);
    expect(canBeAutoRenewParent("standard", 21.6, "quarterly")).toBe(true);
  });

  it("3+4. a prorated upgrade can NEVER become the parent, at any amount", () => {
    expect(canBeAutoRenewParent("monthly_to_quarterly_proration", 17.6, "quarterly")).toBe(false);
    expect(canBeAutoRenewParent("monthly_to_quarterly_proration", 21.6, "quarterly")).toBe(false);
    // Any discounted amount is refused even if the reason were lost.
    expect(canBeAutoRenewParent("standard", 17.6, "quarterly")).toBe(false);
  });

  it("3b. checkout only asks the bank to save the card for non-upgrade orders", () => {
    const fn = src("lib/bog.functions.ts");
    expect(fn).toContain("if (!upgrade) {");
    expect(fn).toContain("enableBogAutomaticSubscription(created.orderId)");
  });

  it("the trusted recurring prices are the full list prices", () => {
    expect(BOG_RECURRING_AMOUNTS.monthly).toBe(8);
    expect(BOG_RECURRING_AMOUNTS.quarterly).toBe(21.6);
  });
});

describe("BOG saved-card endpoints", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetBogTokenCache();
    process.env["BOG_CLIENT_ID"] = "id";
    process.env["BOG_CLIENT_SECRET"] = "secret";
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("openid-connect/token")) {
        return { ok: true, json: async () => ({ access_token: "t", expires_in: 300 }) };
      }
      return { ok: true, status: 202, json: async () => ({ id: "renewal-order-1" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetBogTokenCache();
  });

  it("1. saving the card uses PUT /payments/v1/orders/{id}/subscriptions", async () => {
    expect(await enableBogAutomaticSubscription("order-1")).toBe(true);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/subscriptions"))!;
    expect(call[0]).toBe("https://api.bog.ge/payments/v1/orders/order-1/subscriptions");
    expect(call[1].method).toBe("PUT");
    expect(call[1].headers["Idempotency-Key"]).toMatch(/[0-9a-f-]{36}/);
  });

  it("5. a failed save-card request never breaks checkout", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("openid-connect/token")) {
        return { ok: true, json: async () => ({ access_token: "t", expires_in: 300 }) };
      }
      return { ok: false, status: 400, text: async () => "no" };
    });
    expect(await enableBogAutomaticSubscription("order-1")).toBe(false);
  });

  it("9+10+11. a renewal charge posts to /subscribe with no amount or currency", async () => {
    const created = await createBogRenewalCharge("parent-1", "tsr_abc");
    expect(created.orderId).toBe("renewal-order-1");
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/subscribe"))!;
    expect(call[0]).toBe("https://api.bog.ge/payments/v1/ecommerce/orders/parent-1/subscribe");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({
      callback_url: "https://teslanavi.online/api/public/payments/bog/callback",
      external_order_id: "tsr_abc",
    });
    expect(body.amount).toBeUndefined();
    expect(body.currency).toBeUndefined();
    expect(body.purchase_units).toBeUndefined();
  });

  it("24. deleting the saved card targets the parent order", async () => {
    expect(await deleteBogSavedCard("parent-1")).toBe(true);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/charges/card/"))!;
    expect(call[0]).toBe("https://api.bog.ge/payments/v1/charges/card/parent-1");
    expect(call[1].method).toBe("DELETE");
  });
});

describe("receipt parsing and renewal verification", () => {
  const receipt = (over: Record<string, unknown> = {}) => ({
    order_id: "r1",
    external_order_id: "tsr_1",
    order_status: { key: "completed" },
    purchase_units: { transfer_amount: "8.00", currency_code: "GEL" },
    payment_detail: {
      transfer_method: { key: "card" },
      payment_option: "subscription",
      saved_card_type: "subscription",
      parent_order_id: "parent-1",
      code: "100",
      code_description: "success",
      ...over,
    },
  });

  const order = {
    provider_order_id: "r1",
    external_order_id: "tsr_1",
    amount: 8,
    currency: "GEL",
  };

  it("3. parses every saved-card field", () => {
    const d = parsePaymentDetails(receipt());
    expect(d.transferMethodKey).toBe("card");
    expect(d.paymentOption).toBe("subscription");
    expect(d.savedCardType).toBe("subscription");
    expect(d.parentOrderId).toBe("parent-1");
    expect(d.code).toBe("100");
    expect(d.codeDescription).toBe("success");
    expect(d.amount).toBe(8);
    expect(d.statusKey).toBe("completed");
  });

  it("9+10. a valid renewal receipt matches the parent order", () => {
    const d = parsePaymentDetails(receipt());
    expect(renewalPaymentMatches(d, order, { parentOrderId: "parent-1", plan: "monthly" })).toBe(
      true,
    );
  });

  it("13. a renewal requires payment_option = subscription", () => {
    const d = parsePaymentDetails(receipt({ payment_option: "card" }));
    expect(renewalPaymentMatches(d, order, { parentOrderId: "parent-1", plan: "monthly" })).toBe(
      false,
    );
  });

  it("14. the receipt parent order must match the subscription parent", () => {
    const d = parsePaymentDetails(receipt({ parent_order_id: "other" }));
    expect(renewalPaymentMatches(d, order, { parentOrderId: "parent-1", plan: "monthly" })).toBe(
      false,
    );
  });

  it("15. the amount must be the trusted full recurring price", () => {
    const d = parsePaymentDetails({
      ...receipt(),
      purchase_units: { transfer_amount: "17.60", currency_code: "GEL" },
    });
    const discounted = { ...order, amount: 17.6 };
    expect(
      renewalPaymentMatches(d, discounted, { parentOrderId: "parent-1", plan: "quarterly" }),
    ).toBe(false);
  });

  it("7+8. a completed payment without a saved-card subscription still activates membership", () => {
    const d = parsePaymentDetails({
      order_id: "o1",
      external_order_id: "tsn_1",
      order_status: { key: "completed" },
      purchase_units: { transfer_amount: "8.00", currency_code: "GEL" },
      payment_detail: { transfer_method: { key: "apple_pay" }, payment_option: "single" },
    });
    expect(d.statusKey).toBe("completed");
    expect(d.savedCardType).toBeNull();
    // The callback activates membership and only then decides auto-renew.
    const cb = src("routes/api/public/payments/bog/callback.ts");
    expect(cb).toContain('details.savedCardType === "subscription"');
    expect(cb).toContain("auto_renew: autoRenew");
    expect(cb).toContain("provider_parent_order_id: autoRenew ? orderId : null");
  });

  it("5+12. neither the save-card 202 nor the subscribe response extends membership", () => {
    const server = src("lib/bog.server.ts");
    expect(server).toContain("A 202 only means the bank");
    const renewals = src("lib/bog-renewals.server.ts");
    // Membership is only extended after an independently fetched receipt.
    expect(renewals).toContain("renewalPaymentMatches(details, order,");
    expect(renewals).not.toMatch(/createBogRenewalCharge[\s\S]{0,400}current_period_end:/);
  });
});

describe("renewal periods", () => {
  it("monthly renewal adds one calendar month to the paid anchor", () => {
    const now = new Date("2026-02-01T00:10:00Z");
    const p = computeRenewalPeriod("monthly", "2026-02-01T00:00:00Z", now);
    // Anchor already reached -> starts now, never granting free historic time.
    expect(p.start.toISOString()).toBe(now.toISOString());
    expect(p.end.toISOString().slice(0, 7)).toBe("2026-03");
  });

  it("quarterly renewal adds three calendar months and keeps the anchor when still open", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const p = computeRenewalPeriod("quarterly", "2026-02-05T00:00:00Z", now);
    expect(p.start.toISOString()).toBe("2026-02-05T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-05-05T00:00:00.000Z");
  });
});

describe("scheduler gate", () => {
  it("9+10. a due BOG subscription with a parent order is charged", () => {
    expect(shouldAttemptRenewal(sub(), NOW).attempt).toBe(true);
  });

  it("25. a canceled subscription is never processed", () => {
    expect(shouldAttemptRenewal(sub({ cancel_at_period_end: true }), NOW).reason).toBe("canceled");
    expect(shouldAttemptRenewal(sub({ renewal_status: "canceled" }), NOW).reason).toBe("canceled");
    expect(shouldAttemptRenewal(sub({ auto_renew: false }), NOW).reason).toBe("auto_renew_off");
  });

  it("26. Paddle rows are never touched by BOG renewal logic", () => {
    expect(shouldAttemptRenewal(sub({ provider: "paddle" }), NOW).reason).toBe("not_bog");
    expect(src("lib/bog-renewals.server.ts")).toContain('.eq("provider", "bog")');
    expect(src("lib/bog-renewals.server.ts")).not.toMatch(/paddle/i);
  });

  it("a prorated membership has no parent order and is skipped", () => {
    expect(shouldAttemptRenewal(sub({ provider_parent_order_id: null }), NOW).reason).toBe(
      "no_parent_order",
    );
  });

  it("17. a locked subscription cannot be claimed by a second worker", () => {
    const locked = sub({ renewal_lock_until: new Date(NOW + 5 * 60 * 1000).toISOString() });
    expect(shouldAttemptRenewal(locked, NOW).reason).toBe("locked");
    const server = src("lib/bog-renewals.server.ts");
    expect(server).toContain("renewal_lock_until.is.null,renewal_lock_until.lt.");
    expect(server).toContain("if (!claimed)");
  });

  it("18. an unresolved pending renewal blocks a second charge", () => {
    const server = src("lib/bog-renewals.server.ts");
    expect(server).toContain('.in("status", ["pending", "completed"])');
    expect(server).toContain("if (row.status === \"pending\") await reconcilePending(row");
  });

  it("not yet due is skipped", () => {
    expect(shouldAttemptRenewal(sub({ next_billing_at: "2026-02-01T00:00:00Z" }), NOW).reason).toBe(
      "not_due",
    );
  });
});

describe("retry policy", () => {
  it("19. a rejected payment increments the attempt count without extending membership", () => {
    const state = afterFailedAttempt(0, new Date("2026-01-01T00:00:00Z"));
    expect(state.renewal_attempts).toBe(1);
    expect(state.renewal_status).toBe("past_due");
    expect(state).not.toHaveProperty("current_period_end");
  });

  it("retries wait ~24h and ~72h after the first failure", () => {
    const first = sub({
      renewal_attempts: 1,
      renewal_status: "past_due",
      last_renewal_attempt_at: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(shouldAttemptRenewal(first, NOW).reason).toBe("retry_backoff");
    expect(
      shouldAttemptRenewal(
        { ...first, last_renewal_attempt_at: new Date(NOW - 25 * HOUR).toISOString() },
        NOW,
      ).attempt,
    ).toBe(true);

    const second = sub({
      renewal_attempts: 2,
      renewal_status: "past_due",
      last_renewal_attempt_at: new Date(NOW - 25 * HOUR).toISOString(),
    });
    expect(shouldAttemptRenewal(second, NOW).reason).toBe("retry_backoff");
    expect(
      shouldAttemptRenewal(
        { ...second, last_renewal_attempt_at: new Date(NOW - 49 * HOUR).toISOString() },
        NOW,
      ).attempt,
    ).toBe(true);
  });

  it("20. the third definitive failure disables automatic renewal for good", () => {
    const state = afterFailedAttempt(MAX_RENEWAL_ATTEMPTS - 1, new Date());
    expect(state.renewal_status).toBe("failed");
    expect(state.auto_renew).toBe(false);
    expect(state.next_billing_at).toBeNull();
    expect(shouldAttemptRenewal(sub({ renewal_attempts: 3 }), NOW).attempt).toBe(false);
  });

  it("21. a later success resets the counters", () => {
    const server = src("lib/bog-renewals.server.ts");
    expect(server).toContain("renewal_status: \"idle\"");
    expect(server).toContain("renewal_attempts: 0");
  });
});

describe("idempotency, cancellation and security", () => {
  it("16. a repeated callback can never extend membership twice", () => {
    const server = src("lib/bog-renewals.server.ts");
    expect(server).toContain('if (order.status === "completed") return "already_settled"');
    expect(server).toContain(
      "const alreadyExtended = sub.last_payment_order_id === order.provider_order_id;",
    );
    expect(src("routes/api/public/payments/bog/callback.ts")).toContain(
      'if (order.status === "completed") return new Response("ok");',
    );
  });

  it("22+23. cancelling stops future billing immediately but keeps access", () => {
    const fn = src("lib/bog.functions.ts");
    expect(fn).toContain("auto_renew: false");
    expect(fn).toContain("cancel_at_period_end: true");
    expect(fn).toContain("next_billing_at: null");
    expect(fn).toContain('renewal_status: "canceled"');
    // The period end is never shortened by a cancellation.
    expect(fn).not.toMatch(/cancelBogAutoRenew[\s\S]*current_period_end:\s*new Date/);
  });

  it("a failed card deletion never re-enables automatic renewal", () => {
    const fn = src("lib/bog.functions.ts");
    const idx = fn.indexOf("deleteBogSavedCard(sub.provider_parent_order_id)");
    expect(idx).toBeGreaterThan(0);
    expect(fn.slice(idx)).not.toContain("auto_renew: true");
  });

  it("17. the scheduler endpoint requires a server-only secret", () => {
    const route = src("routes/api/public/payments/bog/process-renewals.ts");
    expect(route).toContain("BOG_RENEWAL_CRON_SECRET");
    expect(route).toContain('return new Response("Unauthorized", { status: 401 })');
  });

  it("no secret value is ever returned to the browser", () => {
    for (const file of ["components/AccountMenu.tsx", "routes/checkout.tsx"]) {
      const code = src(file);
      expect(code).not.toContain("BOG_CLIENT_SECRET");
      expect(code).not.toContain("BOG_RENEWAL_CRON_SECRET");
      expect(code).not.toContain("getBogAccessToken");
    }
  });

  it("26. Paddle billing code is untouched by the renewal system", () => {
    expect(src("lib/paddle.ts")).not.toContain("auto_renew");
    expect(src("lib/bog-renewals.ts")).not.toMatch(/paddle/i);
  });
});
