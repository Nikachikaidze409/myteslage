// Raw GPS -> age gate -> accuracy gate -> outlier / speed-consistency
// rejection -> smoothing -> heading -> last-reliable-position retention.
//
// This runs outside React: it holds mutable state and is read by the
// animation loop. It never triggers a render on its own.

import { angleDelta, bearing, haversine, lerpAngle, type LatLng } from "./math";

export interface RawFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  /** how old the reading was when it arrived, ms (from the tracker) */
  age?: number;
}

export interface GpsState {
  /** smoothed position */
  lat: number;
  lng: number;
  /** smoothed heading in degrees, or null while stationary and unknown */
  heading: number | null;
  /** metres per second */
  speed: number;
  accuracy: number;
  /** performance.now() of the last accepted fix */
  at: number;
  /** true when no usable fix arrived recently (tunnel, garage) */
  stale: boolean;
  /** age of the last accepted reading when it arrived, ms */
  age: number;
}

export type RejectReason =
  | null
  | "invalid"
  | "accuracy"
  | "stale"
  | "jump"
  | "speed";

/** Nothing worse than this can place a car on a street. */
const MAX_ACCURACY_M = 250;
/** No road vehicle covers this much ground per second. */
const MAX_SPEED_MPS = 75;
/** A reading older than this is not live any more. */
const MAX_AGE_MS = 4000;
/** After this long without a fix, the position is treated as stale. */
const STALE_AFTER_MS = 4000;

export class GpsEngine {
  private accepted: RawFix | null = null;
  private smooth: LatLng | null = null;
  private headingSmooth: number | null = null;
  private speedSmooth = 0;
  private acceptedAt = 0;
  private acceptedAge = 0;
  private suspect: RawFix | null = null;

  /** Why the most recent reading was dropped, for the debug panel. */
  lastReject: RejectReason = null;
  rejected = 0;

  /** Feed a device / paired-phone fix. Returns false when it was rejected. */
  ingest(fix: RawFix, now = performance.now()): boolean {
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return this.drop("invalid");
    if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return this.drop("invalid");
    if (Number.isFinite(fix.accuracy) && fix.accuracy > MAX_ACCURACY_M) return this.drop("accuracy");

    const age = fix.age ?? Math.max(0, Date.now() - fix.timestamp);
    // A cached reading must never be drawn as if it were live.
    if (age > MAX_AGE_MS) return this.drop("stale");

    const prev = this.accepted;
    if (prev) {
      const dt = Math.max(0.2, (fix.timestamp - prev.timestamp) / 1000);
      const d = haversine(prev, fix);
      const implied = d / dt;
      // Impossible jump, or a jump that contradicts the measured speed:
      // hold the previous reliable position until a second reading agrees.
      const reported = fix.speed != null && fix.speed >= 0 ? fix.speed : null;
      const inconsistent =
        reported != null && implied > Math.max(8, reported * 3 + 6) && d > 40;
      if (implied > MAX_SPEED_MPS || inconsistent) {
        const confirmed =
          this.suspect != null && haversine(this.suspect, fix) < Math.max(30, d * 0.3);
        if (!confirmed) {
          this.suspect = fix;
          return this.drop(implied > MAX_SPEED_MPS ? "jump" : "speed");
        }
      }
    }
    this.suspect = null;
    this.lastReject = null;
    this.accepted = fix;
    this.acceptedAt = now;
    this.acceptedAge = age;

    // Position smoothing: trust an accurate fix more than a vague one.
    const w = accuracyWeight(fix.accuracy);
    this.smooth = this.smooth
      ? {
          lat: this.smooth.lat + (fix.lat - this.smooth.lat) * w,
          lng: this.smooth.lng + (fix.lng - this.smooth.lng) * w,
        }
      : { lat: fix.lat, lng: fix.lng };

    // Speed: reported when available, otherwise derived from movement.
    let speed = fix.speed != null && fix.speed >= 0 ? fix.speed : NaN;
    if (!Number.isFinite(speed) && prev) {
      const dt = Math.max(0.2, (fix.timestamp - prev.timestamp) / 1000);
      speed = haversine(prev, fix) / dt;
    }
    if (!Number.isFinite(speed)) speed = 0;
    this.speedSmooth = this.speedSmooth * 0.7 + Math.min(speed, MAX_SPEED_MPS) * 0.3;

    // Heading: device course when moving, otherwise derived from the track.
    let target: number | null = null;
    if (fix.heading != null && Number.isFinite(fix.heading) && this.speedSmooth > 1) {
      target = ((fix.heading % 360) + 360) % 360;
    } else if (prev && haversine(prev, fix) > 5) {
      target = bearing(prev, fix);
    }
    if (target != null) {
      this.headingSmooth =
        this.headingSmooth == null
          ? target
          : // Snap through big genuine turns, glide through small jitter.
            lerpAngle(this.headingSmooth, target, Math.abs(angleDelta(this.headingSmooth, target)) > 60 ? 0.6 : 0.25);
    }
    return true;
  }

  private drop(reason: RejectReason): false {
    this.lastReject = reason;
    this.rejected++;
    return false;
  }

  /** Last reliable state, or null before the first accepted fix. */
  state(now = performance.now()): GpsState | null {
    const p = this.smooth;
    const raw = this.accepted;
    if (!p || !raw) return null;
    return {
      lat: p.lat,
      lng: p.lng,
      heading: this.headingSmooth,
      speed: this.speedSmooth,
      accuracy: raw.accuracy,
      at: this.acceptedAt,
      stale: now - this.acceptedAt > STALE_AFTER_MS,
      age: this.acceptedAge,
    };
  }

  /** Force the smoothed position (used after a Roads API match). */
  override(p: LatLng): void {
    this.smooth = p;
  }

  reset(): void {
    this.accepted = null;
    this.smooth = null;
    this.headingSmooth = null;
    this.speedSmooth = 0;
    this.suspect = null;
    this.lastReject = null;
  }
}

function accuracyWeight(accuracy: number): number {
  if (!Number.isFinite(accuracy)) return 0.5;
  if (accuracy <= 10) return 0.85;
  if (accuracy <= 25) return 0.6;
  if (accuracy <= 60) return 0.4;
  return 0.25;
}
