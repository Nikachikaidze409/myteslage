# Automatic device-performance profiles for the map

## Audit first: what the app actually uses

The app does **not** use MapLibre or Leaflet. The map is Google Maps JavaScript API:

- `src/lib/maps-loader.ts` — loads the Google Maps script once (key fetched from the server).
- `src/lib/maps/googleMapsService.ts` — `createMap()` creates the map: vector (WebGL) rendering with a Map ID, automatic raster fallback, and it already reports `vector: true/false`.
- `src/components/MapView.tsx` — owns the map instance, the navigation engine, the traffic layer and the 2D/3D switch.
- `src/lib/maps/cameraEngine.ts` — camera follow, currently capped near 30 fps internally.
- `src/lib/maps/vehicleRenderer.ts`, `routeRenderer.ts` — car arrow and route line.
- `src/routes/map.tsx` — route, destination, ETA, turn list, rerouting state.

So "load Leaflet in the legacy profile" is not the right move here: Google Maps already has a built-in light path (raster, no tilt, no heading). The three profiles will be built on top of that, with no second map library added and no change to routing, search, GPS or navigation logic.

## The three profiles

| | HIGH | STANDARD | LEGACY |
|---|---|---|---|
| Rendering | vector + Map ID | vector, flat | raster (no Map ID) |
| Tilt / heading-up 3D | allowed | off | off |
| Traffic layer | allowed | off by default | off, control hidden |
| Camera updates | ~30 fps (today) | ~10 fps | ~6 fps |
| Car marker | smooth rAF | smooth rAF | smooth, lower redraw rate |
| POI / label density | full | reduced | minimal |

Every navigation feature — route line, car, destination, ETA, turn list, off-route detection, rerouting, recenter — stays fully working in all three.

## How the device is judged (silent, client-side only)

A new `PerformanceProfileDetector`:

1. Before the map loads: probe WebGL2, then WebGL1, on a throwaway 1x1 canvas, plus `hardwareConcurrency`, `deviceMemory`, `prefers-reduced-motion`. No WebGL at all → LEGACY immediately.
2. Start with a safe default (STANDARD) while the map initialises, so nothing is delayed.
3. Measure map init time, then sample animation-frame intervals for ~1.5 s after first render (a passive rAF counter, no stress work).
4. Classify HIGH / STANDARD / LEGACY and apply. If the map later drops frames badly or the WebGL context is lost, downgrade once — never upgrade again in the same session (no flapping).
5. Persist the result in `localStorage` under a versioned key so return visits skip the assessment; a version bump or the developer reset re-runs it.

No hardware identification, no fingerprinting, no data leaves the browser, no new routing or search API calls. A profile change never recreates the route or re-requests directions.

## Downgrade while navigating

Vector → raster cannot be toggled on a live Google map, so a downgrade to LEGACY recreates only the map canvas: the normal branded loading state shows briefly, the new map is created, and the active route, destination, car position and camera are restored from existing state in `map.tsx`. The navigation session and its route object are untouched. STANDARD downgrades need no recreation — they only change camera rate, tilt and traffic.

## What users see

Nothing new. Normal loading state, then the map. No benchmark screen, no warning, no mention of WebGL or device strength anywhere in the normal UI.

Developer-only: `?perfdebug=1` shows a small panel with selected profile, reasons, WebGL version, map init time, average frame interval/FPS, dropped-frame estimate, active renderer, whether a fallback happened, and persistence state — plus a reset button that clears the stored profile and re-runs detection.

## File-by-file plan

New:
- `src/lib/perf/profileConfig.ts` — the single config file: all thresholds (frame-interval limits, init-time limits, core/memory minimums, sample duration) and the per-profile settings (renderer, tilt, traffic, camera fps cap, label density, antialias, marker behaviour, fallback policy).
- `src/lib/perf/profileClassifier.ts` — pure functions: `classifyStatic(caps)` and `classifyRuntime(caps, samples)`. Fully unit-testable, no DOM.
- `src/lib/perf/webglProbe.ts` — safe WebGL2/WebGL1 detection and context-loss listener wiring.
- `src/lib/perf/PerformanceProfileDetector.ts` — controller: refs only, rAF sampling, timers cancelled on stop, persistence with versioned key, single-downgrade rule.
- `src/lib/perf/usePerformanceProfile.ts` — thin React hook exposing the current profile (state changes only on profile change, never per frame).
- `src/components/PerfDebugPanel.tsx` — developer panel + reset, mounted only with `?perfdebug=1`.
- `src/lib/perf/profileClassifier.test.ts` — classification tests.

Changed:
- `src/lib/maps/googleMapsService.ts` — accept a profile so `createMap` picks vector vs raster, antialias-equivalent options, tilt/heading interaction and label density.
- `src/components/MapView.tsx` — take the profile as a prop, pass it to `createMap`, gate the traffic layer and tilt, hand the camera fps cap to the camera engine, register context-loss handling, and handle the controlled map recreation on downgrade while restoring route/car/camera.
- `src/lib/maps/cameraEngine.ts` — replace the fixed ~33 ms gate with a configurable minimum interval from the profile.
- `src/lib/maps/vehicleRenderer.ts` — honour the profile's marker redraw rate (rotation/redraw threshold), same visual behaviour at HIGH.
- `src/routes/map.tsx` — run the detector, pass the profile down, mount the debug panel behind `?perfdebug=1`, keep 3D/traffic controls consistent with the profile.

Untouched: routing, search, GPS engine, route progress, off-route detection, rerouting, pairing/HUD, payments.

## Test checklist delivered with the work

WebGL2 desktop browser; WebGL1-only; WebGL disabled; simulated slow frames; forced context loss; downgrade during an active route; return visit with persisted profile. Plus unit tests on the classifier, a typecheck and a production build.
