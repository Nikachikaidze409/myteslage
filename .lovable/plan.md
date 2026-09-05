# Make leaving the route trigger a new route faster

The navigation brain already matches the car by direction of travel and re-routes on credible deviation. Checking the current settings against what you described, most of it is in place; four things are still slower or blunter than you want.

## What changes for the driver

- Drifting about 10 m off the road now starts the check (it was 12 m).
- When the car is clearly heading away from the route, one confirmed reading is enough instead of two, so a wrong turn triggers a new route roughly a second sooner.
- After a new route arrives, the settling period is shortened, so a second genuine mistake right after a re-route is still caught quickly.
- The pause between two re-routes drops from 4 seconds to about 2 seconds; it only exists to stop shaky location readings from firing repeatedly.
- Unchanged on purpose: a single bad reading, or a reading less accurate than the drift itself, still never causes a re-route, and the new route is always calculated from where the car actually is to the same destination.

## Technical detail

`src/lib/maps/routeProgressEngine.ts`
- `MIN_OFF_ROUTE_M` 12 → 10; keep `max(min, accuracy * 1.2, speed * 0.6)` capped at 35 m and keep `credible = accuracy < offset`.
- Add a divergence test in `judge`: offset grew by more than ~2 m since the last fix AND `headingDiff > 35°`. When that holds on a credible strike, confirm off-route at 1 strike instead of `STRIKES_TO_CONFIRM`.
- `STABILISE_MS` 8000 → 5000, extra-strike requirement kept inside that window.
- Log line distinguishing "diverging fast — off route on first credible reading" from the normal 2-strike confirmation.

`src/lib/maps/navigationEngine.ts`
- `REROUTE_DEBOUNCE_MS` 4000 → 2000, still bypassed for the first re-route of a trip.

`src/routes/map.tsx`
- Keep the 1.2 s parent guard; confirm `requestRoute` is called with the freshest fix (it reads current `fix` in the callback) and that `setRerouting(false)` on both success and failure paths clears the engine's re-routing lock.

Verification: typecheck, then replay GPS traces in the preview for (a) 14 m drift with 5 m accuracy and heading away → re-route within ~2 updates, (b) 15 m single spike with 25 m accuracy → no re-route, (c) missed turn → re-route at the junction, (d) jitter on route → zero re-routes.
