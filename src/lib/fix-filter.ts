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

/** Max plausible speed for a car, m/s (~360 km/h) - anything above is a glitch. */
const MAX_SPEED_MS = 100;
/** Anything worse than this is treated as noise once we already have a fix. */
const MAX_ACCURACY_M = 300;

export function isPlausibleFix(prev: RawFix | null, next: RawFix): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (!prev) return true;
  if (next.accuracy > MAX_ACCURACY_M && prev.accuracy <= MAX_ACCURACY_M) return false;
  const dt = Math.max(0.2, (next.timestamp - prev.timestamp) / 1000);
  if (dt > 30) return true; // long gap - accept, we have nothing better
  const d = distanceMeters(prev, next);
  // Allow for accuracy slack so a legitimate re-fix isn't discarded.
  const slack = Math.min(120, (prev.accuracy + next.accuracy) / 2);
  return d - slack <= MAX_SPEED_MS * dt;
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
