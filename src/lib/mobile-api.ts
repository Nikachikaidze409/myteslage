/**
 * Stable HTTP API for the TMap Georgia mobile app (/api/public/mobile/v1/*).
 *
 * The web phone page calls TanStack server functions, whose URLs change with
 * every build. The native app needs fixed URLs, so these routes wrap the same
 * *Core functions the server functions use — one implementation, two doors.
 *
 * This file is pure (no server imports) so it can be unit-tested.
 */
import { parseRateLimit } from "@/lib/route-guard";

export const MOBILE_API_VERSION = 1;

/** Largest request body accepted (voice clips are the biggest, ~6 MB base64). */
export const MAX_BODY_BYTES = 7_000_000;

export type MobileErrorCode =
  | "unauthorized" // no/unknown/expired pairing code
  | "membership_inactive" // code is fine, owner's membership is not
  | "rate_limited" // route cost guard said wait
  | "bad_request" // invalid JSON / input
  | "not_found" // unknown endpoint
  | "failed"; // upstream (Google / AI) or other failure

export interface MobileErrorBody {
  error: MobileErrorCode;
  message: string;
  retryAfterMs?: number;
}

export function isPairCode(v: string | null | undefined): v is string {
  return !!v && /^[A-Za-z0-9]{6,12}$/.test(v);
}

/** Map anything a *Core function throws to an HTTP status + JSON body. */
export function errorResponseFor(err: unknown): { status: number; body: MobileErrorBody } {
  const message = err instanceof Error ? err.message : String(err ?? "Request failed");
  const limited = parseRateLimit(message);
  if (limited) {
    return {
      status: 429,
      body: { error: "rate_limited", message: "Route service is busy.", retryAfterMs: limited.retryAfterMs },
    };
  }
  if (err instanceof Error && err.name === "ZodError") {
    return { status: 400, body: { error: "bad_request", message: "Invalid input" } };
  }
  return { status: 400, body: { error: "failed", message: message.slice(0, 500) } };
}
