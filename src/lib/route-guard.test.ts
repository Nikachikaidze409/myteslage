import { describe, it, expect } from "vitest";
import {
  validateRouteInput,
  normalizeRouteFingerprint,
  rateLimitMessage,
  parseRateLimit,
  isValidPurpose,
  MAX_WAYPOINTS,
} from "./route-guard";
import {
  canAttempt,
  needsManualRetry,
  registerInitialFailure,
  registerRerouteFailure,
  resetRetry,
} from "./route-retry";

const ORIGIN = { lat: 41.7151, lng: 44.8271 };
const DEST = { lat: 41.6938, lng: 44.8015 };

describe("route guard validation", () => {
  it("accepts a normal request and defaults the purpose", () => {
    const v = validateRouteInput({ origin: ORIGIN, destination: DEST });
    expect(v.purpose).toBe("user");
  });

  it("rejects non-finite and out-of-range coordinates", () => {
    expect(() => validateRouteInput({ origin: { lat: NaN, lng: 1 }, destination: DEST })).toThrow();
    expect(() => validateRouteInput({ origin: { lat: 95, lng: 1 }, destination: DEST })).toThrow();
    expect(() => validateRouteInput({ origin: ORIGIN, destination: { lat: 0, lng: 999 } })).toThrow();
  });

  it("rejects unknown purposes", () => {
    expect(isValidPurpose("bulk")).toBe(false);
    expect(() =>
      validateRouteInput({ origin: ORIGIN, destination: DEST, purpose: "bulk" }),
    ).toThrow();
  });

  it("caps waypoints", () => {
    const many = Array.from({ length: MAX_WAYPOINTS + 1 }, () => ORIGIN);
    expect(() =>
      validateRouteInput({ origin: ORIGIN, destination: DEST, waypoints: many }),
    ).toThrow();
  });

  it("drops unsupported avoid options", () => {
    const v = validateRouteInput({
      origin: ORIGIN,
      destination: DEST,
      avoid: ["highways", "tolls"],
    });
    expect(v.avoid).toEqual(["highways"]);
  });
});

describe("route fingerprint", () => {
  const base = validateRouteInput({ origin: ORIGIN, destination: DEST, purpose: "reroute" });

  it("is identical for the same physical request", () => {
    const again = validateRouteInput({ origin: ORIGIN, destination: DEST, purpose: "reroute" });
    expect(normalizeRouteFingerprint(again)).toBe(normalizeRouteFingerprint(base));
  });

  it("ignores sub-10m origin jitter but not a new destination", () => {
    const jitter = validateRouteInput({
      origin: { lat: ORIGIN.lat + 0.00002, lng: ORIGIN.lng },
      destination: DEST,
      purpose: "reroute",
    });
    expect(normalizeRouteFingerprint(jitter)).toBe(normalizeRouteFingerprint(base));

    const other = validateRouteInput({
      origin: ORIGIN,
      destination: { lat: 41.5, lng: 44.9 },
      purpose: "reroute",
    });
    expect(normalizeRouteFingerprint(other)).not.toBe(normalizeRouteFingerprint(base));
  });

  it("separates purposes", () => {
    const user = validateRouteInput({ origin: ORIGIN, destination: DEST, purpose: "user" });
    expect(normalizeRouteFingerprint(user)).not.toBe(normalizeRouteFingerprint(base));
  });
});

describe("rate limit signalling", () => {
  it("round-trips the retry delay", () => {
    expect(parseRateLimit(rateLimitMessage(12_000))).toEqual({ retryAfterMs: 12_000 });
  });
  it("ignores unrelated errors", () => {
    expect(parseRateLimit("Routes API failed [500]")).toBeNull();
  });
});

describe("initial route retry policy", () => {
  it("allows the first attempt immediately", () => {
    expect(canAttempt(resetRetry(), 1_000)).toBe(true);
  });

  it("backs off 5s then 15s then stops automatic retries", () => {
    let s = registerInitialFailure(resetRetry(), 0);
    expect(canAttempt(s, 4_999)).toBe(false);
    expect(canAttempt(s, 5_000)).toBe(true);
    s = registerInitialFailure(s, 5_000);
    expect(canAttempt(s, 19_999)).toBe(false);
    expect(canAttempt(s, 20_000)).toBe(true);
    s = registerInitialFailure(s, 20_000);
    expect(canAttempt(s, 10_000_000)).toBe(false);
    expect(needsManualRetry(s)).toBe(true);
  });

  it("a manual retry clears the failure state", () => {
    let s = registerInitialFailure(registerInitialFailure(registerInitialFailure(resetRetry(), 0), 1), 2);
    expect(needsManualRetry(s)).toBe(true);
    s = resetRetry();
    expect(canAttempt(s, 2)).toBe(true);
    expect(needsManualRetry(s)).toBe(false);
  });

  it("honours a server retry-after longer than our own backoff", () => {
    const s = registerInitialFailure(resetRetry(), 0, 30_000);
    expect(canAttempt(s, 29_999)).toBe(false);
    expect(canAttempt(s, 30_000)).toBe(true);
  });
});

describe("reroute retry policy", () => {
  it("never delays the first reroute", () => {
    expect(canAttempt(resetRetry(), 0)).toBe(true);
  });

  it("backs off 3s, 10s, then 30s and stays at 30s", () => {
    let s = registerRerouteFailure(resetRetry(), 0);
    expect(canAttempt(s, 2_999)).toBe(false);
    expect(canAttempt(s, 3_000)).toBe(true);
    s = registerRerouteFailure(s, 3_000);
    expect(canAttempt(s, 13_000)).toBe(true);
    s = registerRerouteFailure(s, 13_000);
    expect(canAttempt(s, 42_999)).toBe(false);
    s = registerRerouteFailure(s, 43_000);
    expect(canAttempt(s, 72_999)).toBe(false);
    expect(canAttempt(s, 73_000)).toBe(true);
  });

  it("caps a persistent failure to at most ~20 Google calls per hour", () => {
    let s = resetRetry();
    let now = 0;
    let calls = 0;
    while (now <= 3_600_000) {
      if (canAttempt(s, now)) {
        calls += 1;
        s = registerRerouteFailure(s, now);
      }
      now += 1_000; // one GPS fix per second
    }
    expect(calls).toBeLessThanOrEqual(125);
  });

  it("a successful route resets the backoff", () => {
    const failed = registerRerouteFailure(registerRerouteFailure(resetRetry(), 0), 3_000);
    expect(canAttempt(failed, 4_000)).toBe(false);
    expect(canAttempt(resetRetry(), 4_000)).toBe(true);
  });
});
