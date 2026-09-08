// Route matching and off-route decisions.
//
// This is the navigation *decision* engine: it runs only when a GPS fix is
// accepted, never inside the animation loop. It answers three questions:
//
//   1. which part of the route is the car actually on?
//   2. is the car making forward progress?
//   3. has the driver genuinely left the route (or missed a turn)?
//
// Two independent reroute detectors live here:
//
//   A) FAST MISSED MANEUVER — geometry based. Arms shortly before a real turn
//      and fires on the first fix that crosses the maneuver point while the
//      movement direction rejects the outgoing road. It never waits for a
//      lateral distance threshold.
//   B) GENERIC OFF-ROUTE — noise resistant. Needs several consecutive credible
//      readings spanning over a second before it will confirm.
//
// Matching is candidate-scored, not nearest-point: geometry alone picks the
// wrong road on parallel carriageways, ramps, bridges and self-crossing
// routes, and makes the car look like it is driving backwards.

import {
  buildPathIndex,
  bearingBetween,
  pointAtAlong,
  type PathIndex,
  type Projection,
} from "@/lib/route-progress";
import { decodePolyline } from "@/lib/geo";
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
  /** Why the verdict came out this way — development telemetry only. */
  reason: string;
}

export interface FixInput {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number;
  accuracy: number;
}

interface ArmedManeuver {
  step: number;
  instruction: string;
  /** along-distance of the maneuver point */
  endAlong: number;
  point: LatLng;
  /** bearing of the road arriving at the maneuver */
  inBearing: number;
  /** bearing of the road leaving the maneuver */
  outBearing: number;
  turn: number;
}

const MIN_HEADING_SPEED = 1.5;
/** Never let the threshold drop below this or GPS noise reroutes constantly. */
const MIN_OFF_ROUTE_M = 10;
const MAX_OFF_ROUTE_M = 35;
/** Consecutive credible readings needed to confirm a generic deviation. */
const STRIKES_TO_CONFIRM = 3;
/** …and the evidence must span at least this long. */
const CONFIRM_SPAN_MS = 1200;
/** Right after a reroute the car needs a moment to settle on the new line. */
const STABILISE_MS = 2500;
/** The deviation must exceed the reported accuracy by this factor to count. */
const ACCURACY_MARGIN = 1.1;

/** Maneuver detector arms this close to the turn. */
const ARM_DISTANCE_M = 30;
/** Below this the route does not really change direction: no turn to miss. */
const MIN_TURN_DEG = 28;
/** Sample distance used to read the road bearings around a maneuver. */
const GEOMETRY_SAMPLE_M = 12;
/** Movement must disagree with the outgoing road by more than this. */
const REJECT_OUTGOING_DEG = 50;
/** …and agree within this to count the turn as taken. */
const ACCEPT_OUTGOING_DEG = 45;

/** Re-arming generic off-route needs this many clean fixes. */
const REACQUIRE_HITS = 2;
/** A gap longer than this means the GPS dropped out. */
const GPS_GAP_MS = 4000;
/** The same physical special event may not fire twice within these bounds. */
const SAME_EVENT_M = 12;
const SAME_EVENT_MS = 15000;
/** Fast path: only very trustworthy fixes may skip the 3-strike evidence. */
const STRONG_ACCURACY_M = 10;
const STRONG_MIN_SPEED = 2;
/** How far beyond the adaptive limit a deviation must be to count as strong. */
const STRONG_OFFSET_FACTOR = 1.6;
const STRONG_ACCURACY_FACTOR = 3;
const STRONG_STRIKES = 2;
const STRONG_SPAN_MS = 500;
/** Track heading needs at least this much movement to be meaningful. */
const TRACK_HEADING_MIN_M = 3;

export class RouteProgressEngine {
  private index: PathIndex | null = null;
  private steps: StepBoundary[] = [];
  private state: MatchState | null = null;
  private reverseHits = 0;
  private strikes = 0;
  private firstStrikeAt = 0;
  private strongStrikes = 0;
  private firstStrongAt = 0;
  private lastOffset = 0;
  private routeSetAt = 0;
  private log: string[] = [];
  private lastLogged = "";

  /** Generic off-route rearm gate: one deviation event = one Google reroute. */
  private genericArmed = true;
  private reacquireHits = 0;

  private armed: ArmedManeuver | null = null;
  private lastFixAt = 0;
  private lastPos: LatLng | null = null;
  private recovering = false;
  private lastSpecial: { point: LatLng; at: number; kind: string } | null = null;
  private uTurnFired = false;

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
    steps: { instruction: string; distanceMeters: number; polyline?: string }[] = [],
    now = performance.now(),
  ): void {
    this.index = path && path.length > 1 ? buildPathIndex(path) : null;
    this.state = null;
    this.reverseHits = 0;
    this.strikes = 0;
    this.firstStrikeAt = 0;
    this.lastOffset = 0;
    this.routeSetAt = now;
    this.steps = [];
    this.armed = null;
    this.uTurnFired = false;
    // A brand new line has not been reacquired yet; generic rerouting stays
    // disarmed until the car is demonstrably following it.
    this.genericArmed = true;
    this.reacquireHits = 0;
    if (this.index && steps.length) {
      this.steps = buildStepBoundaries(this.index, steps);
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

    // ---- GPS gap handling ------------------------------------------------
    // A blackout must never itself produce a reroute: the first fix back is
    // treated as recovery only, and stale evidence is dropped.
    const gap = this.lastFixAt ? now - this.lastFixAt : 0;
    const recovered = this.lastFixAt > 0 && gap > GPS_GAP_MS;
    if (recovered) {
      this.strikes = 0;
      this.firstStrikeAt = 0;
      this.strongStrikes = 0;
      this.firstStrongAt = 0;
      this.reverseHits = 0;
      this.armed = null;
      this.lastPos = null;
      this.recovering = true;
      this.note(`GPS recovered after ${Math.round(gap / 1000)} s — evidence reset`);
    }
    const isRecoveryFix = this.recovering;
    this.lastFixAt = now;

    const trackHeading = this.trackHeading(p);
    this.lastPos = p;

    const best = this.bestCandidate(p, fix, useHeading, prev);
    if (!best) return null;

    let along = best.along;
    let direction: MatchState["direction"] = "forward";
    let uTurn = false;

    if (prev) {
      const delta = along - prev.along;
      if (delta < -5) {
        // Going backwards is real only with a matching heading reversal seen
        // more than once; otherwise it is a mis-match and we hold position.
        const dirHeading = trackHeading ?? (useHeading ? fix.heading! : null);
        const reversed = dirHeading != null && Math.abs(angleDelta(dirHeading, best.bearing)) > 120;
        if (reversed) this.reverseHits++;
        else this.reverseHits = 0;
        if (this.reverseHits >= 2) {
          direction = "backward";
          uTurn = true;
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
        this.uTurnFired = false;
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

    const verdict = this.judge(match, fix, p, trackHeading, uTurn, isRecoveryFix, now);
    if (isRecoveryFix) this.recovering = false;
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
    this.firstStrikeAt = 0;
    this.armed = null;
    this.strongStrikes = 0;
    this.firstStrongAt = 0;
    this.genericArmed = false;
    this.reacquireHits = 0;
  }

  /**
   * A reroute REQUEST failed (network error, no route, UI timeout). No new
   * geometry arrived, so the car is still off the old line: we must not
   * pretend the episode was resolved. Only the in-flight evidence is cleared;
   * detection stays armed so fresh persistent evidence can try again.
   */
  markRerouteFailed(now = performance.now()): void {
    this.strikes = 0;
    this.firstStrikeAt = 0;
    this.strongStrikes = 0;
    this.firstStrongAt = 0;
    this.reacquireHits = 0;
    this.genericArmed = true;
    // Suppress an instant retry on the very next fix without disarming.
    this.routeSetAt = now;
    this.note("Reroute request failed — detection re-armed, awaiting fresh evidence");
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

  private trackHeading(p: LatLng): number | null {
    const prev = this.lastPos;
    if (!prev) return null;
    if (haversine(prev, p) < TRACK_HEADING_MIN_M) return null;
    return bearingBetween(prev, p);
  }

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

  // ---- detector A: fast missed maneuver ----------------------------------

  /** Read the physical turn geometry around a maneuver from the route line. */
  private maneuverGeometry(b: StepBoundary): ArmedManeuver | null {
    const idx = this.index;
    if (!idx) return null;
    const end = b.endAlong;
    if (end <= GEOMETRY_SAMPLE_M || end >= idx.total - 1) return null;
    const point = pointAtAlong(idx, end);
    const before = pointAtAlong(idx, Math.max(0, end - GEOMETRY_SAMPLE_M));
    const after = pointAtAlong(idx, Math.min(idx.total, end + GEOMETRY_SAMPLE_M));
    if (haversine(before, point) < 2 || haversine(point, after) < 2) return null;
    const inBearing = bearingBetween(before, point);
    const outBearing = bearingBetween(point, after);
    const turn = Math.abs(angleDelta(inBearing, outBearing));
    if (turn < MIN_TURN_DEG) return null;
    return {
      step: b.index,
      instruction: b.instruction,
      endAlong: end,
      point,
      inBearing,
      outBearing,
      turn,
    };
  }

  /** Arm the detector when a real turn comes into range. */
  private armManeuver(along: number): void {
    if (this.armed) return;
    const next = this.steps.find((b) => b.endAlong > along - 5);
    if (!next) return;
    if (next.endAlong - along > ARM_DISTANCE_M) return;
    const geo = this.maneuverGeometry(next);
    if (!geo) return;
    this.armed = geo;
    this.note(
      `Maneuver armed — step ${geo.step}, ${Math.round(geo.turn)}° turn in ${Math.round(next.endAlong - along)} m`,
    );
  }

  /**
   * Has the car driven past the armed maneuver point, measured as a signed
   * projection along the incoming road direction?
   */
  private crossedManeuver(p: LatLng, m: ArmedManeuver, accuracy: number): boolean {
    const margin = Math.min(6, Math.max(2, accuracy * 0.25));
    const d = haversine(m.point, p);
    if (d < margin) return false;
    const brg = bearingBetween(m.point, p);
    // Component of the displacement along the incoming direction.
    const forward = d * Math.cos((angleDelta(m.inBearing, brg) * Math.PI) / 180);
    return forward > margin;
  }

  private sameSpecialEvent(point: LatLng, now: number): boolean {
    const last = this.lastSpecial;
    if (!last) return false;
    return now - last.at < SAME_EVENT_MS && haversine(last.point, point) < SAME_EVENT_M;
  }

  // ---- verdict -----------------------------------------------------------

  private judge(
    match: MatchState,
    fix: FixInput,
    rawPos: LatLng,
    trackHeading: number | null,
    uTurn: boolean,
    isRecoveryFix: boolean,
    now: number,
  ): OffRouteVerdict {
    // Sensitive, but scaled by how much we can trust this fix and how fast
    // the car is moving (a metre of lateral error means less at 100 km/h).
    const threshold = Math.min(
      MAX_OFF_ROUTE_M,
      Math.max(MIN_OFF_ROUTE_M, fix.accuracy * 1.2, fix.speed * 0.6),
    );

    const base = {
      offRoute: false,
      maneuverMissed: false,
      threshold,
      strikes: this.strikes,
    };

    if (isRecoveryFix) {
      return { ...base, strikes: 0, reason: "gps-recovery" };
    }

    // Movement direction: the track between consecutive fixes reacts to a
    // real corner immediately, while browser course can lag badly.
    const moveHeading =
      trackHeading ?? (fix.heading != null && fix.speed >= MIN_HEADING_SPEED ? fix.heading : null);

    // ---- A) missed maneuver — evaluated first and never suppressed by the
    // post-reroute stabilisation window.
    this.armManeuver(match.along);
    const armed = this.armed;
    if (armed) {
      // Well past the maneuver and still on the line: the turn was taken.
      if (match.along > armed.endAlong + 20 && match.offset < threshold) {
        this.note(`Maneuver at step ${armed.step} cleared`);
        this.armed = null;
      } else if (this.crossedManeuver(rawPos, armed, fix.accuracy)) {
        const outDiff =
          moveHeading != null ? Math.abs(angleDelta(moveHeading, armed.outBearing)) : null;
        const inDiff =
          moveHeading != null ? Math.abs(angleDelta(moveHeading, armed.inBearing)) : null;
        // Scale to the turn itself so shallow but genuine forks and ramps are
        // still detected, without lowering MIN_TURN_DEG globally: on a 30°
        // fork, driving straight on disagrees with the ramp by ~30°.
        const rejectLimit = Math.min(REJECT_OUTGOING_DEG, Math.max(20, armed.turn * 0.7));
        const acceptLimit = Math.min(ACCEPT_OUTGOING_DEG, Math.max(15, armed.turn * 0.5));
        const rejects =
          outDiff != null &&
          inDiff != null &&
          outDiff > rejectLimit &&
          // The movement must fit the road we did NOT take better than the
          // one we should have, and the car must really be off the line.
          outDiff > inDiff + 10 &&
          match.offset > Math.max(8, fix.accuracy);
        const took = outDiff != null && outDiff <= acceptLimit;
        if (took) {
          this.note(`Maneuver at step ${armed.step} taken correctly`);
          this.armed = null;
        } else if (rejects) {
          if (this.sameSpecialEvent(armed.point, now)) {
            this.armed = null;
            return { ...base, reason: "awaiting-route-reacquire" };
          }
          this.lastSpecial = { point: armed.point, at: now, kind: "maneuver-missed" };
          this.armed = null;
          this.strikes = 0;
          this.firstStrikeAt = 0;
          this.genericArmed = false;
          this.reacquireHits = 0;
          this.note(
            `MANEUVER MISSED at step ${armed.step} — moving ${Math.round(moveHeading!)}° vs expected ${Math.round(armed.outBearing)}°`,
          );
          return { ...base, offRoute: true, maneuverMissed: true, reason: "maneuver-missed" };
        }
      }
    }

    // ---- U-turn: consecutive reverse evidence already confirmed upstream.
    if (uTurn && !this.uTurnFired && !this.sameSpecialEvent(rawPos, now)) {
      this.uTurnFired = true;
      this.lastSpecial = { point: rawPos, at: now, kind: "u-turn" };
      this.strikes = 0;
      this.firstStrikeAt = 0;
      this.genericArmed = false;
      this.reacquireHits = 0;
      this.note("U-turn confirmed — rerouting immediately");
      return { ...base, offRoute: true, reason: "u-turn" };
    }

    // ---- B) generic off-route ------------------------------------------
    // An error ellipse that already covers the route line cannot prove a
    // deviation: a 50 m accuracy fix 25 m off the line is just drift.
    const credible = match.offset > fix.accuracy * ACCURACY_MARGIN;
    // The deviation must persist or grow; a random sideways jump that snaps
    // back on the next reading is noise, not a departure.
    const sustained = match.offset >= this.lastOffset - 2;
    const stabilising = now - this.routeSetAt < STABILISE_MS;
    const onRoute = match.offset < threshold * 0.7;
    const prevOffset = this.lastOffset;
    this.lastOffset = match.offset;

    // One deviation event = one Google reroute. Generic rerouting stays
    // disarmed until the car is demonstrably back on the active line.
    if (!this.genericArmed) {
      if (onRoute && match.confidence > 0.4) {
        this.reacquireHits++;
        if (this.reacquireHits >= REACQUIRE_HITS) {
          this.genericArmed = true;
          this.reacquireHits = 0;
          this.strikes = 0;
          this.firstStrikeAt = 0;
          this.note("Route reacquired — generic off-route re-armed");
          return { ...base, strikes: 0, reason: "on-route" };
        }
      } else {
        this.reacquireHits = 0;
      }
      return { ...base, strikes: 0, reason: "awaiting-route-reacquire" };
    }

    const deviating = match.offset > threshold && credible && sustained && !stabilising;

    // Fast path: a clean fix, a moving car and a deviation far beyond any
    // plausible GPS error is not noise. Two such fixes are enough. Ambiguous
    // deviations still go the conservative route below.
    const strongEvidence =
      deviating &&
      fix.accuracy <= STRONG_ACCURACY_M &&
      fix.speed >= STRONG_MIN_SPEED &&
      match.offset > Math.max(threshold * STRONG_OFFSET_FACTOR, fix.accuracy * STRONG_ACCURACY_FACTOR) &&
      // Geometry has to agree: the gap is opening, or we are simply not
      // pointing along this road any more.
      (match.offset > prevOffset + 1 ||
        (moveHeading != null && Math.abs(angleDelta(moveHeading, match.routeBearing)) > 35));

    if (deviating) {
      if (!this.strikes) this.firstStrikeAt = now;
      this.strikes++;
    } else if (onRoute) {
      if (this.strikes) this.note(`Back on route — deviation ${Math.round(match.offset)} m`);
      this.strikes = 0;
      this.firstStrikeAt = 0;
    }
    if (strongEvidence) {
      if (!this.strongStrikes) this.firstStrongAt = now;
      this.strongStrikes++;
    } else {
      this.strongStrikes = 0;
      this.firstStrongAt = 0;
    }

    const span = this.firstStrikeAt ? now - this.firstStrikeAt : 0;
    const strongSpan = this.firstStrongAt ? now - this.firstStrongAt : 0;
    const strongConfirmed =
      this.strongStrikes >= STRONG_STRIKES && strongSpan >= STRONG_SPAN_MS;
    const confirmed =
      strongConfirmed || (this.strikes >= STRIKES_TO_CONFIRM && span >= CONFIRM_SPAN_MS);

    if (confirmed) {
      this.note(
        strongConfirmed
          ? `OFF_ROUTE confirmed fast — ${Math.round(match.offset)} m at ±${Math.round(fix.accuracy)} m over ${Math.round(strongSpan)} ms`
          : `OFF_ROUTE confirmed — ${this.strikes} readings ≥ ${Math.round(threshold)} m over ${Math.round(span)} ms`,
      );
      this.strikes = 0;
      this.firstStrikeAt = 0;
      this.strongStrikes = 0;
      this.firstStrongAt = 0;
      this.genericArmed = false;
      this.reacquireHits = 0;
      return {
        ...base,
        offRoute: true,
        strikes: 0,
        reason: strongConfirmed ? "off-route-strong" : "off-route-confirmed",
      };
    }

    const reason = !credible && match.offset > threshold
      ? "low-accuracy"
      : stabilising && match.offset > threshold
        ? "stabilising"
        : this.strikes > 0
          ? "pending-confirmation"
          : "on-route";
    if (match.offset > 6 && this.strikes > 0) {
      this.note(
        `Continuing current route — deviation ${Math.round(match.offset)} m (limit ${Math.round(threshold)} m, strike ${this.strikes}/${STRIKES_TO_CONFIRM})`,
      );
    }
    return { ...base, strikes: this.strikes, reason };
  }

  private note(line: string): void {
    if (line === this.lastLogged) return;
    this.lastLogged = line;
    this.log.push(line);
    if (this.log.length > 30) this.log.shift();
    if (import.meta.env?.DEV) console.debug("[nav]", line);
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

/**
 * Exact maneuver positions from step geometry.
 *
 * Each Routes API step carries its own polyline; its last point IS the
 * maneuver point. Projecting that point onto the full route index gives a
 * real along-distance instead of a distance-scaled guess. Steps are walked in
 * order and each search starts at the previous maneuver, so a self-crossing
 * route cannot snap a later turn onto an earlier passage of the same road.
 * When a step polyline is missing or lands nowhere near the route we fall
 * back to the old cumulative-distance estimate. No API calls are involved.
 */
function buildStepBoundaries(
  idx: PathIndex,
  steps: { instruction: string; distanceMeters: number; polyline?: string }[],
): StepBoundary[] {
  const declared = steps.reduce((s, x) => s + (x.distanceMeters || 0), 0);
  const scale = declared > 0 ? idx.total / declared : 0;
  const out: StepBoundary[] = [];
  let acc = 0;
  let prevAlong = 0;
  steps.forEach((s, i) => {
    acc += (s.distanceMeters || 0) * scale;
    const geo = stepEndAlong(idx, s.polyline, prevAlong);
    let endAlong = geo ?? acc;
    endAlong = Math.min(idx.total, Math.max(endAlong, prevAlong + 1));
    out.push({ index: i, instruction: s.instruction, endAlong });
    prevAlong = endAlong;
  });
  return out;
}

/** Along-distance of a step polyline's last point, or null if unusable. */
function stepEndAlong(idx: PathIndex, encoded: string | undefined, fromAlong: number): number | null {
  if (!encoded) return null;
  let pts: LatLng[];
  try {
    pts = decodePolyline(encoded);
  } catch {
    return null;
  }
  if (!pts.length) return null;
  const end = pts[pts.length - 1];
  const { path, cum } = idx;
  let lo = 0;
  while (lo < path.length - 2 && cum[lo + 1] < fromAlong - 5) lo++;
  let bestAlong: number | null = null;
  let bestOffset = Infinity;
  for (let i = lo; i < path.length - 1; i++) {
    const seg = projectSegment(end, path[i], path[i + 1]);
    if (!seg) continue;
    if (seg.offset < bestOffset) {
      bestOffset = seg.offset;
      bestAlong = cum[i] + seg.t * (cum[i + 1] - cum[i]);
      // Close enough to be the real maneuver point: stop at the first match
      // going forward rather than a later, equally close crossing.
      if (bestOffset < 1) break;
    }
  }
  // A step end that is nowhere near the route line is not trustworthy.
  if (bestAlong == null || bestOffset > 25) return null;
  return bestAlong;
}
