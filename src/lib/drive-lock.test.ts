import { describe, expect, it } from "vitest";
import { isParked, parseYoutubeId } from "./drive-lock";

const fix = (speed: number | null, lat = 41.7, lon = 44.8, t = 0) => ({ coords: { latitude: lat, longitude: lon, speed }, timestamp: t });

describe("YouTube drive lock", () => {
  it("allows video when the car is stopped", () => {
    expect(isParked(fix(0), null)).toBe(true);
  });
  it("blocks video when the car is moving (20 km/h)", () => {
    expect(isParked(fix(20 / 3.6), null)).toBe(false);
  });
  it("blocks video from position change when speed is unknown", () => {
    // ~111 m in 5 s ≈ 80 km/h
    expect(isParked(fix(null, 41.701, 44.8, 5000), fix(null, 41.7, 44.8, 0))).toBe(false);
  });
  it("parses YouTube links", () => {
    expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
  });
});
