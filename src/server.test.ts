import { describe, expect, it } from "vitest";
import { legacyRedirectTarget } from "./server";

describe("legacy domain redirect", () => {
  it("redirects the legacy homepage to the canonical domain", () => {
    expect(legacyRedirectTarget("https://teslanavi.online/")).toBe("https://tmap.ge/");
  });

  it("preserves path and query string", () => {
    expect(legacyRedirectTarget("https://teslanavi.online/map?gpsdebug=1")).toBe(
      "https://tmap.ge/map?gpsdebug=1",
    );
    expect(legacyRedirectTarget("https://www.teslanavi.online/auth")).toBe("https://tmap.ge/auth");
  });

  it("redirects legacy browser success and failure pages", () => {
    expect(legacyRedirectTarget("https://teslanavi.online/checkout/success?provider=bog&order=x")).toBe(
      "https://tmap.ge/checkout/success?provider=bog&order=x",
    );
    expect(legacyRedirectTarget("https://teslanavi.online/checkout?payment=failed")).toBe(
      "https://tmap.ge/checkout?payment=failed",
    );
  });

  it("never redirects legacy payment endpoints", () => {
    for (const path of [
      "/api/public/payments/bog/callback",
      "/api/public/payments/bog/process-renewals",
      "/api/public/payments/webhook",
    ]) {
      expect(legacyRedirectTarget(`https://teslanavi.online${path}`)).toBeNull();
      expect(legacyRedirectTarget(`https://www.teslanavi.online${path}`)).toBeNull();
    }
  });

  it("folds www of the canonical domain into the bare host", () => {
    expect(legacyRedirectTarget("https://www.tmap.ge/pricing?x=1")).toBe(
      "https://tmap.ge/pricing?x=1",
    );
  });

  it("leaves the canonical domain untouched", () => {
    expect(legacyRedirectTarget("https://tmap.ge/map?gpsdebug=1")).toBeNull();
    expect(legacyRedirectTarget("https://tmap.ge/")).toBeNull();
  });
});
