import { describe, it, expect, vi } from "vitest";
import {
  PADDLE_PRICE_IDS,
  PROVIDER_PRICES,
  checkoutButtonLabel,
  providerPrice,
  readStoredProvider,
  startProviderCheckout,
  type CheckoutDeps,
} from "./checkout-provider";
import { isMembershipRowValid } from "./membership";

function makeDeps(overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    createBogCheckout: vi.fn(async () => ({ redirectUrl: "https://payment.bog.ge/x" })),
    initializePaddle: vi.fn(async () => {}),
    getPaddlePriceId: vi.fn(async () => "pri_123"),
    openPaddleCheckout: vi.fn(),
    assign: vi.fn(),
    origin: "https://teslanavi.online",
    ...overrides,
  };
}

describe("checkout payment provider", () => {
  it("defaults to Bank of Georgia", () => {
    expect(readStoredProvider(null)).toBe("bog");
    expect(readStoredProvider("visa")).toBe("bog");
    expect(readStoredProvider("paddle")).toBe("paddle");
    expect(readStoredProvider("bog")).toBe("bog");
  });

  it("shows GEL pricing for Bank of Georgia", () => {
    expect(providerPrice("bog", "monthly")).toBe("8 ₾");
    expect(providerPrice("bog", "quarterly")).toBe("21.60 ₾");
    expect(checkoutButtonLabel("bog", "monthly")).toBe("Pay 8 ₾ with Bank of Georgia →");
  });

  it("shows USD pricing for Paddle", () => {
    expect(providerPrice("paddle", "monthly")).toBe("$2.99");
    expect(providerPrice("paddle", "quarterly")).toBe("$7.99");
    expect(checkoutButtonLabel("paddle", "quarterly")).toBe("Pay $7.99 with Paddle →");
  });

  it("BOG checkout calls createBogCheckout with only the plan name", async () => {
    const deps = makeDeps();
    await startProviderCheckout({ provider: "bog", plan: "quarterly", userId: "u1", email: "a@b.c" }, deps);
    expect(deps.createBogCheckout).toHaveBeenCalledWith({ data: { plan: "quarterly" } });
    expect(deps.assign).toHaveBeenCalledWith("https://payment.bog.ge/x");
    expect(deps.openPaddleCheckout).not.toHaveBeenCalled();
  });

  it("the browser never sends a price to the BOG server", async () => {
    const deps = makeDeps();
    await startProviderCheckout({ provider: "bog", plan: "monthly", userId: "u1" }, deps);
    const arg = (deps.createBogCheckout as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    expect(Object.keys(arg.data)).toEqual(["plan"]);
    expect(JSON.stringify(arg)).not.toContain(PROVIDER_PRICES.bog.monthly);
  });

  it("Paddle checkout opens the Paddle overlay with the external price id", async () => {
    const deps = makeDeps();
    await startProviderCheckout({ provider: "paddle", plan: "monthly", userId: "u9", email: "a@b.c" }, deps);
    expect(deps.initializePaddle).toHaveBeenCalled();
    expect(deps.getPaddlePriceId).toHaveBeenCalledWith(PADDLE_PRICE_IDS.monthly);
    expect(deps.createBogCheckout).not.toHaveBeenCalled();
    const options = (deps.openPaddleCheckout as unknown as { mock: { calls: any[][] } }).mock.calls[0][0];
    expect(options.items).toEqual([{ priceId: "pri_123", quantity: 1 }]);
    expect(options.customData).toEqual({ userId: "u9" });
    expect(options.settings.successUrl).toBe("https://teslanavi.online/checkout/success?provider=paddle");
    expect(options.settings.displayMode).toBe("overlay");
  });
});

describe("membership access is identical across providers", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it("grants access for a live BOG membership and a live Paddle membership alike", () => {
    const bog = isMembershipRowValid(
      { status: "active", current_period_end: future, provider: "bog", environment: "live" },
      { paddleEnvironment: "live" },
    );
    const paddle = isMembershipRowValid(
      { status: "active", current_period_end: future, provider: "paddle", environment: "live" },
      { paddleEnvironment: "live" },
    );
    expect(bog).toBe(true);
    expect(paddle).toBe(true);
  });

  it("rejects sandbox rows in production", () => {
    expect(
      isMembershipRowValid(
        { status: "active", current_period_end: future, provider: "paddle", environment: "sandbox" },
        { paddleEnvironment: "live" },
      ),
    ).toBe(false);
    expect(
      isMembershipRowValid(
        { status: "active", current_period_end: future, provider: "bog", environment: "sandbox" },
        { paddleEnvironment: "live" },
      ),
    ).toBe(false);
  });
});
