# Match Google Maps: auto location + Google's own route choice

Two fixes: stop making you tap "Detect live location", and stop second-guessing Google's route picking.

## 1. No more "Detect live location" tap

Location tracking currently only starts when you press the button (or when a saved trip is restored). The Maps API key has nothing to do with this — position comes from the car's browser, not Google — but the app can start tracking by itself.

- On opening the map, tracking starts automatically and the map centers on you.
- The button stays, relabeled as a tracking toggle ("Tracking on / Start tracking"), for when the browser drops the fix and you want to force a restart.
- If the browser blocks or denies location, the existing error message appears; no silent failure.

## 2. Give the same route Google Maps gives

Right now the app changes Google's answer after receiving it. Three things cause the worse route you're seeing:

- Routes are re-sorted so any route carrying a warning is pushed down, which can promote a slower route above Google's recommended one.
- An "avoid unpaved" filter can throw away the recommended route entirely.
- Ferries are always avoided, and the app requests alternative routes and may preselect one that is not Google's default.

Changes:

- Always show Google's `DEFAULT_ROUTE` (the one the Google Maps app picks) first and select it by default. Alternatives stay available in the alternatives panel, ordered exactly as Google returns them, but never auto-selected.
- Drop the warning-based re-sorting and the unpaved soft filter from the default path. Route-quality preferences (avoid tolls / highways / unpaved) still apply only when you switch them on, and are then sent to Google as real request modifiers instead of being applied afterwards.
- Stop force-avoiding ferries unless that preference is on.
- Keep traffic-aware routing so ETA and road choice reflect live conditions, same as the phone app.

Rough-road warnings still show as labels on the route card — informational, not something that changes which route is chosen.

## Technical notes

- `src/lib/routes.functions.ts`: remove the post-fetch `routes.sort` and the `avoidUnpaved` filter; build `routeModifiers` purely from the caller's `avoid` list; order results so the `DEFAULT_ROUTE` label comes first.
- `src/routes/map.tsx`: stop passing `avoidUnpaved` as an implicit filter, default `selectedRouteIdx` to the default route, start tracking on mount.
- `src/components/LocationButton.tsx`: auto-start on mount, updated labels.

No database, auth, payment, or pricing changes.
