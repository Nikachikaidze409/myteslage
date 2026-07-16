import { decodePolyline } from "@/lib/geo";

// Distance from point p to segment ab, in meters (equirectangular approx - accurate enough at road scale)
function pointToSegmentMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const latMid = toRad((a.lat + b.lat) / 2);
  const ax = toRad(a.lng) * Math.cos(latMid) * R;
  const ay = toRad(a.lat) * R;
  const bx = toRad(b.lng) * Math.cos(latMid) * R;
  const by = toRad(b.lat) * R;
  const px = toRad(p.lng) * Math.cos(latMid) * R;
  const py = toRad(p.lat) * R;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function distanceToPolylineMeters(
  p: { lat: number; lng: number },
  encoded: string,
): number {
  const path = decodePolyline(encoded);
  if (path.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentMeters(p, path[i], path[i + 1]);
    if (d < min) min = d;
  }
  return min;
}