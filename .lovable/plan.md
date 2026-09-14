# Runtime map-rendering capability detection and map profiles

This is runtime browser/map-rendering capability detection. No vehicle, processor or GPU identification, no user-agent guessing, no fingerprinting, nothing leaves the browser.

## Audit: what the app actually uses

The app uses the Google Maps JavaScript API — not MapLibre, not Leaflet, and none will be added.

- `src/lib/maps-loader.ts` — loads the Maps script once.
- `src/lib/maps/googleMapsService.ts` — `createMap()` builds the map (Map ID + vector, raster fallback) and reports `vector`.
- `src/components/MapView.tsx` — owns the map, navigation engine, traffic layer, 2D/3D switch.
- `src/lib/maps/cameraEngine.ts` — follow camera, currently a hardcoded 33 ms write gate.
- `src/lib/maps/vehicleRenderer.ts` / `routeRenderer.ts` — car arrow and route line.
- `src/routes/map.tsx` — destination, route, steps, ETA, rerouting state.

## Profiles and forced rendering type

| | HIGH | STANDARD (start here) | LEGACY |
|---|---|---|---|
| Rendering | explicit `RenderingType.VECTOR` + Map ID | explicit `RenderingType.VECTOR` + Map ID | explicit `RenderingType.RASTER`, no Map ID |
| Tilt / heading-up | allowed | off (flat 2D) | off |
| Labels / POIs | full, `clickableIcons` on | reduced | minimal |
| Camera write cap | ~30 fps | ~10 fps | ~6 fps |
| Car marker | rAF interpolation | rAF interpolation | rAF, larger redraw threshold |
| Visible traffic layer | off by default, user toggle available | off, toggle hidden | off, toggle hidden |

Raster is forced by `renderingType`, never by omitting the Map ID alone. Traffic-aware route *calculation* is unchanged in all profiles — only the visible traffic overlay is gated.

## Decision rules (all thresholds in one config file)

Signals: WebGL2 / WebGL1 / none, `hardwareConcurrency`, `deviceMemory`, `prefers-reduced-motion`, map init time, and a passive rAF interval sample. No stress loops, no canvas fingerprint, no Google API calls.

Pre-init (before the map is created):
- No WebGL context at all → LEGACY immediately.
- Otherwise → STANDARD, unless a persisted profile from a previous session says HIGH (then HIGH), or says LEGACY (then LEGACY).

Runtime sample (about 1.5 s of rAF intervals after first render, plus map init time):
- avg frame interval ≤ 20 ms, no long frames over 60 ms, WebGL2, init ≤ 2500 ms, cores ≥ 4 → HIGH-capable.
- avg ≤ 45 ms → stay STANDARD.
- avg > 45 ms sustained over two consecutive samples, or renderer failure, or `webglcontextlost` → LEGACY.

Direction rules:
- HIGH is never applied mid-session; it is persisted and used on the next visit (or applied before the map finishes initialising, if the verdict lands that early).
- The first response to poor performance is always visual reduction inside the current renderer: traffic off, flat 2D, lower camera cap, fewer labels.
- Raster (LEGACY) only after sustained poor performance, renderer init failure, or WebGL context loss.
- One downgrade step per session, never an upgrade mid-session — no flapping.
- Persisted in `localStorage` under a versioned key; a version bump or the developer reset re-runs detection.

## Controlled reinitialization on a vector→raster downgrade

Rendering type cannot be changed on a live Google map, so LEGACY performs exactly one controlled reinit:

1. Snapshot from existing state: destination, route polyline and steps, snapped current position, heading, speed, ETA, remaining distance, current maneuver, off-route state, reroute cooldown/in-flight state.
2. Pause the animation loop; destroy camera engine, vehicle renderer, route renderer, navigation engine; remove every Maps listener; clear the container.
3. Create the raster map with `renderingType: RASTER`.
4. Rebuild the renderers and re-apply the snapshot: same route polyline redrawn from the stored geometry, car placed at the stored position, camera restored, navigation resumed from the same progress state.
5. Resume the loop.

No Routes API call, no reroute, no search call is triggered by a profile change. The user sees only the normal short branded loading state.

## Files

New (`src/lib/perf/`):
- `profileConfig.ts` — the single source of thresholds and per-profile settings (rendering type, tilt, label density, camera fps cap, marker redraw threshold, traffic toggle availability, sample duration, persistence version), each documented.
- `webglProbe.ts` — safe WebGL2/WebGL1 probe on a throwaway canvas + context-loss listener wiring.
- `frameSampler.ts` — ref-based rAF interval sampler, cancels cleanly.
- `profileClassifier.ts` — pure `classifyPreInit()` / `classifyRuntime()`, no DOM, unit-tested.
- `PerformanceProfileDetector.ts` — controller: pre-init verdict, runtime sampling, one-step downgrade rule, persistence, reasons log.
- `usePerformanceProfile.ts` — hook; React state updates only when the profile changes, never per frame.
- `profileClassifier.test.ts` — classification tests.
- `src/components/PerfDebugPanel.tsx` — `?perfdebug=1` only.

Changed:
- `googleMapsService.ts` — `createMap(container, profile)`: explicit `RenderingType`, Map ID only for vector, label/POI and `clickableIcons` settings per profile.
- `MapView.tsx` — accept the profile, pass it to `createMap`, gate the traffic overlay and tilt, feed the camera fps cap, wire context-loss, and run the snapshot/teardown/rebuild/restore reinit on downgrade.
- `cameraEngine.ts` — replace the fixed 33 ms gate with the profile's configured minimum write interval.
- `vehicleRenderer.ts` — profile-configurable redraw threshold; HIGH behaves exactly as today.
- `map.tsx` — run the detector, pass the profile down, mount the debug panel behind `?perfdebug=1`, hide the traffic toggle outside HIGH.

Untouched: routing, search, GPS engine, route progress, off-route detection, rerouting, pairing/HUD, payments.

## Developer diagnostics

`?perfdebug=1` shows: selected profile and reasons, WebGL version detected, rendering type actually in use, map init time, average frame interval and estimated FPS, dropped/long-frame count, camera write FPS, WebGL context-loss events, whether a fallback happened, persistence state — plus a reset button that clears the stored profile and re-runs detection. Normal users see none of this and no message about device capability anywhere.

## Testing

- Unit tests on the classifier for HIGH / STANDARD / LEGACY inputs and the no-upgrade / one-downgrade rules.
- HIGH: desktop WebGL2 browser, confirm vector rendering and persisted HIGH on reload.
- STANDARD: first visit with no persisted profile — confirm vector, flat, traffic off, ~10 fps camera writes.
- LEGACY: WebGL disabled in the browser — confirm `RenderingType.RASTER` and full navigation.
- Context loss: force it via `WEBGL_lose_context` and confirm a single clean reinit into raster.
- Slow frames: throttle CPU in DevTools and confirm reduction first, raster only after sustained poor frames.
- Downgrade during active navigation: start a route, force the downgrade, confirm route, steps, ETA and car position survive and that no Routes/search request is issued (network panel).
- Plus typecheck and a production build.
