/**
 * Pure checkout-provider helpers shared by the checkout UI and its tests.
 * Prices shown here are display-only — the BOG amount charged is always the
 * trusted server-side price, never a value sent from the browser.
 */

export type PaymentProvider = "bog" | "paddle";
export type Plan = "monthly" | "quarterly";

export const PROVIDER_KEY = "tsl.payment-provider";

export const PROVIDER_PRICES: Record<PaymentProvider, Record<Plan, string>> = {
  bog: { monthly: "8 ₾", quarterly: "21.60 ₾" },
  paddle: { monthly: "$2.99", quarterly: "$7.99" },
};

export const PADDLE_PRICE_IDS: Record<Plan, string> = {
  monthly: "tesla_map_georgia_monthly",
  quarterly: "tesla_map_georgia_quarterly",
};

export const PROVIDER_LABELS: Record<PaymentProvider, { label: string; sublabel: string }> = {
  bog: { label: "Bank of Georgia", sublabel: "Pay in GEL" },
  paddle: { label: "Paddle", sublabel: "International payment" },
};

export const PROVIDER_NOTES: Record<PaymentProvider, string> = {
  bog: "Payment is processed securely by Bank of Georgia in GEL.",
  paddle:
    "Payment is processed securely by Paddle. Your bank may convert the charge to your local currency.",
};

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return value === "bog" || value === "paddle";
}

/** Defaults to Bank of Georgia when nothing valid is stored. */
export function readStoredProvider(raw: string | null | undefined): PaymentProvider {
  return isPaymentProvider(raw) ? raw : "bog";
}

export function providerPrice(provider: PaymentProvider, plan: Plan): string {
  return PROVIDER_PRICES[provider][plan];
}

export function checkoutButtonLabel(provider: PaymentProvider, plan: Plan): string {
  const price = providerPrice(provider, plan);
  return provider === "bog" ? `Pay ${price} with Bank of Georgia →` : `Pay ${price} with Paddle →`;
}
