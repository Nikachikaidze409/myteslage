# Harden and optimize TeslaNavi Online (6 stages)

No rewrite. Google Maps stays. NavigationEngine, GpsEngine, RouteProgressEngine, CameraEngine, RouteRenderer, VehicleRenderer keep their current structure. Phone pairing, HUD, 2D/3D, traffic, search, favorites, waypoints and session restore all keep working. Each stage leaves the app working.

## What I confirmed in the code first

- `src/lib/google-api.ts` reads one key (`GOOGLE_API_KEY`, falling back to `GOOGLE_MAPS_SERVER_KEY`) and `src/lib/maps.functions.ts` returns `GOOGLE_API_KEY` straight to the browser — so today the same value can serve both sides.
- The Google-billed server functions (`computeRoute`, search, place details, snap-to-road) have no auth middleware; only the UI gates access.
- `src/routes/map.tsx` refreshes the route when the car has moved 120 m and 15 s have passed, and that effect is not blocked while a reroute is in flight. Request IDs drop stale replies but do not stop duplicate calls going out.
- `RoadsMatcher` snaps every 3 s / 25 m with no freshness check on the reply.
- `CameraEngine` writes `moveCamera` on every frame; `VehicleRenderer` writes `setPosition` per frame; `RouteRenderer` re-sends the full path on each trim.
- Progress is pushed into `/map` state ~2x/sec, re-rendering the whole screen including the sidebar.
- `signupWithCode` no longer checks any code and creates users with the service-role admin API.
- Pair codes come from `Math.random`, with no expiry.
- `.gitignore` does not exclude `.env`.

## Stage 1 — credentials and access control

- Two keys: `GOOGLE_MAPS_BROWSER_KEY` (returned to the browser, referrer-restricted) and `GOOGLE_MAPS_SERVER_KEY` (server only). `google-api.ts` reads only the server key; `maps.functions.ts` returns only the browser key. `GOOGLE_API_KEY` is dropped as a shared fallback.
- New middleware `requireMapAccess` (built on the existing auth middleware): valid session, then admin role passes, otherwise an active subscription for the current Paddle environment; rejects before any Google call.
- Applied to `computeRoute`, autocomplete, place details, reverse geocode, nearby search, snap-to-road.
- `.gitignore` gets `.env`, `.env.*`, `!.env.example`; add `.env.example` with names only. Existing production env stays untouched; I will list which values to rotate, never print them.

You must do manually: add both keys in project secrets, and in Google Cloud create/restrict the browser key by referrer (`teslanavi.online`, `www.teslanavi.online`, the Lovable domains) and keep the server key IP/unrestricted but limited to Routes, Places (New), Roads, Geocoding.

## Stage 2 — one route-request controller, deterministic rerouting

- New `src/lib/maps/routeRequestController.ts`: single queue with priorities REROUTE > NEW_DESTINATION/USER_CHANGE > TRAFFIC_REFRESH, a fingerprint (origin, destination, waypoints, avoid, purpose) to drop duplicates, AbortController cancellation, and the existing stale-response rejection.
- Traffic refresh is suppressed while rerouting or while any request is in flight; a refresh can never cancel a reroute.
- Traffic refresh moves from "120 m + 15 s" to a conservative interval (several minutes, skipped near the end of the route). Off-route rerouting stays fast.
- Reroute becomes: off-route → exactly one request → route activated → rerouting cleared. Failure clears the state and allows a retry instead of hanging.
- `RoadsMatcher`: no periodic snapping while just browsing; destination snapping before route creation stays. Any live snapping becomes rare and version-checked so a late reply can never pull the car backwards.

## Stage 3 — rendering cost

- `CameraEngine` compares against the last state actually written and skips `moveCamera` below small center/heading/tilt/zoom deltas, so a stationary car produces near-zero writes; motion resumes smoothly.
- `VehicleRenderer` skips `setPosition` and icon-rotation rebuilds below meaningful deltas, keeping the vehicle-minus-map heading behavior.
- `RouteRenderer` trims only on meaningful progress or a new segment and avoids re-sending unchanged long geometry. Ahead/travelled/alternates unchanged.

## Stage 4 — React re-renders and startup

- Navigation progress moves out of `/map` state into a small dedicated subscriber component (refs + a tiny store), so the sidebar tree stops re-rendering twice a second; targeted `React.memo` on the heavy sidebar panels only.
- Startup: run session, role, subscription checks in parallel; `claimDevice` runs after access is verified but no longer blocks first paint; preload the MapView chunk and the browser key alongside the access check; keep the in-memory key cache and the single Maps script.

## Stage 5 — GPS ownership and lifecycle

- One authoritative `GpsEngine`; `fix-filter.ts` logic folded in or reduced to a pure helper it calls. Impossible-jump rejection, accuracy handling, heading/speed smoothing and weak-GPS handling are preserved as-is, just de-duplicated.
- Loader: one active promise, retries remove failed script tags and timers, auth failures cannot start overlapping boots.
- Full teardown audit: camera 3D verify timers, `heading_changed`, MapView `dragstart`/`click`/`idle`/ResizeObserver/`transitionend`/auth timers/gesture listeners, NavigationEngine animation frame.

## Stage 6 — pairing, signup, telemetry, tests, cleanup

- Pairing: `crypto.getRandomValues` codes, a short-lived pairing session with expiry bound to the authenticated account, old codes invalidated. QR flow unchanged for the driver.
- Signup: settle on public secure signup — normal Supabase sign-up instead of service-role `admin.createUser`, profile creation preserved, basic abuse protection; the dead access-code path is removed. (Say the word if you'd rather keep real access codes; then I redeem them transactionally instead.)
- Dev-only counters for route/reroute/traffic/Roads/autocomplete requests plus stale and duplicate counts, surfaced in the existing `?navdebug=1` panel.
- Unit tests (vitest) for GPS outlier rejection, route progress, off-route detection, reroute debounce, stale route and stale Roads handling, request priority, traffic-cannot-cancel-reroute, parallel-road matching, U-turn handling.
- Conservative dead-code cleanup only where verified unused.

## Verification each stage

Typecheck, lint/build, and a live check of `/map`: map renders, search works, a route computes, sidebar scrolls smoothly during navigation, 2D/3D and traffic toggles work, pairing/HUD still connect.
