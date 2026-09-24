// Pure, dependency-free helpers for the server-side Google Routes cost guard.
// Kept separate from the database code so they can be unit tested directly.

export type GuardPurpose = "user" | "reroute" | "traffic";

export const GUARD_PURPOSES: GuardPurpose[] = ["user", "reroute", "traffic"];

/** The structured error the client recognises as "slow down, keep your route". */
export const RATE_LIMIT_CODE = "ROUTE_RATE_LIMITED";

export const MAX_WAYPOINTS = 10;

export interface GuardLatLng {
  lat: number;
  lng: number;
}

export interface GuardRouteInput {
  origin: GuardLatLng;
  destination: GuardLatLng;
  waypoints?: GuardLatLng[];
  avoid?: string[];
  avoidUnpaved?: boolean;
  purpose?: string;
}

export function isValidPurpose(value: unknown): value is GuardPurpose {
  return typeof value === "string" && (GUARD_PURPOSES as string[]).includes(value);
}

function validCoord(p: unknown): p is GuardLatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p as GuardLatLng;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Rejects anything a browser could send that we are not willing to pay Google
 * for. Throws with a plain message; never leaks server details.
 */
export function validateRouteInput(data: unknown): GuardRouteInput & { purpose: GuardPurpose } {
  if (!data || typeof data !== "object") throw new Error("Invalid route request");
  const d = data as GuardRouteInput;
  if (!validCoord(d.origin) || !validCoord(d.destination)) {
    throw new Error("Invalid coordinates");
  }
  const waypoints = d.waypoints ?? [];
  if (!Array.isArray(waypoints) || waypoints.length > MAX_WAYPOINTS) {
    throw new Error("Too many waypoints");
  }
  for (const w of waypoints) {
    if (!validCoord(w)) throw new Error("Invalid coordinates");
  }
  const purpose = d.purpose ?? "user";
  if (!isValidPurpose(purpose)) throw new Error("Invalid route purpose");
  const avoid = (d.avoid ?? []).filter((a) => a === "highways" || a === "ferries");

  return { ...d, waypoints, avoid, purpose };
}

/**
 * Server-side normalized fingerprint. Mirrors the client fingerprint so an
 * identical physical request produces an identical string, but it is rebuilt
 * from the validated payload rather than trusted from the browser.
 */
export function normalizeRouteFingerprint(input: GuardRouteInput & { purpose: GuardPurpose }): string {
  const o = `${input.origin.lat.toFixed(4)},${input.origin.lng.toFixed(4)}`;
  const d = `${input.destination.lat.toFixed(5)},${input.destination.lng.toFixed(5)}`;
  const w = (input.waypoints ?? [])
    .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join("|");
  const a = [...(input.avoid ?? [])].sort().join(",");
  return `${input.purpose}#${o}#${d}#${w}#${a}#${input.avoidUnpaved ? 1 : 0}`;
}

/** `ROUTE_RATE_LIMITED:12000` — parsed back by the client. */
export function rateLimitMessage(retryAfterMs: number): string {
  return `${RATE_LIMIT_CODE}:${Math.max(0, Math.round(retryAfterMs))}`;
}

export function parseRateLimit(message: string): { retryAfterMs: number } | null {
  if (!message.startsWith(`${RATE_LIMIT_CODE}`)) return null;
  const raw = Number.parseInt(message.split(":")[1] ?? "", 10);
  return { retryAfterMs: Number.isFinite(raw) ? raw : 0 };
}
