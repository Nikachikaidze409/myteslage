import { describe, expect, it } from "vitest";
import { armenianRedirectTarget, legacyRedirectStatus, legacyRedirectTarget } from "./server";

const LEGACY_API_PATHS = [
  "/api/public/payments/bog/callback",
  "/api/public/payments/bog/process-renewals",
  "/api/public/payments/webhook",
];

describe("legacy domain redirect", () => {
  it("redirects the legacy homepage to the canonical domain", () => {
    expect(legacyRedirectTarget("https://teslanavi.online/")).toBe("https://tmap.ge/");
    expect(legacyRedirectStatus("GET")).toBe(301);
  });

  it("preserves path and query string on nested pages", () => {
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

  it("redirects legacy payment endpoints to the identical canonical path", () => {
    for (const path of LEGACY_API_PATHS) {
      expect(legacyRedirectTarget(`https://teslanavi.online${path}`)).toBe(`https://tmap.ge${path}`);
      expect(legacyRedirectTarget(`https://www.teslanavi.online${path}`)).toBe(
        `https://tmap.ge${path}`,
      );
    }
  });

  it("uses 308 for provider POSTs so method and body survive", () => {
    expect(legacyRedirectStatus("POST")).toBe(308);
    expect(legacyRedirectStatus("put")).toBe(308);
    expect(legacyRedirectStatus("HEAD")).toBe(301);
  });

  it("folds www of the canonical domain into the bare host", () => {
    expect(legacyRedirectTarget("https://www.tmap.ge/pricing?x=1")).toBe(
      "https://tmap.ge/pricing?x=1",
    );
  });

  it("never runs the application handler on the legacy host", async () => {
    const worker = (await import("./server")).default;
    const response = await worker.fetch(
      new Request("https://teslanavi.online/api/public/payments/bog/callback", {
        method: "POST",
        body: "{}",
      }),
      {},
      {},
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://tmap.ge/api/public/payments/bog/callback",
    );
    expect(await response.text()).toBe("");
  });

  it("leaves the canonical domain untouched", () => {
    expect(legacyRedirectTarget("https://tmap.ge/map?gpsdebug=1")).toBeNull();
    expect(legacyRedirectTarget("https://tmap.ge/")).toBeNull();
    for (const path of LEGACY_API_PATHS) {
      expect(legacyRedirectTarget(`https://tmap.ge${path}`)).toBeNull();
    }
  });
});

describe("armenian visitors on tmap.ge", () => {
  it("sends Armenian IPs on shop pages to tmap.am", () => {
    expect(armenianRedirectTarget("https://tmap.ge/pricing", "GET", "AM", null)).toBe("https://tmap.am/pricing");
    expect(armenianRedirectTarget("https://tmap.ge/hy", "GET", "AM", null)).toBe("https://tmap.am/");
  });
  it("remembers browsers that came from tmap.am", () => {
    expect(armenianRedirectTarget("https://tmap.ge/", "GET", "GE", "tmap_am=1")).toBe("https://tmap.am/");
  });
  it("keeps the map, sign-in and payment returns reachable", () => {
    for (const p of ["/map", "/auth", "/checkout/success", "/phone/x"]) {
      expect(armenianRedirectTarget(`https://tmap.ge${p}`, "GET", "AM", "tmap_am=1")).toBeNull();
    }
  });
  it("leaves Georgian visitors alone", () => {
    expect(armenianRedirectTarget("https://tmap.ge/pricing", "GET", "GE", null)).toBeNull();
  });
});
