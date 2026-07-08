import { useEffect, useState, useCallback } from "react";

export interface SavedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  savedAt: number;
  kind?: "home" | "work" | "recent" | "favorite";
}

const RECENTS_KEY = "tsl.recents.v1";
const FAVS_KEY = "tsl.favorites.v1";

function read(key: string): SavedPlace[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as SavedPlace[];
  } catch {
    return [];
  }
}
function write(key: string, v: SavedPlace[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(`sp:${key}`));
}

function useStore(key: string) {
  const [items, setItems] = useState<SavedPlace[]>([]);
  useEffect(() => {
    setItems(read(key));
    const on = () => setItems(read(key));
    window.addEventListener(`sp:${key}`, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(`sp:${key}`, on);
      window.removeEventListener("storage", on);
    };
  }, [key]);
  return items;
}

export function useRecents() {
  return useStore(RECENTS_KEY);
}
export function useFavorites() {
  return useStore(FAVS_KEY);
}

export function pushRecent(p: Omit<SavedPlace, "id" | "savedAt" | "kind">) {
  const list = read(RECENTS_KEY).filter(
    (r) => Math.abs(r.lat - p.lat) > 1e-5 || Math.abs(r.lng - p.lng) > 1e-5,
  );
  list.unshift({
    ...p,
    id: `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
    savedAt: Date.now(),
    kind: "recent",
  });
  write(RECENTS_KEY, list.slice(0, 8));
}

export function toggleFavorite(p: Omit<SavedPlace, "id" | "savedAt" | "kind">) {
  const id = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const list = read(FAVS_KEY);
  const idx = list.findIndex((f) => f.id === id);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift({ ...p, id, savedAt: Date.now(), kind: "favorite" });
  write(FAVS_KEY, list);
}

export function setNamedFavorite(kind: "home" | "work", p: Omit<SavedPlace, "id" | "savedAt" | "kind">) {
  const list = read(FAVS_KEY).filter((f) => f.kind !== kind);
  list.unshift({
    ...p,
    id: kind,
    savedAt: Date.now(),
    kind,
  });
  write(FAVS_KEY, list);
}

export function useHomeWork() {
  const favs = useFavorites();
  return {
    home: favs.find((f) => f.kind === "home") ?? null,
    work: favs.find((f) => f.kind === "work") ?? null,
  };
}

// ---- offline route cache ----
const ROUTE_CACHE_KEY = "tsl.lastRoute.v1";
export interface CachedRoute {
  destination: { lat: number; lng: number; name: string };
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  savedAt: number;
}
export function cacheLastRoute(r: CachedRoute) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(r));
}
export function loadCachedRoute(): CachedRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROUTE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedRoute) : null;
  } catch {
    return null;
  }
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

// no-op to satisfy lint for unused useCallback import in some setups
export const _noop = useCallback;