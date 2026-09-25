/**
 * Market = which domain the visitor arrived on.
 *
 * tmap.ge  -> Georgian market: Georgian landing, GEL prices (8 / 21.60 / 85 ₾).
 * tmap.am  -> Armenian market: Armenian landing, AMD prices, charged as the
 *             equivalent GEL amount through Bank of Georgia (the shopper's own
 *             Armenian bank converts it back to AMD), or the USD equivalent
 *             through Paddle.
 *
 * Nothing here is ever taken from the browser: the market is derived
 * server-side from the request host and the amounts below are the only
 * amounts the checkout may ever charge.
 */

export type Market = "ge" | "am";
export type MarketPlan = "monthly" | "quarterly" | "annual";

export const AM_HOSTS = new Set(["tmap.am", "www.tmap.am"]);

/** The map, the Tesla browser session and QR pairing live on one host only. */
export const APP_MAP_URL = "https://tmap.ge/map";

export function marketFromHost(host: string | null | undefined): Market {
  if (!host) return "ge";
  const name = host.split(":")[0]!.trim().toLowerCase();
  return AM_HOSTS.has(name) ? "am" : "ge";
}

export function isMarket(value: unknown): value is Market {
  return value === "ge" || value === "am";
}

/** Trusted Bank of Georgia amounts (always charged in GEL). */
export const MARKET_BOG_AMOUNTS: Record<Market, Record<MarketPlan, number>> = {
  ge: { monthly: 8.0, quarterly: 21.6, annual: 85.0 },
  am: { monthly: 14.5, quarterly: 39.0, annual: 145.0 },
};

/** Prices shown to the shopper (display only). */
export const MARKET_BOG_LABELS: Record<Market, Record<MarketPlan, string>> = {
  ge: { monthly: "8 ₾", quarterly: "21.60 ₾", annual: "85 ₾" },
  am: { monthly: "2,099 AMD", quarterly: "5,600 AMD", annual: "20,825 AMD" },
};

export const MARKET_PADDLE_LABELS: Record<Market, Record<MarketPlan, string>> = {
  ge: { monthly: "$2.99", quarterly: "$7.99", annual: "$31.99" },
  am: { monthly: "$5.40", quarterly: "$14.40", annual: "$53.50" },
};

/** Paddle catalogue ids per market. */
export const MARKET_PADDLE_PRICE_IDS: Record<Market, Record<MarketPlan, string>> = {
  ge: {
    monthly: "tesla_map_georgia_monthly",
    quarterly: "tesla_map_georgia_quarterly",
    annual: "tesla_map_georgia_annual",
  },
  am: {
    monthly: "tmap_am_monthly",
    quarterly: "tmap_am_quarterly",
    annual: "tmap_am_annual",
  },
};

/** Armenian shoppers are told, in Armenian, exactly how the money moves. */
export const AM_CONVERSION_NOTE =
  "Վճարումն իրականացվում է Վրաստանի բանկի միջոցով՝ համարժեք 14.50 ₾ / 39 ₾ / 145 ₾ գումարով։ Ձեր բանկը այն կգանձի դրամով՝ ընթացիկ փոխարժեքով։";

export function bogAmountFor(market: Market, plan: MarketPlan): number {
  return MARKET_BOG_AMOUNTS[market][plan];
}

/** Every amount a given plan may legitimately be charged, in any market. */
export function allowedBogAmounts(plan: MarketPlan): number[] {
  return [MARKET_BOG_AMOUNTS.ge[plan], MARKET_BOG_AMOUNTS.am[plan]];
}
