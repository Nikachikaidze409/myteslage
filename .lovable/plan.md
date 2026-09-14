# Google Routes cost guard + root-cause diagnostics

## What the code review actually found

Two confirmed runaway paths, both on the Tesla screen (`src/routes/map.tsx`). Neither is a "missing cooldown" — both are loops that re-fire on **every GPS fix**.

### Cause 1 (primary): failed route retried on every GPS fix

```
useEffect(() => {
  if (!destination || !routeFix || route || routeLoading) return;
  requestRoute(routeFix, destination);
}, [destination, fix, route, routeLoading, requestRoute]);
```

`fix` is in the dependency list, so this runs on each incoming location update (about once per second while driving). When a route request fails, the screen ends up in exactly the state the guard does not catch: destination set, no route, not loading. So it asks again immediately.

The client-side controller does not stop this: the duplicate check only compares against a request that is *currently running*, and the fingerprint contains the origin rounded to ~100 m. A moving car produces a new fingerprint every few seconds, so every retry looks like a brand-new legitimate request.

One driving session with a persistently failing route (expired membership response, Google key/referrer rejection, an API disabled, a network stall) therefore produces roughly one paid call per second for as long as the driver keeps the screen open. That is the shape of 7,505 calls in one day, and 2,705 the next.

### Cause 2: reroute failure re-arm with no backoff

When a reroute request fails, `markRerouteFailed()` correctly re-arms the deviation so a real reroute is not lost. But if the failure is systemic rather than transient, the car is still off-route on the next fix, so the engine immediately asks again — same loop, reroute-flavoured.

### Everything else checked out

- Traffic refresh on Tesla and on the phone is already conservative (4 min + 2 km + 3 km from destination + nothing in flight).
- The phone (`src/routes/phone.$code.tsx`) issues one initial route per destination and checks traffic once a minute; Tesla correctly skips its own routing while HUD/phone mode is on.
- No other file reaches `computeRoute`.

## What will be built

### A. Stop the loops at the source (client)

Explicit failure state in `map.tsx`: `lastRouteFailureAt`, `routeFailureCount`, `nextRetryAt`. The auto-request effect respects it — retry after 5 s, then 15 s, then stop automatic retries and show a "Try again" action. Reroute failures get the same bounded backoff, without touching off-route detection timing or thresholds.

### B. Server-authoritative cost guard (the real protection)

A guard runs inside `computeRoute` **before** the Google call, using the database so it holds across server instances and cannot be bypassed by any browser:

- **Exact-duplicate claim** on user + purpose + fingerprint hash: user 15 s, reroute 5 s, traffic 240 s.
- **Runaway ceilings** per authenticated user: 12 user routes / 5 min, 20 reroutes / 10 min, 15 traffic / hour, and a hard stop at 80 actual Google calls / hour (soft alert logged at 40).
- **Server-side traffic rule** mirroring the client rule, so a client regression cannot force continuous refreshes.
- **Input validation**: purpose must be exactly `user`, `reroute` or `traffic`; coordinates must be finite and in range; waypoints capped.

When blocked, Google is never called and the response is `{ code: "ROUTE_RATE_LIMITED", retryAfterMs }`. The client keeps the current route on screen, shows no permanent error, and re-arms safely after the window.

### C. Diagnostics table

`route_api_events`: user, purpose, fingerprint **hash only** (no coordinates), decision (allowed / blocked / duplicate), reason, whether Google was actually called, HTTP status, duration. Retention cleanup at 7 days.

### D. Admin usage view

An admin-only summary answering: Google calls in the last 24 h broken down by purpose, blocked duplicates, blocked rate-limits, calls per hour, and the top generating accounts. Surfaced on the existing admin page. Normal users see nothing.

## Technical notes

- New migration: `route_api_events` (+ indexes on `created_at`, `user_id`), a `route_api_claims` table for atomic duplicate claims, GRANTs, RLS (admin-read only; writes via service role), and a retention cleanup function scheduled alongside the existing hourly job.
- Guard lives in a new `src/lib/route-guard.server.ts` called from `routes.functions.ts`; `map-access.middleware` already supplies `userId` for both signed-in and paired-phone callers, so the phone counts against its owner's quota.
- Fingerprint hashing reuses the existing normalized fingerprint string, SHA-256, server-side.
- No change to GPS filtering, off-route thresholds, camera, rendering, traffic-aware routing, alternates on the first user request, or the Google provider.

## Tests

All 18 scenarios listed in the request, including: blocked requests never reach `fetch(ROUTES_API)`, one failed initial route cannot retry per GPS fix, bounded backoff, rate-limited reroute re-arms, HUD mode does not duplicate Tesla routing, no coordinates stored in diagnostics, malformed purpose/coordinates rejected. Existing rerouting tests must keep passing. Then full test run, typecheck, production build.
