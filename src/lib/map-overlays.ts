// Speed cameras and EV chargers from OpenStreetMap (Overpass API).
// Loaded per ~11 km tile only for the visible area, cached in memory, so the
// in-car browser never holds a whole country of markers.
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

const TILE = 0.1; // degrees
const MAX_TILES_PER_VIEW = 16;
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const cache = new Map<string, OverlayPoint[]>();
const inflight = new Map<string, Promise<OverlayPoint[]>>();

function query(kind: OverlayKind, s: number, w: number, n: number, e: number) {
  const bb = `(${s},${w},${n},${e})`;
  const body =
    kind === "cameras"
      ? `node["highway"="speed_camera"]${bb};node["enforcement"="maxspeed"]${bb};`
      : `node["amenity"="charging_station"]${bb};way["amenity"="charging_station"]${bb};`;
  return `[out:json][timeout:20];(${body});out center 200;`;
}

async function fetchTile(kind: OverlayKind, tx: number, ty: number): Promise<OverlayPoint[]> {
  const key = `${kind}:${tx}:${ty}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const running = inflight.get(key);
  if (running) return running;
  const s = ty * TILE, w = tx * TILE;
  const q = query(kind, s, w, s + TILE, w + TILE);
  const p = (async () => {
    for (const url of ENDPOINTS) {
      try {
        const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        if (!r.ok) continue;
        const j = await r.json();
        const pts: OverlayPoint[] = (j.elements ?? [])
          .map((el: any) => {
            const lat = el.lat ?? el.center?.lat;
            const lng = el.lon ?? el.center?.lon;
            if (typeof lat !== "number" || typeof lng !== "number") return null;
            const t = el.tags ?? {};
            const ms = parseInt(t.maxspeed, 10);
            return {
              id: el.id,
              lat,
              lng,
              kind,
              maxspeed: Number.isFinite(ms) ? ms : undefined,
              label: kind === "chargers" ? t.name || t.operator || t.brand : undefined,
            } as OverlayPoint;
          })
          .filter(Boolean);
        cache.set(key, pts);
        return pts;
      } catch {
        /* try next mirror */
      }
    }
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
