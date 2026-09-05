// Route matching and off-route decisions.
//
// This is the navigation *decision* engine: it runs only when a GPS fix is
// accepted, never inside the animation loop. It answers three questions:
//
//   1. which part of the route is the car actually on?
//   2. is the car making forward progress?
//   3. has the driver genuinely left the route (or missed a turn)?
//
// Matching is candidate-scored, not nearest-point: geometry alone picks the
// wrong road on parallel carriageways, ramps, bridges and self-crossing
// routes, and makes the car look like it is driving backwards.

import { buildPathIndex, bearingBetween, type PathIndex, type Projection } from "@/lib/route-progress";
import { angleDelta, haversine, type LatLng } from "./math";

export interface StepBoundary {
  index: number;
  instruction: string;
  /** along-distance of the maneuver that ends this step, metres */
  endAlong: number;
}

export interface MatchState {
  segment: number;
  step: number;
  along: number;
  prevAlong: number;
  offset: number;
  routeBearing: number;
  headingDiff: number;
  direction: "forward" | "backward" | "stalled";
  confidence: number;
  point: LatLng;
}

export interface OffRouteVerdict {
  offRoute: boolean;
  maneuverMissed: boolean;
  threshold: number;
  strikes: number;
}

export interface FixInput {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number;
  accuracy: number;
}

const MIN_HEADING_SPEED = 1.5;
/** Never let the threshold drop below this or GPS noise reroutes constantly. */
const MIN_OFF_ROUTE_M = 12;
const MAX_OFF_ROUTE_M = 35;
/** Consecutive credible readings needed to confirm a deviation. */
const STRIKES_TO_CONFIRM = 2;
/** Right after a reroute the car needs a moment to settle on the new line. */
const STABILISE_MS = 8000;

export class RouteProgressEngine {
  private index: PathIndex | null = null;
  private steps: StepBoundary[] = [];
  private state: MatchState | null = null;
  private reverseHits = 0;
  private strikes = 0;
  private lastOffset = 0;
  private routeSetAt = 0;
  private log: string[] = [];
  private lastLogged = "";

  get pathIndex(): PathIndex | null {
    return this.index;
  }

  get match(): MatchState | null {
    return this.state;
  }

  get stepBoundaries(): StepBoundary[] {
    return this.steps;
  }

  get logLines(): string[] {
    return this.log;
  }

  /** Rebuild geometry. Always resets progress: a new route is a new world. */
  setRoute(
    path: LatLng[] | null,
    steps: { instruction: string; distanceMeters: number }[] = [],
    now = performance.now(),
  ): void {
    this.index = path && path.length > 1 ? buildPathIndex(path) : null;
    this.state = null;
    this.reverseHits = 0;
    this.strikes = 0;
    this.lastOffset = 0;
    this.routeSetAt = now;
    this.steps = [];
    if (this.index && steps.length) {
      const declared = steps.reduce((s, x) => s + (x.distanceMeters || 0), 0);
      const scale = declared > 0 ? this.index.total / declared : 0;
      let acc = 0;
      steps.forEach((s, i) => {
        acc += (s.distanceMeters || 0) * scale;
        this.steps.push({ index: i, instruction: s.instruction, endAlong: acc });
      });
    }
    this.note(path ? "Route set — progress reset" : "Route cleared");
  }

  /** Progress the match with a fresh fix. Returns null without a route. */
  update(fix: FixInput, now = performance.now()): { match: MatchState; verdict: OffRouteVerdict } | null {
    const idx = this.index;
    if (!idx) return null;
    const p: LatLng = { lat: fix.lat, lng: fix.lng };
    const prev = this.state;
    const useHeading = fix.heading != null && fix.speed >= MIN_HEADING_SPEED;

    const best = this.bestCandidate(p, fix, useHeading, prev);
    if (!best) return null;

    let along = best.along;
    let direction: MatchState["direction"] = "forward";

    if (prev) {
      const delta = along - prev.along;
      if (delta < -5) {
        // Going backwards is real only with a matching heading reversal seen
        // more than once; otherwise it is a mis-match and we hold position.
        const reversed = useHeading && Math.abs(angleDelta(fix.heading!, best.bearing)) > 120;
        if (reversed) this.reverseHits++;
        else this.reverseHits = 0;
        if (this.reverseHits >= 2) {
          direction = "backward";
          this.note(`Backward movement accepted (U-turn) at ${Math.round(along)} m`);
        } else {
          this.note(
            `Rejecting segment ${best.segment} — would move ${Math.round(-delta)} m backwards`,
          );
          along = prev.along;
          best.segment = prev.segment;
          best.point = prev.point;
          best.bearing = prev.routeBearing;
        }
      } else {
        this.reverseHits = 0;
        if (delta < 1) direction = "stalled";
      }
    }

    const headingDiff = useHeading ? Math.abs(angleDelta(fix.heading!, best.bearing)) : 0;
    const confidence = clamp01(
      (1 - Math.min(1, best.offset / 60)) * (1 - Math.min(1, headingDiff / 180) * 0.6),
    );

    const match: MatchState = {
      segment: best.segment,
      step: this.stepAt(along),
      along,
      prevAlong: prev?.along ?? along,
      offset: best.offset,
      routeBearing: best.bearing,
      headingDiff,
      direction,
      confidence,
      point: best.point,
    };
    this.state = match;

    const verdict = this.judge(match, fix, now);
    return { match, verdict };
  }

  /** The projection shape the renderer and ETA code already understand. */
  projection(): Projection | null {
    const s = this.state;
    if (!s) return null;
    return {
      point: s.point,
      segment: s.segment,
      along: s.along,
      offset: s.offset,
      bearing: s.routeBearing,
    };
  }

  /** Called after a reroute so a fresh line is not judged too harshly. */
  markRerouted(now = performance.now()): void {
    this.routeSetAt = now;
    this.strikes = 0;
  }

  nextManeuver(): { instruction: string; distance: number; step: number } | null {
    const s = this.state;
    if (!s || !this.steps.length) return null;
    const step = this.steps.find((b) => b.endAlong > s.along) ?? this.steps[this.steps.length - 1];
    return {
      instruction: step.instruction,
      distance: Math.max(0, step.endAlong - s.along),
      step: step.index,
    };
  }

  // ---- internals ---------------------------------------------------------

  private bestCandidate(
    p: LatLng,
    fix: FixInput,
    useHeading: boolean,
    prev: MatchState | null,
  ): { segment: number; along: number; offset: number; bearing: number; point: LatLng } | null {
    const idx = this.index!;
    const { path, cum } = idx;

    // Search window: everything on a fresh match, a local window afterwards
    // so a nearby earlier part of the route can never steal the car.
    let lo = 0;
    let hi = path.length - 1;
    if (prev && prev.confidence > 0.15) {
      const forward = Math.max(120, fix.speed * 12 + 120);
      const back = 60;
      lo = 0;
      while (lo < path.length - 1 && cum[lo + 1] < prev.along - back) lo++;
      hi = lo;
      while (hi < path.length - 1 && cum[hi] < prev.along + forward) hi++;
    }

    let best: { segment: number; along: number; offset: number; bearing: number; point: LatLng } | null =
      null;
    let bestScore = Infinity;

    for (let i = lo; i < hi; i++) {
      const a = path[i];
      const b = path[i + 1];
      const seg = projectSegment(p, a, b);
      if (!seg) continue;
      const segBearing = bearingBetween(a, b);
      const along = cum[i] + seg.t * (cum[i + 1] - cum[i]);

      let score = seg.offset;
      if (useHeading) {
        // A 90 degree mismatch is as bad as being 30 m away: that is what
        // separates a frontage road or the opposite carriageway.
        score += (Math.abs(angleDelta(fix.heading!, segBearing)) / 90) * 30;
      }
      if (prev) {
        const delta = along - prev.along;
        if (delta < 0) score += 40 + Math.min(150, -delta * 1.5);
        else score += Math.min(30, delta * 0.02);
        score += Math.min(20, Math.abs(i - prev.segment) * 0.5);
      }
      if (score < bestScore) {
        bestScore = score;
        best = {
          segment: i,
          along,
          offset: seg.offset,
          bearing: segBearing,
          point: seg.point,
        };
      }
    }
    return best;
  }

  private stepAt(along: number): number {
    if (!this.steps.length) return 0;
    for (const b of this.steps) if (along < b.endAlong) return b.index;
    return this.steps[this.steps.length - 1].index;
  }

  private judge(match: MatchState, fix: FixInput, now: number): OffRouteVerdict {
    // Sensitive, but scaled by how much we can trust this fix and how fast
    // the car is moving (a metre of lateral error means less at 100 km/h).
    const threshold = Math.min(
      MAX_OFF_ROUTE_M,
      Math.max(MIN_OFF_ROUTE_M, fix.accuracy * 1.2, fix.speed * 0.6),
    );
    const credible = fix.accuracy < match.offset;
    const growing = match.offset >= this.lastOffset - 2;
    const stabilising = now - this.routeSetAt < STABILISE_MS;
    const needed = stabilising ? STRIKES_TO_CONFIRM + 1 : STRIKES_TO_CONFIRM;

    // Missed maneuver: the car went past the turn and is drifting away from
    // the line the route expected it to follow.
    const man = this.nextManeuver();
    const passedManeuver =
      !!man && man.distance < 5 && match.offset > threshold && match.headingDiff > 45;

    if (match.offset > threshold && credible && growing) {
      this.strikes++;
    } else if (match.offset < threshold * 0.7) {
      if (this.strikes) this.note(`Back on route — deviation ${Math.round(match.offset)} m`);
      this.strikes = 0;
    }
    this.lastOffset = match.offset;

    const confirmed = passedManeuver ? this.strikes >= 1 : this.strikes >= needed;
    if (confirmed) {
      this.note(
        passedManeuver
          ? `Maneuver missed at step ${man!.step} — ${Math.round(match.offset)} m off route`
          : `OFF_ROUTE confirmed — ${this.strikes} readings ≥ ${Math.round(threshold)} m`,
      );
    } else if (match.offset > 6) {
      this.note(
        `Continuing current route — deviation ${Math.round(match.offset)} m (limit ${Math.round(threshold)} m)`,
      );
    }

    return { offRoute: confirmed, maneuverMissed: passedManeuver, threshold, strikes: this.strikes };
  }

  private note(line: string): void {
    if (line === this.lastLogged) return;
    this.lastLogged = line;
    this.log.push(line);
    if (this.log.length > 30) this.log.shift();
    if (import.meta.env.DEV) console.debug("[nav]", line);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Project onto one segment; returns the closest point, offset and t. */
function projectSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): { point: LatLng; offset: number; t: number } | null {
  const latRef = (a.lat + b.lat) / 2;
  const kx = Math.cos((latRef * Math.PI) / 180) * 111320;
  const ky = 110540;
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;
  const px = p.lng * kx;
  const py = p.lat * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { point: a, offset: haversine(p, a), t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return {
    point: { lat: cy / ky, lng: cx / kx },
    offset: Math.hypot(px - cx, py - cy),
    t,
  };
}
