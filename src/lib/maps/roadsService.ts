// Throttled Google Roads matching. Never called from the animation loop:
// the loop renders, this only refines the position every few seconds.

import { snapToRoad } from "@/lib/snap-to-road.functions";
import { haversine, type LatLng } from "./math";

const MIN_INTERVAL_MS = 3000;
const MIN_MOVE_M = 25;
/** Ignore a match that pulls the car further than this: it is a wrong road. */
const MAX_CORRECTION_M = 60;

export class RoadsMatcher {
  private lastAt = 0;
  private lastPoint: LatLng | null = null;
  private inFlight = false;

  /**
   * Ask Roads for a match when it is worth it. Resolves with the snapped
   * point, or null when the call was skipped or unusable.
   */
  async maybeSnap(p: LatLng, now = performance.now()): Promise<LatLng | null> {
    if (this.inFlight) return null;
    if (now - this.lastAt < MIN_INTERVAL_MS) return null;
    if (this.lastPoint && haversine(this.lastPoint, p) < MIN_MOVE_M) return null;

    this.inFlight = true;
    this.lastAt = now;
    this.lastPoint = p;
    try {
      const r = await snapToRoad({ data: { lat: p.lat, lng: p.lng } });
      if (!r.snapped) return null;
      const snapped = { lat: r.lat, lng: r.lng };
      if (haversine(p, snapped) > MAX_CORRECTION_M) return null;
      return snapped;
    } catch {
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  reset(): void {
    this.lastAt = 0;
    this.lastPoint = null;
  }
}
