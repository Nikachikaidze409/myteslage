import { describe, expect, it } from "vitest";
import {
  MARKET_BOG_LABELS,
  MARKET_PADDLE_PRICE_IDS,
  allowedBogAmounts,
  bogAmountFor,
  bogAmountForRequest,
  marketFromHost,
  MARKET_BOG_AMOUNTS,
  offeredPlans,
  isPlanOffered,
} from "./market";
import { checkoutButtonLabel, providerPrice } from "./checkout-provider";
import { canBeAutoRenewParent } from "./bog.server";
import { legacyRedirectTarget } from "../server";

describe("market detection", () => {
  it("treats the Armenian domain as the Armenian market", () => {
    expect(marketFromHost("tmap.am")).toBe("am");
    expect(marketFromHost("www.tmap.am")).toBe("am");
    expect(marketFromHost("TMAP.AM:443")).toBe("am");
  });

  it("keeps every other host Georgian", () => {
    expect(marketFromHost("tmap.ge")).toBe("ge");
    expect(marketFromHost("localhost:8080")).toBe("ge");
    expect(marketFromHost(null)).toBe("ge");
  });
});

describe("market pricing", () => {
  it("charges the trusted GEL equivalent for Armenian shoppers", () => {
    expect(bogAmountFor("am", "monthly")).toBe(11.5);
    expect(bogAmountFor("am", "quarterly")).toBe(31);
    expect(bogAmountFor("am", "annual")).toBe(116);
  });

  it("leaves Georgian prices untouched", () => {
    expect(bogAmountFor("ge", "monthly")).toBe(8);
    expect(bogAmountFor("ge", "quarterly")).toBe(21.6);
    expect(bogAmountFor("ge", "annual")).toBe(85);
    expect(providerPrice("bog", "monthly")).toBe("8 ₾");
    expect(checkoutButtonLabel("bog", "monthly")).toBe("Pay 8 ₾ with Bank of Georgia →");
  });

  it("shows AMD to Armenian shoppers", () => {
    expect(MARKET_BOG_LABELS.am.annual).toBe("16,741 AMD");
    expect(providerPrice("bog", "monthly", "am")).toBe("1,674 AMD");
    expect(providerPrice("paddle", "annual", "am")).toBe("$53.50");
  });

  it("uses Paddle price ids directly for the Armenian catalogue", () => {
    for (const [plan, id] of Object.entries(MARKET_PADDLE_PRICE_IDS.am)) {
      if (plan === "semiannual") continue; // Georgia-only plan, never sold in Armenia
      expect(id.startsWith("pri_")).toBe(true);
    }
  });
});

describe("recurring safety", () => {
  it("accepts both markets' full prices as renewal parents", () => {
    expect(allowedBogAmounts("annual")).toEqual([85, 116, 104, 145, 155]);
  });

  it("charges the Russian storefront 15 / 42 / 155 GEL", () => {
    const c = "a=1; tmap_lang=ru";
    expect(bogAmountForRequest("ge", c, "monthly")).toBe(15);
    expect(bogAmountForRequest("ge", c, "quarterly")).toBe(42);
    expect(bogAmountForRequest("ge", c, "annual")).toBe(155);
    expect(bogAmountForRequest("ge", "tmap_lang=ka", "monthly")).toBe(8);
    expect(bogAmountForRequest("am", c, "monthly")).toBe(11.5);
    expect(canBeAutoRenewParent("standard", 116, "annual")).toBe(true);
    expect(canBeAutoRenewParent("standard", 145, "annual")).toBe(true);
    expect(canBeAutoRenewParent("standard", 85, "annual")).toBe(true);
  });

  it("still refuses discounted or prorated amounts", () => {
    expect(canBeAutoRenewParent("standard", 17.6, "annual")).toBe(false);
    expect(canBeAutoRenewParent("monthly_to_quarterly_proration", 145, "annual")).toBe(false);
  });
});

describe("host routing", () => {
  it("folds www.tmap.am into tmap.am", () => {
    expect(legacyRedirectTarget("https://www.tmap.am/pricing")).toBe("https://tmap.am/pricing");
  });

  it("sends the map and pairing to the canonical host", () => {
    expect(legacyRedirectTarget("https://tmap.am/map")).toBe("https://tmap.ge/map?from=am");
    expect(legacyRedirectTarget("https://tmap.am/phone?code=1")).toBe("https://tmap.ge/phone?code=1&from=am");
  });

  it("leaves the Armenian landing and checkout in place", () => {
    expect(legacyRedirectTarget("https://tmap.am/")).toBeNull();
    expect(legacyRedirectTarget("https://tmap.am/checkout")).toBeNull();
  });
});

describe("Georgian plan line-up (temporary)", () => {
  it("Georgia sells only 3 months, 6 months and 1 year", () => {
    expect(offeredPlans("ge", false)).toEqual(["quarterly", "semiannual", "annual"]);
  });
  it("6 months costs 39 GEL, 3 months 21.60, 1 year 85", () => {
    expect(MARKET_BOG_AMOUNTS.ge.semiannual).toBe(39);
    expect(MARKET_BOG_AMOUNTS.ge.quarterly).toBe(21.6);
    expect(MARKET_BOG_AMOUNTS.ge.annual).toBe(85);
  });
  it("Georgian monthly checkout is refused, other markets keep monthly", () => {
    expect(isPlanOffered("ge", "", "monthly")).toBe(false);
    expect(isPlanOffered("ge", "tmap_lang=ru", "monthly")).toBe(true);
    expect(isPlanOffered("am", "", "monthly")).toBe(true);
    expect(isPlanOffered("az", "tmap_market=az", "semiannual")).toBe(false);
  });
});
