# Three navigation fixes: arrow direction, GPS reliability, faster map start

## 1. Blue arrow points sideways

The moving arrow is drawn by a custom graphics layer on top of the map. Its rotation is being applied in a different reference frame than the direction the car is travelling, so it sits roughly a quarter-turn off while still following the road correctly.

What to do:
- Correct the rotation so the arrow tip always points along the direction of travel, both when the map is north-up and when it turns with the car.
- Verify it live in the browser at several headings (north, east, south, west) instead of assuming the fix worked.
- If the custom layer still misbehaves on the car's browser, switch the arrow to the simpler rotated-marker version that is already in the code and known to point correctly; smoothness is unchanged because movement is animated the same way.

## 2. "Weak GPS signal" / stale position

Two things cause this today:
- The app throws away any fix reported as worse than 250 m accuracy, which the Tesla browser often reports indoors, in tunnels, at start-up and in cities.
- After only 6 seconds without an accepted fix it declares the position stale and shows the warning.

What to do:
- Accept lower-quality fixes instead of discarding them: keep them but weight them less, and show the translucent accuracy circle so the driver understands the position is approximate.
- Raise the "stale" threshold to around 12-15 seconds and require several consecutive misses, so a single skipped update no longer flashes the warning.
- Make the location request itself more aggressive: high-accuracy mode, no cached positions, and an immediate first fix on start-up.
- Show the warning only when there really is no usable position, and keep the last good position on screen meanwhile with the existing short dead-reckoning.
- Keep the paired-phone feed as the highest-quality source when it is connected.

## 3. Faster map launch

What to do:
- Start fetching the Google key and the Maps script as soon as the app opens, in parallel with the login/subscription check, instead of after the map screen mounts.
- Add early connection hints to Google's servers so the script download starts sooner on slow in-car connections.
- Load only the map libraries needed at start-up and pull the rest on demand.
- Open the map at the last known position (remembered locally) instead of a wide country-level view, so the first tiles drawn are the ones the driver needs.
- Keep the existing retry/timeout safety net.

## Technical notes

- Arrow: `src/lib/maps/vehicleRenderer.ts` — rotation passed to `transformer.fromLatLngAltitude({ rotationZ })` versus the arrow geometry axis; marker fallback path already correct.
- GPS: `src/lib/maps/gpsEngine.ts` (`MAX_ACCURACY_M`, `STALE_AFTER_MS`, outlier rejection), `src/lib/maps/navigationEngine.ts` (`weakSignal`), watch options in `src/components/LocationButton.tsx`.
- Startup: `src/lib/maps-loader.ts` (key fetch + script params), preconnect tags in `src/routes/__root.tsx`, initial center/zoom in `src/lib/maps/googleMapsService.ts`.
