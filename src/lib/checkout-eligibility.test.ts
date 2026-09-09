import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  PLAN_PRICES_GEL,
  computeMonthlyToQuarterlyProration,
  decideCheckoutEligibility,
  isPayableStatus,
  planFromProductId,
  roundMoney,
  type SubscriptionRecord,
} from "./checkout-eligibility";
import { computePeriodEnd } from "./bog.server";
import { paymentMatchesOrder } from "./bog.server";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const NOW = Date.parse("2026-03-15T12:00:00Z");

function sub(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: "sub-1",
    status: "active",
    provider: "bog",
    environment: "live",
    product_id: "tesla_map_georgia_monthly",
    current_period_start: "2026-03-01T12:00:00Z",
    current_period_end: "2026-04-01T12:00:00Z",
    ...overrides,
  };
}

const baseInput = {
  subscriptions: [] as SubscriptionRecord[],
  pendingOrders: [],
  now: NOW,
  paddleEnvironment: "live" as const,
};

describe("duplicate purchase protection", () => {
  it("1. active monthly + monthly purchase => no new checkout", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "monthly",
      subscriptions: [sub()],
    });
    expect(result.status).toBe("already_active");
    expect(isPayableStatus(result.status)).toBe(false);
    expect(result.validUntil).toBe("2026-04-01T12:00:00Z");
  });

  it("2. active quarterly + quarterly purchase => no new checkout", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      subscriptions: [sub({ product_id: "tesla_map_georgia_quarterly" })],
    });
    expect(result.status).toBe("already_active");
  });

  it("3. active quarterly + monthly purchase => no charge, longer plan kept", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "monthly",
      subscriptions: [sub({ product_id: "tesla_map_georgia_quarterly" })],
    });
    expect(result.status).toBe("higher_plan_active");
    expect(isPayableStatus(result.status)).toBe(false);
  });

  it("4. expired membership => full normal price, new purchase", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      subscriptions: [sub({ current_period_end: "2026-03-01T12:00:00Z" })],
    });
    expect(result.status).toBe("new_purchase");
    expect(PLAN_PRICES_GEL.quarterly).toBe(21.6);
    expect(PLAN_PRICES_GEL.monthly).toBe(8);
  });
});

describe("monthly -> quarterly proration", () => {
  it("5. computes the unused fraction from exact timestamps", () => {
    const p = computeMonthlyToQuarterlyProration({
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-11T00:00:00Z",
      now: Date.parse("2026-03-08T00:00:00Z"),
    });
    expect(p.unusedFraction).toBeCloseTo(0.3, 6);
  });

  it("6. 50% remaining on monthly => 4.00 GEL credit", () => {
    const p = computeMonthlyToQuarterlyProration({
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-31T00:00:00Z",
      now: Date.parse("2026-03-16T00:00:00Z"),
    });
    expect(p.creditAmount).toBe(4);
  });

  it("7. that example charges 17.60 GEL", () => {
    const p = computeMonthlyToQuarterlyProration({
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-31T00:00:00Z",
      now: Date.parse("2026-03-16T00:00:00Z"),
    });
    expect(p.baseAmount).toBe(21.6);
    expect(p.finalAmount).toBe(17.6);
  });

  it("8. zero remaining => full 21.60 GEL", () => {
    const p = computeMonthlyToQuarterlyProration({
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-31T00:00:00Z",
      now: Date.parse("2026-04-05T00:00:00Z"),
    });
    expect(p.creditAmount).toBe(0);
    expect(p.finalAmount).toBe(21.6);
  });

  it("9. nearly full remaining never creates a negative amount", () => {
    const p = computeMonthlyToQuarterlyProration({
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-31T00:00:00Z",
      now: Date.parse("2026-03-01T00:00:01Z"),
    });
    expect(p.creditAmount).toBeLessThanOrEqual(PLAN_PRICES_GEL.monthly);
    expect(p.finalAmount).toBeGreaterThanOrEqual(0);
    expect(p.finalAmount).toBeCloseTo(13.6, 2);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("exposes the upgrade as a payable, server-priced state", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      now: Date.parse("2026-03-16T12:00:00Z"),
      subscriptions: [
        sub({
          current_period_start: "2026-03-01T12:00:00Z",
          current_period_end: "2026-03-31T12:00:00Z",
        }),
      ],
    });
    expect(result.status).toBe("upgrade_prorated");
    expect(result.creditAmount).toBe(4);
    expect(result.finalAmount).toBe(17.6);
    expect(result.upgradeFromSubscriptionId).toBe("sub-1");
    expect(isPayableStatus(result.status)).toBe(true);
  });
});

describe("client cannot influence pricing", () => {
  const functions = src("lib/bog.functions.ts");

  it("10. the checkout input accepts only a plan name", () => {
    expect(functions).toContain(
      'planSchema = z.object({ plan: z.enum(["monthly", "quarterly"]) })',
    );
    expect(functions).not.toMatch(/data\.(credit|creditAmount|discount)/);
  });

  it("11. the charged amount comes from server-side eligibility only", () => {
    expect(functions).toContain(
      'resolveEligibility(context, { provider: "bog", plan: data.plan })',
    );
    expect(functions).not.toMatch(/data\.(amount|finalAmount|baseAmount)/);
  });
});

describe("callback verification and upgrade period", () => {
  it("12. verifies the prorated final amount, not the list price", () => {
    const order = {
      provider_order_id: "o1",
      external_order_id: "x1",
      amount: 17.6,
      currency: "GEL",
    };
    const details = {
      orderId: "o1",
      externalOrderId: "x1",
      statusKey: "completed",
      currency: "GEL",
    };
    expect(paymentMatchesOrder({ ...details, amount: 21.6 }, order)).toBe(false);
    expect(paymentMatchesOrder({ ...details, amount: 17.6 }, order)).toBe(true);
  });

  it("13. a successful upgrade starts a fresh 3-month period from completion", () => {
    const start = new Date("2026-03-16T12:00:00Z");
    expect(computePeriodEnd("quarterly", start).toISOString()).toBe("2026-06-16T12:00:00.000Z");
  });

  it("14. old unused days are not added again after being credited", () => {
    const callback = src("routes/api/public/payments/bog/callback.ts");
    expect(callback).toContain("monthly_to_quarterly_proration");
    expect(callback).toContain('status: "canceled", current_period_end: start.toISOString()');
    expect(callback).toContain("upgrade_from_subscription_id");
  });

  it("20. payment history remains intact after an upgrade", () => {
    const callback = src("routes/api/public/payments/bog/callback.ts");
    expect(callback).not.toMatch(/from\("payment_orders"\)[\s\S]{0,40}\.delete\(\)/);
  });
});

describe("race protection", () => {
  it("15. a recent pending checkout blocks a second payment", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      pendingOrders: [
        {
          id: "p1",
          plan: "quarterly",
          provider: "bog",
          created_at: "2026-03-15T11:55:00Z",
          pricing_reason: "standard",
        },
      ],
    });
    expect(result.status).toBe("payment_in_progress");
  });

  it("16. the pending reservation is created before the bank order", () => {
    const functions = src("lib/bog.functions.ts");
    const reserveAt = functions.indexOf('.from("payment_orders")');
    const bankAt = functions.indexOf("createBogOrder(");
    expect(reserveAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeLessThan(bankAt);
    expect(functions).toContain('reserveError.code === "23505"');
  });

  it("an abandoned pending checkout stops blocking after the TTL", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      pendingOrders: [
        {
          id: "p1",
          plan: "quarterly",
          provider: "bog",
          created_at: "2026-03-15T10:00:00Z",
          pricing_reason: "standard",
        },
      ],
    });
    expect(result.status).toBe("new_purchase");
  });
});

describe("cross-provider safety", () => {
  it("17. active BOG access blocks an accidental Paddle purchase", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "paddle",
      plan: "monthly",
      subscriptions: [sub()],
    });
    expect(result.status).toBe("provider_switch_blocked");
    expect(result.validUntil).toBe("2026-04-01T12:00:00Z");
  });

  it("18. active Paddle access blocks an accidental BOG purchase", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      subscriptions: [
        sub({ provider: "paddle", environment: "live", product_id: "tesla_map_georgia_quarterly" }),
      ],
    });
    expect(result.status).toBe("provider_switch_blocked");
  });

  it("19. cross-provider credit is never invented", () => {
    const result = decideCheckoutEligibility({
      ...baseInput,
      provider: "bog",
      plan: "quarterly",
      subscriptions: [sub({ provider: "paddle", environment: "live" })],
    });
    expect(result.creditAmount).toBeUndefined();
    expect(result.finalAmount).toBeUndefined();
  });

  it("maps product ids to plans", () => {
    expect(planFromProductId("tesla_map_georgia_monthly")).toBe("monthly");
    expect(planFromProductId("tesla_map_georgia_quarterly")).toBe("quarterly");
    expect(planFromProductId(null)).toBeNull();
  });
});
