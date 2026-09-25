import { describe, expect, it } from "vitest";
import {
  MARKET_BOG_LABELS,
  MARKET_PADDLE_PRICE_IDS,
  allowedBogAmounts,
  bogAmountFor,
  marketFromHost,
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
    expect(bogAmountFor("am", "monthly")).toBe(14.5);
    expect(bogAmountFor("am", "quarterly")).toBe(39);
    expect(bogAmountFor("am", "annual")).toBe(145);
  });

  it("leaves Georgian prices untouched", () => {
    expect(bogAmountFor("ge", "monthly")).toBe(8);
    expect(bogAmountFor("ge", "quarterly")).toBe(21.6);
    expect(bogAmountFor("ge", "annual")).toBe(85);
    expect(providerPrice("bog", "monthly")).toBe("8 ₾");
    expect(checkoutButtonLabel("bog", "monthly")).toBe("Pay 8 ₾ with Bank of Georgia →");
  });

  it("shows AMD to Armenian shoppers", () => {
    expect(MARKET_BOG_LABELS.am.annual).toBe("20,825 AMD");
    expect(providerPrice("bog", "monthly", "am")).toBe("2,099 AMD");
    expect(providerPrice("paddle", "annual", "am")).toBe("$53.50");
  });

  it("uses Paddle price ids directly for the Armenian catalogue", () => {
    for (const id of Object.values(MARKET_PADDLE_PRICE_IDS.am)) {
      expect(id.startsWith("pri_")).toBe(true);
    }
  });
});

describe("recurring safety", () => {
  it("accepts both markets' full prices as renewal parents", () => {
    expect(allowedBogAmounts("annual")).toEqual([85, 145]);
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
    expect(legacyRedirectTarget("https://tmap.am/map")).toBe("https://tmap.ge/map");
    expect(legacyRedirectTarget("https://tmap.am/phone?code=1")).toBe("https://tmap.ge/phone?code=1");
  });

  it("leaves the Armenian landing and checkout in place", () => {
    expect(legacyRedirectTarget("https://tmap.am/")).toBeNull();
    expect(legacyRedirectTarget("https://tmap.am/checkout")).toBeNull();
  });
});
