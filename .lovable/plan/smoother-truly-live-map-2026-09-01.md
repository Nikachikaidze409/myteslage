# Smoother, truly live map

Goal: make the driving map feel like a real navigation system: the car glides along the road, the route updates as you drive, and panning/zooming stays fluid on the Tesla screen.

## What changes for the driver

1. **Car glides instead of hopping.** Today the marker tweens over a fixed 900 ms guess. It will instead measure the real gap between GPS fixes and animate exactly that long, with a short dead-reckoning extension using the last known speed and heading, so the car keeps moving smoothly even when a fix is late or dropped.

2. **The car stays on the road.** Instead of calling the Roads API every 3 seconds (network delay, visible jumps), the position will be projected locally onto the active route polyline every frame while navigating. Free (no route) driving keeps the throttled Roads snap. Result: no sideways drift into buildings, zero extra latency.

3. **Bad fixes are filtered out.** Fixes with poor accuracy, or that imply an impossible jump (e.g. 300 m in one second), are discarded rather than teleporting the car. Heading is derived from actual movement when the device reports none, so the arrow points where you drive.

4. **Traveled road is consumed.** The blue route line will be trimmed behind the car as you progress, like Google Maps, and the remaining distance/ETA count down every second from live position rather than only on each reroute.

5. **Faster reroute when you take a wrong turn.** Off-route detection stays at 35 m but the confirmation window drops and the reroute uses the current position immediately; a short "Rerouting…" state shows on the map instead of only in the sidebar.

6. **Smoother camera.** Camera follow will move with an eased low-pass filter instead of a hard 30 Hz setCenter, with an optional heading-up mode (map rotates so the road ahead is always up) and a look-ahead offset that puts the car in the lower third of the screen while navigating.

7. **Faster pan/zoom.** Switch the map to Google's vector/WebGL renderer, drop the heavy custom style JSON in favor of a lighter map style, and stop recreating polylines and markers on every update (reuse instances via setPath). This removes most of the stutter when dragging on the Tesla touchscreen.

8. **Live guidance detail.** The next-turn instruction and its distance update continuously as you approach, and the turn card switches automatically at each maneuver point.

## Technical notes

- `src/components/MapView.tsx`: adaptive tween duration from fix timestamps, dead reckoning, single reusable `Polyline` with `setPath`, traveled-path trimming, eased camera filter, optional `heading`/tilt on the map, `renderingType: VECTOR` + `mapId`-less vector config where supported (with raster fallback), marker icon updates only on meaningful heading change (already partly done, extended).
- New `src/lib/route-progress.ts`: pure helpers to project a point onto a decoded polyline, return along-route distance, remaining distance, and the trimmed path. Used both for map drawing and for ETA/next-turn.
- New `src/lib/fix-filter.ts`: accuracy and jump-speed gating plus movement-derived heading.
- `src/routes/map.tsx`: use route progress for live ETA/remaining distance, faster reroute trigger, pass rerouting state to the map, keep Roads API snap only for non-navigating mode.
- `src/components/DirectionsPanel.tsx` / `NavBanner.tsx`: drive the active step from along-route distance.

No backend, auth, payment, or pricing changes.
