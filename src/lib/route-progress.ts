// Pure helpers for projecting a live position onto a route polyline.
// Used for local snap-to-route, trimming the travelled part of the line,
// live remaining distance / ETA, and next-turn detection.

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Local equirectangular projection around a reference latitude (metres). */
function xy(p: LatLng, latRef: number): { x: number; y: number } {
  return {
    x: toRad(p.lng) * Math.cos(toRad(latRef)) * R,
    y: toRad(p.lat) * R,
  };
}

function fromXY(x: number, y: number, latRef: number): LatLng {
  return {
    lat: toDeg(y / R),
    lng: toDeg(x / (R * Math.cos(toRad(latRef)))),
  };
}

export interface PathIndex {
  path: LatLng[];
  /** cumulative distance in metres at each vertex */
  cum: number[];
  total: number;
}

export function buildPathIndex(path: LatLng[]): PathIndex {
  const cum: number[] = new Array(path.length).fill(0);
  for (let i = 1; i < path.length; i++) {
    const latRef = (path[i - 1].lat + path[i].lat) / 2;
    const a = xy(path[i - 1], latRef);
    const b = xy(path[i], latRef);
    cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { path, cum, total: cum[cum.length - 1] ?? 0 };
}

export interface Projection {
  /** snapped point on the polyline */
  point: LatLng;
  /** index of the segment start vertex */
  segment: number;
  /** distance travelled along the route to this point, metres */
  along: number;
  /** perpendicular distance from the raw point to the route, metres */
  offset: number;
  /** bearing of the segment, degrees clockwise from north */
  bearing: number;
}

/**
 * Project `p` onto the polyline. When `nearAlong` is provided, only segments
 * within `window` metres of that along-distance are searched, which keeps
 * per-frame cost tiny and avoids snapping to a later part of a looping route.
 */
export function projectOnPath(
  p: LatLng,
  idx: PathIndex,
  nearAlong?: number,
  window = 400,
): Projection | null {
  const { path, cum } = idx;
  if (path.length < 2) return null;

  let start = 0;
  let end = path.length - 1;
  if (nearAlong != null) {
    while (start < path.length - 1 && cum[start + 1] < nearAlong - window) start++;
    end = start;
    while (end < path.length - 1 && cum[end] < nearAlong + window) end++;
  }

  let best: Projection | null = null;
  for (let i = start; i < end; i++) {
    const a = path[i];
    const b = path[i + 1];
    const latRef = (a.lat + b.lat) / 2;
    const A = xy(a, latRef);
    const B = xy(b, latRef);
    const P = xy(p, latRef);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = A.x + t * dx;
    const cy = A.y + t * dy;
    const off = Math.hypot(P.x - cx, P.y - cy);
    if (best && off >= best.offset) continue;
    const segLen = Math.sqrt(len2);
    best = {
      point: fromXY(cx, cy, latRef),
      segment: i,
      along: cum[i] + segLen * t,
      offset: off,
      bearing: bearingBetween(a, b),
    };
  }
  return best;
}

export function bearingBetween(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at `along` metres from the route start. */
export function pointAtAlong(idx: PathIndex, along: number): LatLng {
  const { path, cum } = idx;
  if (path.length === 0) return { lat: 0, lng: 0 };
  const clamped = Math.max(0, Math.min(idx.total, along));
  let i = 0;
  while (i < path.length - 2 && cum[i + 1] < clamped) i++;
  const segLen = cum[i + 1] - cum[i];
  const t = segLen === 0 ? 0 : (clamped - cum[i]) / segLen;
  const a = path[i];
  const b = path[i + 1] ?? a;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Remaining path from a projection to the end of the route. */
export function remainingPath(idx: PathIndex, proj: Projection): LatLng[] {
  return [proj.point, ...idx.path.slice(proj.segment + 1)];
}

export function remainingMeters(idx: PathIndex, proj: Projection): number {
  return Math.max(0, idx.total - proj.along);
}
