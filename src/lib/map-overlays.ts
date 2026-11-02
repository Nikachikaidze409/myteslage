// Speed cameras and EV chargers from OpenStreetMap (Overpass API).
// Loaded per ~25 km tile only for the visible area, cached in memory (and in
// sessionStorage), so the in-car browser never holds a whole country of markers.
export type OverlayKind = "cameras" | "chargers";
export interface OverlayPoint {
  id: number;
  lat: number;
  lng: number;
  kind: OverlayKind;
  /** cameras: km/h limit if tagged; chargers: operator/name */
  maxspeed?: number;
  label?: string;
}

const TILE = 0.25; // degrees
const MAX_TILES_PER_VIEW = 12;
const TIMEOUT_MS = 12000;
// Fastest/most reliable mirror first; others as fallback.
const ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const cache = new Map<string, OverlayPoint[]>();
const inflight = new Map<string, Promise<OverlayPoint[]>>();
const failedAt = new Map<string, number>();
const SS_PREFIX = "tmg:ov:";

function query(kind: OverlayKind, s: number, w: number, n: number, e: number) {
  const bb = `(${s},${w},${n},${e})`;
  const body =
    kind === "cameras"
      ? `node["highway"="speed_camera"]${bb};node["enforcement"~"maxspeed|average_speed|traffic_signals"]${bb};node["speed_camera"]${bb};`
      : `node["amenity"="charging_station"]${bb};way["amenity"="charging_station"]${bb};`;
  return `[out:json][timeout:15];(${body});out center 400;`;
}

async function fetchWithTimeout(url: string, body: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      body,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchTile(kind: OverlayKind, tx: number, ty: number): Promise<OverlayPoint[]> {
  const key = `${kind}:${tx}:${ty}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const ss = sessionStorage.getItem(SS_PREFIX + key);
    if (ss) {
      const pts = JSON.parse(ss) as OverlayPoint[];
      cache.set(key, pts);
      return pts;
    }
  } catch {}
  const running = inflight.get(key);
  if (running) return running;
  // Back off 30 s after a failure instead of hammering mirrors on every pan.
  if (Date.now() - (failedAt.get(key) ?? 0) < 30000) return [];
  const s = ty * TILE, w = tx * TILE;
  const body = "data=" + encodeURIComponent(query(kind, s, w, s + TILE, w + TILE));
  const p = (async () => {
    for (const url of ENDPOINTS) {
      try {
        const r = await fetchWithTimeout(url, body);
        if (!r.ok) continue;
        const j = await r.json();
        const seen = new Set<number>();
        const pts: OverlayPoint[] = [];
        for (const el of j.elements ?? []) {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (typeof lat !== "number" || typeof lng !== "number" || seen.has(el.id)) continue;
          seen.add(el.id);
          const t = el.tags ?? {};
          const ms = parseInt(t.maxspeed, 10);
          pts.push({
            id: el.id,
            lat,
            lng,
            kind,
            maxspeed: Number.isFinite(ms) ? ms : undefined,
            label: kind === "chargers" ? t.name || t.operator || t.brand : undefined,
          });
        }
        cache.set(key, pts);
        try { sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(pts)); } catch {}
        failedAt.delete(key);
        return pts;
      } catch {
        /* try next mirror */
      }
    }
    failedAt.set(key, Date.now());
    return [];
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function loadOverlay(
  kind: OverlayKind,
  b: { south: number; west: number; north: number; east: number },
): Promise<OverlayPoint[]> {
  const tiles: [number, number][] = [];
  for (let ty = Math.floor(b.south / TILE); ty <= Math.floor(b.north / TILE); ty++)
    for (let tx = Math.floor(b.west / TILE); tx <= Math.floor(b.east / TILE); tx++) tiles.push([tx, ty]);
  if (tiles.length > MAX_TILES_PER_VIEW) return [];
  const res = await Promise.all(tiles.map(([x, y]) => fetchTile(kind, x, y)));
  return res.flat();
}

/** Already-loaded cameras only (no network): used for the approach alert. */
export function cachedCameras(): OverlayPoint[] {
  const out: OverlayPoint[] = [];
  for (const [k, v] of cache) if (k.startsWith("cameras:")) out.push(...v);
  return out;
}
