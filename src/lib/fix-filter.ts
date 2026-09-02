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

/** Max plausible speed for a car, m/s (~200 km/h) - anything above is a glitch. */
const MAX_SPEED_MS = 55;
/** Anything worse than this is treated as noise once we already have a fix. */
const MAX_ACCURACY_M = 150;

/** A big unexplained jump must repeat before we believe it. */
let pendingJump: RawFix | null = null;

export function isPlausibleFix(prev: RawFix | null, next: RawFix): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (!prev) return true;
  // A sudden collapse in quality is noise, not movement.
  if (next.accuracy > MAX_ACCURACY_M && prev.accuracy <= MAX_ACCURACY_M) return false;
  if (next.accuracy > prev.accuracy * 4 && next.accuracy > 60) return false;
  const dt = Math.max(0.2, (next.timestamp - prev.timestamp) / 1000);
  if (dt > 30) {
    pendingJump = null;
    return true; // long gap - accept, we have nothing better
  }
  const d = distanceMeters(prev, next);
  // Small accuracy slack only, so a noisy fix can't shift the car a block away.
  const slack = Math.min(30, (prev.accuracy + next.accuracy) / 4);
  if (d - slack <= MAX_SPEED_MS * dt) {
    pendingJump = null;
    return true;
  }
  // Implausible jump: accept only if the next fix confirms roughly the same spot.
  if (pendingJump && distanceMeters(pendingJump, next) < 60) {
    pendingJump = null;
    return true;
  }
  pendingJump = next;
  return false;
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
