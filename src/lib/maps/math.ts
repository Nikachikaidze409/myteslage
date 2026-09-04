// Small, allocation-free helpers used by the animation loop.

export const EARTH_R = 6371000;
export const toRad = (d: number) => (d * Math.PI) / 180;
export const toDeg = (r: number) => (r * 180) / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Signed shortest angular difference, always within (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/** Interpolate an angle the short way around, so 359 -> 1 crosses north. */
export function lerpAngle(from: number, to: number, t: number): number {
  return (from + angleDelta(from, to) * t + 360) % 360;
}

/**
 * Frame-rate independent exponential smoothing.
 * `tau` is the time constant in seconds: larger = softer.
 */
export function dampFactor(tau: number, dt: number): number {
  if (tau <= 0) return 1;
  return 1 - Math.exp(-dt / tau);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `metres` from `p` along `bearing` degrees. */
export function offsetLatLng(p: LatLng, bearing: number, metres: number): LatLng {
  if (metres === 0) return p;
  const br = toRad(bearing);
  const dLat = (metres * Math.cos(br)) / EARTH_R;
  const dLng = (metres * Math.sin(br)) / (EARTH_R * Math.cos(toRad(p.lat)));
  return { lat: p.lat + toDeg(dLat), lng: p.lng + toDeg(dLng) };
}

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export function bearing(a: LatLng, b: LatLng): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dl = toRad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
