## Goal
Stop the app from sending drivers down dirt tracks, service roads, or "shortest-by-distance" paths that aren't real roads. Match Google Maps' behavior: prefer major/paved roads, show alternatives, and let the driver pick.

## What's wrong today
`src/lib/routes.functions.ts` calls the Google Routes API v2 but with defaults that don't bias against unpaved / minor roads. We also auto-pick `routes[0]` and hide alternatives, so a bad pick is invisible.

## Changes

### 1. Routes API — request quality
In `src/lib/routes.functions.ts`:
- Set `routingPreference: "TRAFFIC_AWARE_OPTIMAL"` (already partial — make it the default for DRIVE).
- Set `travelMode: "DRIVE"` explicitly.
- Add `routeModifiers.avoidFerries: true` and expose `avoidTolls` / `avoidHighways` / `avoidFerries` toggles (default all false except ferries).
- Add `extraComputations: ["TOLLS"]` and request `routes.travelAdvisory` in the FieldMask so we can detect toll roads and flag them.
- Always request `computeAlternativeRoutes: true` (up to 3).
- Add a **road-quality filter**: after receiving routes, inspect `legs.steps.travelAdvisory` and `routeLabels`; down-rank or hide any route whose polyline is >20% on roads Google marks as unpaved / restricted / private. If all candidates are flagged, keep the best one but surface a warning banner ("This route includes unpaved roads").
- Fall back from `TRAFFIC_AWARE_OPTIMAL` to `TRAFFIC_AWARE` on 400/quota errors so routing never dies silently.

### 2. Snap the destination to a real road
Before computing a route, snap the destination lat/lng to the nearest drivable road using the Roads API `snapToRoads` (already wired in `snap-to-road.functions.ts`). If the snap moves the point >30m, use the snapped coordinate as the actual destination and keep the original as the "arrival pin". This kills the common failure where a Places result sits on a field/back-lot and Routes picks a farm track to reach it.

### 3. Show alternatives to the driver
In `src/routes/index.tsx` + `src/components/MapView.tsx` + a new `src/components/RouteChoices.tsx`:
- Render all returned routes as translucent polylines; the selected one is bold blue, the others gray.
- Show a compact card stack: "Fastest 24 min · 18 km", "Avoids tolls 27 min", "Shorter 22 min · warning: unpaved section".
- Tapping a card selects that route (updates polyline, ETA, steps). Tapping an alternate polyline on the map does the same.

### 4. Driver preferences (persistent)
New `src/components/RoutePrefs.tsx` toggle strip (top-right of map):
- Avoid tolls
- Avoid highways
- Avoid unpaved
Persist to `localStorage` via `src/lib/favorites.ts`. Re-request the route when a toggle flips.

### 5. Rerouting respects preferences
`src/routes/index.tsx` off-route reroute path already exists — pass the same modifiers + alternatives request so a reroute can't quietly drop back onto a bad road.

### 6. Report bad route (feedback loop, local only)
Small "Report bad road" button on the nav banner. Stores `{polylineHash, timestamp}` in `localStorage` and adds a soft penalty: next time we see a route whose polyline overlaps a reported segment, we auto-prefer an alternative if one exists within +15% ETA. No backend, no PII.

## Files touched
- `src/lib/routes.functions.ts` — request params, alternatives, road-quality inspection, fallback.
- `src/lib/snap-to-road.functions.ts` — reused for destination snapping (no change if signature fits).
- `src/routes/index.tsx` — wire snapping, alternatives state, prefs, reroute modifiers.
- `src/components/MapView.tsx` — render alternate polylines + click-to-select.
- `src/components/RouteChoices.tsx` — new.
- `src/components/RoutePrefs.tsx` — new.
- `src/components/NavBanner.tsx` — add "Report bad road".
- `src/lib/favorites.ts` — add `getRoutePrefs` / `setRoutePrefs` / `reportBadPolyline`.

## What this does NOT do
- No custom offline road graph (Google's data is what we have).
- No truck/RV-style routing profiles.
- No community-shared bad-road database (local-only feedback).

## Feasibility note
Google Routes API is the same engine Google Maps uses, so with the right flags (traffic-aware optimal, alternatives, avoid-ferries, destination snapping) route quality will match Google Maps in ~all cases. The remaining edge cases (private driveways, freshly closed roads) need either user feedback or waiting for Google to update — that's the same limit Google Maps itself has.