/** Speed above which video is blocked (km/h). */
export const DRIVE_LOCK_KMH = 3;

type Pos = { coords: { latitude: number; longitude: number; speed: number | null }; timestamp: number };

/** Returns km/h from the fix's own speed, or from the distance to the previous fix. */
export function speedKmh(p: Pos, prev: Pos | null): number {
  if (p.coords.speed != null && !Number.isNaN(p.coords.speed)) return p.coords.speed * 3.6;
  if (!prev) return 0;
  const dt = (p.timestamp - prev.timestamp) / 1000;
  if (dt <= 0) return 0;
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (p.coords.latitude - prev.coords.latitude) * toR;
  const dLon = (p.coords.longitude - prev.coords.longitude) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.coords.latitude * toR) * Math.cos(p.coords.latitude * toR) * Math.sin(dLon / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(a));
  return (m / dt) * 3.6;
}

export function isParked(p: Pos, prev: Pos | null): boolean {
  return speedKmh(p, prev) <= DRIVE_LOCK_KMH;
}

export function parseYoutubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? m[1]! : null;
}
