# Fix frozen full-screen map and jumping/lagging car arrow

Two bugs, both in the map screen. No backend, auth, payment or pricing changes.

## 1. Map freezes when the side panel is hidden

When the panel is hidden with "✕", the map's container suddenly becomes much wider, but the map is never told its size changed. Google keeps drawing for the old, narrow box: tiles stop refreshing, panning feels dead and the car arrow no longer appears to move.

Fix:
- Watch the map container for size changes and tell Google Maps to re-measure (resize event) whenever the panel is shown/hidden or the window changes.
- Immediately after the resize, restore the view: if follow mode is on, re-center on the car; otherwise keep the exact center the driver was looking at, so the map does not visually jump.
- Do the same on entering/leaving HUD mode.

## 2. Arrow lags behind and jumps to the wrong spot

Several separate causes, all inside our own code (not Google's):

a. **Road-snap requests arrive late.** When there is no active route, the app asks Google's Roads API for a snapped position every 8 seconds. The answer arrives 1-2 seconds later and is written straight onto the car position — by then the car has moved, so the arrow teleports backwards. Fix: discard any snap answer that arrives after a newer GPS fix, ignore it entirely above city speed, and blend it in instead of overwriting.

b. **Bad fixes are let through.** The current filter allows up to 120 m of slack, so a poor Wi-Fi/cell fix can shift the arrow a block away. Fix: reject fixes whose accuracy is much worse than the recent average, require consecutive confirmation before accepting a big position change, and keep the last good position until a new fix is confirmed.

c. **Sticky route snapping.** While navigating, the arrow is glued to the route line whenever it is within 45 m. On parallel streets that pins the arrow to the wrong road and then snaps across when you get too far. Fix: tighten the lock, and release it smoothly (fade back to the raw GPS position) instead of jumping.

d. **Smoothing is too slow at speed.** The position and camera filters use fixed time constants, so at 60-90 km/h the arrow visibly trails the real position. Fix: make the smoothing speed-aware — snappier when moving fast, smoother when slow/stopped — and cap dead reckoning to a shorter window so a lost signal cannot drift the arrow ahead.

e. **Lost-signal handling.** If fixes stop arriving, the arrow currently keeps gliding for up to 6 seconds. Fix: stop predicting after ~3 seconds and show a subtle "GPS signal weak" hint instead of drawing a confident wrong position.

## Note on Google vs Lovable

The map, tiles, routing and search already come from Google's API with your own key. There is no Lovable map layer in between, so the delays are not caused by Lovable — they come from the smoothing/snapping logic above and from the Tesla browser's own GPS quality, which is what these changes address.

## Files

- `src/components/MapView.tsx` — container resize observer, speed-aware smoothing, snap-answer staleness guard, route-lock release, shorter dead reckoning, weak-signal hint.
- `src/lib/fix-filter.ts` — stricter accuracy/jump rejection with confirmation.
- `src/routes/map.tsx` — pass panel/HUD layout changes to the map so it re-measures.

## Verification

- Typecheck passes and `/map` returns 200.
- Browser check: hide the panel, confirm the map still pans, zooms and keeps the arrow moving; show it again and confirm the view is preserved.
