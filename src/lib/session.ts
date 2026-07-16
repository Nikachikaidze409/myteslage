// Persistent nav session - restored on browser reopen (e.g. after Tesla reverse).
import type { AvoidOption } from "@/lib/routes.functions";

const KEY = "tsl.session.v1";
const TTL_MS = 2 * 60 * 60 * 1000; // 2h

export interface NavSession {
  version: 1;
  savedAt: number;
  destination: { lat: number; lng: number; name: string } | null;
  avoid: AvoidOption[];
  waypoints: { lat: number; lng: number; name: string }[];
  navigating: boolean;
}

export function saveSession(s: Omit<NavSession, "version" | "savedAt">) {
  if (typeof window === "undefined") return;
  if (!s.destination) {
    clearSession();
    return;
  }
  try {
    const payload: NavSession = { ...s, version: 1, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadSession(): NavSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as NavSession;
    if (s.version !== 1) return null;
    if (Date.now() - s.savedAt > TTL_MS) {
      clearSession();
      return null;
    }
    if (!s.destination) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
