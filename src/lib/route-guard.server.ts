// Server-authoritative cost guard + diagnostics for Google Routes.
//
// Every computeRoute call passes through here BEFORE Google is contacted.
// The decision is made in the database (atomic claim + counters), so it holds
// across server instances and cannot be bypassed by any browser, ref, or
// localStorage state.

import type { GuardPurpose } from "./route-guard";

export type GuardDecision = "allowed" | "duplicate" | "blocked";

export interface GuardVerdict {
  decision: GuardDecision;
  reason: string;
  retryAfterMs: number;
}

/** One-way hash: diagnostics must never store real coordinates. */
export async function hashFingerprint(fingerprint: string): Promise<string> {
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Atomically claim the right to make one Google call. Blocking reasons:
 * exact duplicate inside the purpose window, per-purpose runaway ceiling,
 * the 240 s server-side traffic floor, or the hard hourly Google ceiling.
 */
export async function claimRouteRequest(
  userId: string,
  purpose: GuardPurpose,
  fingerprintHash: string,
): Promise<GuardVerdict> {
  try {
    const db = await admin();
    const { data, error } = await db.rpc("route_guard_claim", {
      _user_id: userId,
      _purpose: purpose,
      _fingerprint_hash: fingerprintHash,
    } as never);
    if (error) {
      // The guard must never take navigation down with it.
      console.error(`[route-guard] claim failed: ${error.message}`);
      return { decision: "allowed", reason: "guard_unavailable", retryAfterMs: 0 };
    }
    const v = (data ?? {}) as Partial<GuardVerdict>;
    return {
      decision: (v.decision as GuardDecision) ?? "allowed",
      reason: v.reason ?? "ok",
      retryAfterMs: Number(v.retryAfterMs ?? 0),
    };
  } catch (e) {
    console.error(`[route-guard] claim threw: ${e instanceof Error ? e.message : String(e)}`);
    return { decision: "allowed", reason: "guard_unavailable", retryAfterMs: 0 };
  }
}

export interface RouteEvent {
  userId: string | null;
  purpose: string;
  fingerprintHash: string | null;
  decision: GuardDecision;
  reason: string;
  /** True ONLY when a paid Google request was actually sent. */
  googleCalled: boolean;
  googleStatus?: number | null;
  durationMs?: number | null;
}

/** Diagnostics are best effort: a logging failure must not fail navigation. */
export async function logRouteEvent(event: RouteEvent): Promise<void> {
  try {
    const db = await admin();
    await db.from("route_api_events").insert({
      user_id: event.userId,
      purpose: event.purpose,
      fingerprint_hash: event.fingerprintHash,
      decision: event.decision,
      reason: event.reason,
      google_called: event.googleCalled,
      google_status: event.googleStatus ?? null,
      duration_ms: event.durationMs ?? null,
    } as never);
  } catch (e) {
    console.error(`[route-guard] log failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface RouteUsageSummary {
  windowHours: number;
  attemptedServerRequests: number;
  googleCalled: number;
  googleSuccess: number;
  googleFailure: number;
  blockedDuplicate: number;
  blockedRateLimit: number;
  byPurpose: { user: number; reroute: number; traffic: number };
  topUsers: { userId: string; googleCalls: number }[];
}

/** Admin-only 24 h rollup. Reads through the service role. */
export async function routeUsageSummary(hours = 24): Promise<RouteUsageSummary> {
  const db = await admin();
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data, error } = await db
    .from("route_api_events")
    .select("user_id, purpose, decision, reason, google_called, google_status")
    .gte("created_at", since)
    .limit(50_000);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byPurpose = { user: 0, reroute: 0, traffic: 0 };
  const perUser = new Map<string, number>();
  let googleCalled = 0;
  let googleSuccess = 0;
  let googleFailure = 0;
  let blockedDuplicate = 0;
  let blockedRateLimit = 0;

  for (const r of rows) {
    if (r.google_called) {
      googleCalled += 1;
      if (r.purpose in byPurpose) byPurpose[r.purpose as keyof typeof byPurpose] += 1;
      if ((r.google_status ?? 0) >= 200 && (r.google_status ?? 0) < 300) googleSuccess += 1;
      else googleFailure += 1;
      if (r.user_id) perUser.set(r.user_id, (perUser.get(r.user_id) ?? 0) + 1);
    } else if (r.decision === "duplicate") {
      blockedDuplicate += 1;
    } else if (r.decision === "blocked") {
      blockedRateLimit += 1;
    }
  }

  return {
    windowHours: hours,
    attemptedServerRequests: rows.length,
    googleCalled,
    googleSuccess,
    googleFailure,
    blockedDuplicate,
    blockedRateLimit,
    byPurpose,
    topUsers: [...perUser.entries()]
      .map(([userId, googleCalls]) => ({ userId, googleCalls }))
      .sort((a, b) => b.googleCalls - a.googleCalls)
      .slice(0, 10),
  };
}
