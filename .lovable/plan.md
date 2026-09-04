# Rebuild the map on your own Google key, Google-standard behavior

Goal: one Google Maps account (your key) powering everything, and a driving view that behaves like Google's own map — no custom prediction layer inventing positions.

## Part 1 — your Google Cloud key (done)

You set "Application restrictions" to **None**, so the same key now works for both the browser map and server-side calls. Changes can take up to 5 minutes to apply on Google's side.

Still check once, under APIs & Services > Credentials > your key > API restrictions, that these are allowed: Maps JavaScript API, Places API (New), Routes API, Roads API, Geocoding API.

Security note: with "None", anyone who copies the key from the site could use it on your billing. If you'd rather lock it down later, keep the website restriction on the map key and create a second unrestricted key for the server only — the code will support both without changes.


## Part 2 — everything runs on your key

Today the map tiles use your key, but search, routing, road-snapping and reverse geocoding still go through Lovable's built-in Google access. That mismatch is part of why results differ from the Google Maps app.

- `src/lib/search.functions.ts`, `src/lib/routes.functions.ts`, `src/lib/places.functions.ts`, `src/lib/snap-to-road.functions.ts`: call Google directly (`places.googleapis.com`, `routes.googleapis.com`, `roads.googleapis.com`, `maps.googleapis.com`) with your `GOOGLE_API_KEY`, no Lovable gateway.
- `src/lib/maps-loader.ts`: always use your key on every domain (Lovable preview, teslanavi.online, www). Drop the hostname-based key switching and the managed-key fallback, keep the clear error message if the key is rejected.
- Any provider error is surfaced with Google's own message instead of failing silently.

## Part 3 — rebuild the driving view (Google-standard)

Strip the accumulated custom layers from `src/components/MapView.tsx` and rebuild it small and predictable:

- Remove: dead reckoning / position prediction, Roads API snapping while driving, route-lock hysteresis, speed-aware smoothing constants, the weak-GPS guessing logic. These are what make the arrow jump and lag.
- Keep it simple: each GPS fix moves the car marker with a single short linear tween between the previous and the new fix (no extrapolation beyond the last known point). If fixes stop, the arrow simply stops — it never guesses.
- Keep only a basic sanity filter in `src/lib/fix-filter.ts`: drop fixes with clearly broken coordinates or absurd accuracy; nothing else is second-guessed.
- Route rendering uses Google's own `DirectionsRenderer`-style polyline with the traveled part trimmed by real progress only.
- Follow camera: Google's standard `panTo` on each fix, not a per-frame filter loop. Far fewer redraws, so pan/zoom stays fluid on the Tesla screen.
- Keep the container `ResizeObserver` so hiding the side panel keeps the map live in full screen (this fix was correct).
- Show accuracy as Google does: a translucent circle when accuracy is poor, no invented "exact" position.

## What stays unchanged

Login, one-device lock, pricing, checkout, payments, the marketing pages and the panel layout.

## Verification

- Typecheck and `/map` load.
- Live browser check on the published site: map renders, search returns street results, a route matches the Google Maps app's choice for the same query, panel hide/show keeps the map interactive.
