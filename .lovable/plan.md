# Fix the navigation logic: correct position on route, fast reroute

The driving view sometimes thinks the car is going backwards, matches the car to the wrong part of the route, and reacts far too slowly when a turn is missed. This plan replaces the matching and rerouting logic. No animation or styling work is included.

## What changes for the driver

- The car is placed on the correct part of the route, even on parallel roads, bridges, ramps and where the route crosses itself.
- Progress moves forward normally; it can only go backwards when the car really turned around.
- Missing a turn is noticed within a couple of seconds, not after hundreds of metres.
- A genuinely wrong position triggers a new route from where the car actually is, keeping the same destination, instead of dragging the car back to the old road.
- Small GPS wobble no longer causes route changes or repeated route requests.
- A hidden debug panel (development only) shows exactly what the engine is deciding.

## Technical plan

### New: `src/lib/maps/routeProgressEngine.ts`

Owns route-relative state, replacing the single `projectOnPath` call in `navigationEngine.pushFix`.

State kept per update: matched segment index, step index, along-distance, previous along-distance, offset, segment bearing, heading difference, progress direction, confidence, last update time.

Matching is candidate-scored, not nearest-point:

1. Build candidates from segments in a window around the previous along-distance (window scales with speed and time since last update; full-route scan only on route change, first fix, or when confidence collapses).
2. Score each candidate on: perpendicular distance, |heading − segment bearing| (skipped when speed < ~1.5 m/s or heading unavailable), forward-progress delta vs previous along, continuity with the previous segment/step, and GPS accuracy as a weight.
3. Pick the best total score. Backward jumps (along decreasing by more than a small tolerance) require both a heading reversal consistent with the segment and two consecutive agreeing updates — otherwise the previous progress is held.
4. Emit confidence 0–1; low confidence freezes progress rather than snapping to a wrong segment.

U-turn: sustained ~150–180° heading reversal over 2+ fixes reassigns direction and re-matches with a widened window instead of silently picking an earlier segment.

### Maneuver awareness

`RouteStep[]` (already returned by `routes.functions.ts` with per-step polylines and distances) is indexed into step boundaries by along-distance when the route is set. The engine derives: current step, distance to next maneuver, `APPROACHING_MANEUVER` (< ~150 m), maneuver reached, and maneuver missed — car passed the maneuver's along-distance while offset is growing and heading no longer matches the next step's bearing. A missed maneuver goes straight to off-route confirmation without waiting on the distance threshold.

### Off-route detection (sensitive, noise-safe)

Dynamic threshold: `max(12, 1.2 × gpsAccuracy, speed-based margin)`, capped around 35 m. Off-route is confirmed when 2–3 consecutive updates all exceed the threshold **and** offset is not decreasing, or when a maneuver is confirmed missed. Confirmation typically lands under ~1.5 s at driving speed. Poor-accuracy fixes (accuracy > offset) never count toward confirmation. Current fixed 40 m / 2.5 s hysteresis in `navigationEngine.ts` is removed.

### Rerouting

On confirmed off-route: state `REROUTING`, immediate route request from the current smoothed position to the unchanged destination (existing `requestRoute(..., { silent: true, reroute: true })` path in `src/routes/map.tsx`). The old route stays drawn but the engine stops treating it as authoritative (no forcing back onto it). When the new route arrives: rebuild path index and step index, reset progress and previous progress, state `ROUTE_UPDATED` → `NAVIGATING`, and apply a ~8 s stabilisation window during which off-route confirmation needs an extra consecutive reading. One in-flight reroute at a time; a superseded request is discarded.

### State machine

`navigationEngine.ts` states become `IDLE / ROUTE_PREVIEW / NAVIGATING / APPROACHING_MANEUVER / MANEUVER_MISSED / OFF_ROUTE / REROUTING / ROUTE_UPDATED / ARRIVED`, with transitions guarded in one `setState` so `REROUTING` cannot behave as `NAVIGATING`.

### Separation and performance

Route matching runs only on accepted GPS fixes (`pushFix`), never in the rAF loop. The rAF loop keeps doing rendering and interpolation only. Roads API stays throttled and remains disabled while a route is active. Google Routes is called only on: new destination, alternate selected, confirmed off-route, explicit refresh.

### Debug and logging

`src/components/NavDebugPanel.tsx`, rendered on `/map` only when `import.meta.env.DEV` or `?navdebug=1`, subscribing to an extended engine snapshot: GPS (lat, lng, accuracy, speed, heading), matching (segment, step, along, previous along, offset, route bearing, heading diff, confidence), navigation (state, next maneuver, distance to maneuver, maneuver status, off-route status, last reroute time, reroute count).

A small ring buffer in the engine records human-readable decisions ("holding route — deviation 8 m", "rejected segment 14 — heading mismatch 118°", "missed right turn at step 6", "off-route confirmed — 3 readings ≥ 14 m", "rerouting from current location"), shown in the panel and logged to the console in dev only.

### Files touched

`src/lib/maps/routeProgressEngine.ts` (new), `src/lib/maps/navigationEngine.ts`, `src/lib/route-progress.ts` (windowed projection helpers, step index), `src/lib/maps/routeRenderer.ts` (expose step boundaries), `src/routes/map.tsx` (reroute wiring, debug panel mount), `src/components/NavDebugPanel.tsx` (new).

### Verification

Typecheck, then a scripted drive in the preview replaying GPS traces for: straight driving, parallel-road proximity, self-crossing route, missed turn, U-turn, tunnel dropout, jittery low-accuracy fixes. Assertions: progress never jumps backwards without a reversal, missed turn reroutes within ~2 s, jitter causes zero reroutes, no repeated route requests after a reroute.
