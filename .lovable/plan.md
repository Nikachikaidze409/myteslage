# Rebuild navigation to feel like the Google Maps app

The driving view is rebuilt around a dedicated navigation engine instead of a React component that moves a marker whenever a GPS point arrives. Everything keeps running on your own Google key.

## What you will notice

- The car glides continuously and smoothly instead of hopping between GPS points.
- The map is tilted and rotates so the road ahead is always up, with the car in the lower third and a slight look-ahead.
- Turning is smooth: the car and the map rotate the short way around (359 to 1 degree no longer spins backwards).
- The car stays on the road even when GPS is noisy, drifts, or drops out for a few seconds; it keeps moving on the route and picks the real position back up when signal returns.
- The route line is drawn once and stays stable: the travelled part dims behind you, the road ahead stays bright. No flashing or redraw while driving.
- Rerouting only happens when you have genuinely left the route, then transitions smoothly without wiping the map.
- Panning or zooming by hand pauses following; "My location" resumes it and re-locks the camera.
- Search is faster: typing is debounced, repeated searches are cached, and recent destinations come back instantly.

## One step for you

Create a free **Map ID** in Google Cloud Console (Google Maps Platform > Map Management > Create Map ID, type "JavaScript", raster/vector: **Vector**, enable tilt and rotation). Send it to me and I'll wire it in. Until it exists the app runs on the current flat map, so nothing breaks in the meantime.

## Technical plan

### New service layer (`src/lib/maps/`)

- `googleMapsService.ts` — single map instance, vector map with `mapId`, tilt/heading enabled, graceful raster fallback; owns loader, auth-failure retry and the ResizeObserver already working today.
- `placesService.ts`, `routesService.ts`, `roadsService.ts`, `geocodingService.ts` — thin clients over the existing server functions (`search.functions.ts`, `routes.functions.ts`, `snap-to-road.functions.ts`, `places.functions.ts`), adding request dedupe, debounce and an LRU cache. Server functions keep calling Google directly with `GOOGLE_API_KEY`.
- `gpsEngine.ts` — pipeline: raw fix > accuracy gate > outlier/impossible-jump rejection > Kalman-style position smoothing > circular heading smoothing > last-reliable-position retention > dead-reckoning estimate during signal loss. Emits through a subscription, not React state.
- `roadsMatcher.ts` — rolling GPS window, batched Snap-to-Roads with `interpolate=true`, throttled (roughly every 3 s or 30 m, never per frame), skipped entirely while confidently matched to the active route polyline.
- `navigationEngine.ts` — explicit state machine `IDLE / ROUTE_PREVIEW / NAVIGATING / APPROACHING_TURN / TURNING / OFF_ROUTE / REROUTING / ARRIVED`; owns route geometry (built once via `buildPathIndex`), progress projection, maneuver tracking, off-route detection with distance threshold plus time hysteresis, and the single reroute trigger. Routes API is called only on: first route, destination change, confirmed off-route, restart, invalid route, or an explicit traffic refresh.
- `cameraEngine.ts` — one rAF loop using `map.moveCamera({ center, heading, tilt, zoom })` with critically damped interpolation on each channel, look-ahead offset along heading, speed-adaptive zoom, and suppression of updates below a movement threshold.
- `vehicleRenderer.ts` — car drawn in a `WebGLOverlayView` on the vector map (canvas/`AdvancedMarkerElement`-free), positioned from interpolated engine state; raster fallback keeps the existing rotated-symbol marker.
- `routeRenderer.ts` — two reused polylines (travelled dim, remaining bright) updated by `setPath` on a throttle, never recreated.

### Animation and React separation

- Exactly one rAF loop, owned by `navigationEngine`, driving vehicle + camera + route trimming. Started on `NAVIGATING`/tracking, cancelled on stop and unmount.
- React subscribes only to low-frequency snapshots (ETA, remaining distance, next maneuver, state) via `useSyncExternalStore` with a ~1 Hz throttle. `fix` no longer lives in the map route's render state, which removes the current full-tree re-render on every GPS update.
- `MapView.tsx` shrinks to mounting the map container and the on-map controls; all Google calls move out of components.

### Instructions and search

- `NavBanner` / `DirectionsPanel` read maneuvers straight from Routes API steps (no invented instructions), with live distance-to-maneuver and `APPROACHING_TURN` styling. A `voiceGuidance` hook point is left in the engine, unused for now.
- `DestinationSearch` moves to `placesService`: 250 ms debounce, in-memory cache keyed by query + bias, place-details cache, recent searches from existing `favorites.ts`.

### What stays unchanged

Login, one-device lock, admin panel, pricing, checkout, payments, marketing and legal pages, phone pairing (HUD mode), favorites, nearby categories, battery/charging panel, sidebar hide/show.

### Verification

Typecheck, `/map` load, and a live browser pass with a simulated drive covering: straight driving, acceleration, sharp turns, roundabout, tunnel (signal loss), drift, sudden jumps, off-route + reroute, stop at a light, manual pan, recenter, destination change and navigation restart. Checks confirm a single rAF loop, no map recreation, and no per-frame React renders.
