import { describe, expect, it } from "vitest";
import { deriveSpeedKmh } from "./PhoneHud";

describe("deriveSpeedKmh", () => {
  it("uses the distance between two fixes", () => {
    const prev = { lat: 41.7151, lng: 44.8271, timestamp: 1_000 };
    // ~27.8 m east over 1 s ≈ 100 km/h
    const cur = { lat: 41.7151, lng: 44.82743, timestamp: 2_000, speed: null };
    const v = deriveSpeedKmh(prev, cur);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(70);
    expect(v!).toBeLessThan(130);
  });

  it("reads zero while standing still despite GPS jitter", () => {
    const prev = { lat: 41.7151, lng: 44.8271, timestamp: 1_000 };
    const cur = { lat: 41.715104, lng: 44.827104, timestamp: 2_000, speed: null };
    expect(deriveSpeedKmh(prev, cur)).toBe(0);
  });

  it("falls back to the browser speed on the first fix", () => {
    const cur = { lat: 41.7151, lng: 44.8271, timestamp: 2_000, speed: 10 };
    expect(deriveSpeedKmh(null, cur)).toBe(36);
  });

  it("returns null with no fix", () => {
    expect(deriveSpeedKmh(null, null)).toBeNull();
  });
});
