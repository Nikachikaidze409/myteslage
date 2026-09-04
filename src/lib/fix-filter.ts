// Rejects impossible / low-quality GPS fixes and derives heading from motion
// when the device does not report one.

import { distanceMeters } from "@/lib/geo";

export interface RawFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

/** Anything worse than this cannot place a car on a street. */
const MAX_ACCURACY_M = 300;

/**
 * Only clearly unusable fixes are dropped. Everything the device reports is
 * trusted, exactly like the Google Maps app does.
 */
export function isPlausibleFix(_prev: RawFix | null, next: RawFix): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return false;
  if (Number.isFinite(next.accuracy) && next.accuracy > MAX_ACCURACY_M) return false;
  return true;
}



/** Heading from the device, or derived from movement when it's missing. */
export function resolveHeading(prev: RawFix | null, next: RawFix): number | null {
  if (next.heading != null && Number.isFinite(next.heading)) return next.heading;
  if (!prev) return null;
  const d = distanceMeters(prev, next);
  if (d < 4) return null; // too small to be a reliable bearing
  const toRad = (v: number) => (v * Math.PI) / 180;
  const φ1 = toRad(prev.lat);
  const φ2 = toRad(next.lat);
  const Δλ = toRad(next.lng - prev.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
