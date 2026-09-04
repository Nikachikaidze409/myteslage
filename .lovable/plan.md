# Lightweight 2D navigation map

Goal: the map becomes a clean, flat 2D navigation map that loads and pans fast on phones, while the car arrow, GPS, routing and rerouting behave exactly as they do now.

## What changes

1. Flat map, no 3D
   - The map is created in plain 2D mode: no 3D buildings, no tilt, no photorealistic detail, no WebGL car overlay.
   - Tilt stays at 0 at all times; the camera still rotates with your driving direction (heading-up) and still zooms with speed.
   - A light, low-clutter map style keeps roads, highways, street names, intersections, key places, traffic and the route clearly visible, and hides decorative detail (terrain shading, business icon clutter, transit noise).

2. The car arrow
   - Drawn as a simple rotated arrow marker (the fast path that already exists as a fallback), updated only when its position or angle actually changes.
   - It keeps moving from the same animation loop as today, so smoothness is unchanged.

3. Fewer redraws while driving
   - Map is created once and never recreated; route lines and the car marker are reused, never rebuilt on each location update.
   - The accuracy circle only appears when the signal is genuinely poor.
   - Camera updates are capped to roughly 30 per second and skipped entirely when the view has not meaningfully moved.
   - Route trimming stays on its existing timer.
   - The screen still receives only a throttled summary, so React does not re-render on every location update.

4. Cleanup
   - Remove now-unused 3D-only code paths and any listeners/overlays that are no longer needed.

## Not touched

GPS filtering, heading, dead reckoning, route requests, rerouting rules, navigation instructions and all UI panels stay as they are.

## Technical notes

- `src/lib/maps/googleMapsService.ts`: build the map without `mapId`/`renderingType`/tilt+heading interaction flags, apply the existing light `styles` array (extended to hide 3D and clutter), keep `disableDefaultUI`, `gestureHandling: "greedy"`, `isFractionalZoomEnabled` off for cheaper raster redraws; return `vector: false`.
- `src/lib/maps/vehicleRenderer.ts`: drop the `WebGLOverlayView` branch and its shader code; keep the marker renderer with the existing icon-change threshold.
- `src/lib/maps/cameraEngine.ts`: `wantTilt` always 0; `moveCamera` used when available (it works on raster for center/zoom/heading) with a movement-delta guard so no call is made when the delta is below a small threshold.
- `src/components/MapView.tsx`: no interface change; only removal of vector-conditional code and any redundant listeners.

## Verification

Run a scripted drive in the preview and check: map is flat with no buildings, first paint is faster, panning and camera follow are smooth, the arrow keeps gliding, and no map/polyline/marker is recreated during the drive.
