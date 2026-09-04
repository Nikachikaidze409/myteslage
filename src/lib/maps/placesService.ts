// Debounced, cached, de-duplicated access to Google Places / Geocoding.
// Components call this instead of the server functions directly.

import {
  autocompletePlaces,
  placeDetails,
  reverseGeocode,
  type PlaceDetail,
  type PlaceSuggestion,
} from "@/lib/search.functions";

const MAX_ENTRIES = 60;

class LruCache<T> {
  private map = new Map<string, T>();
  get(key: string): T | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}

const suggestCache = new LruCache<PlaceSuggestion[]>();
const detailCache = new LruCache<PlaceDetail>();
const geocodeCache = new LruCache<{ name: string; address: string }>();
const inFlight = new Map<string, Promise<any>>();

function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

function biasKey(origin?: { lat: number; lng: number } | null): string {
  return origin ? `${origin.lat.toFixed(2)},${origin.lng.toFixed(2)}` : "-";
}

export async function suggestPlaces(
  query: string,
  origin?: { lat: number; lng: number } | null,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = `s:${q.toLowerCase()}|${biasKey(origin)}`;
  const hit = suggestCache.get(key);
  if (hit) return hit;
  return dedupe(key, async () => {
    const res = await autocompletePlaces({
      data: { query: q, ...(origin ? { lat: origin.lat, lng: origin.lng } : {}) },
    });
    suggestCache.set(key, res.suggestions);
    return res.suggestions;
  });
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetail> {
  const key = `d:${placeId}`;
  const hit = detailCache.get(key);
  if (hit) return hit;
  return dedupe(key, async () => {
    const d = await placeDetails({ data: { placeId } });
    detailCache.set(key, d);
    return d;
  });
}

export async function addressAt(lat: number, lng: number): Promise<{ name: string; address: string }> {
  const key = `g:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = geocodeCache.get(key);
  if (hit) return hit;
  return dedupe(key, async () => {
    const r = await reverseGeocode({ data: { lat, lng } });
    geocodeCache.set(key, r);
    return r;
  });
}

export type { PlaceSuggestion, PlaceDetail };
