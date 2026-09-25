/**
 * Pure checkout-provider helpers shared by the checkout UI and its tests.
 * Prices shown here are display-only — the BOG amount charged is always the
 * trusted server-side price, never a value sent from the browser.
 */

import {
  MARKET_BOG_LABELS,
  MARKET_PADDLE_LABELS,
  MARKET_PADDLE_PRICE_IDS,
  type Market,
} from "@/lib/market";

export type PaymentProvider = "bog" | "paddle";
export type Plan = "monthly" | "quarterly" | "annual";

export const PROVIDER_KEY = "tsl.payment-provider";

export const PROVIDER_PRICES: Record<PaymentProvider, Record<Plan, string>> = {
  bog: MARKET_BOG_LABELS.ge,
  paddle: MARKET_PADDLE_LABELS.ge,
};

export const PADDLE_PRICE_IDS: Record<Plan, string> = MARKET_PADDLE_PRICE_IDS.ge;

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

export function providerPrice(provider: PaymentProvider, plan: Plan, market: Market = "ge"): string {
  return provider === "bog" ? MARKET_BOG_LABELS[market][plan] : MARKET_PADDLE_LABELS[market][plan];
}

export function checkoutButtonLabel(
  provider: PaymentProvider,
  plan: Plan,
  market: Market = "ge",
): string {
  const price = providerPrice(provider, plan, market);
  return provider === "bog" ? `Pay ${price} with Bank of Georgia →` : `Pay ${price} with Paddle →`;
}

export interface CheckoutDeps {
  createBogCheckout: (args: {
    data: { plan: Plan };
  }) => Promise<{ redirectUrl: string | null; status?: string }>;
  initializePaddle: () => Promise<void>;
  getPaddlePriceId: (externalId: string) => Promise<string>;
  openPaddleCheckout: (options: Record<string, unknown>) => void;
  assign: (url: string) => void;
  origin: string;
}

/**
 * Runs the checkout for the chosen provider. BOG redirects to the bank page;
 * Paddle opens its overlay. Neither path sends a price from the browser — the
 * market only decides WHICH trusted catalogue entry is used.
 */
export async function startProviderCheckout(
  args: {
    provider: PaymentProvider;
    plan: Plan;
    userId: string;
    email?: string;
    market?: Market;
  },
  deps: CheckoutDeps,
): Promise<{ status: string }> {
  const market: Market = args.market ?? "ge";

  if (args.provider === "bog") {
    const result = await deps.createBogCheckout({ data: { plan: args.plan } });
    if (!result.redirectUrl) return { status: result.status ?? "already_active" };
    deps.assign(result.redirectUrl);
    return { status: result.status ?? "new_purchase" };
  }

  await deps.initializePaddle();
  const catalogueId = MARKET_PADDLE_PRICE_IDS[market][args.plan];
  // Armenian rows are already Paddle price ids; Georgian rows are external ids.
  const paddlePriceId = catalogueId.startsWith("pri_")
    ? catalogueId
    : await deps.getPaddlePriceId(catalogueId);
  deps.openPaddleCheckout({
    items: [{ priceId: paddlePriceId, quantity: 1 }],
    customer: args.email ? { email: args.email } : undefined,
    customData: { userId: args.userId },
    settings: {
      displayMode: "overlay",
      successUrl: `${deps.origin}/checkout/success?provider=paddle`,
      allowLogout: false,
      variant: "one-page",
    },
  });
  return { status: "new_purchase" };
}
