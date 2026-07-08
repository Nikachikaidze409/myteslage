# Tesla Browser Navigation Prototype — Plan

A website-only MVP optimized for the Tesla in-car browser that tests whether browser geolocation alone can produce a usable location fix for navigation in Georgia. No app, no pairing, no Bluetooth.

## Scope
- Single-page TanStack Start app, dark theme, large touch targets, full-screen layout tuned for the ~17" Tesla display.
- Uses Google Maps Platform connector (already recommended in this environment) for map tiles, Places search, and Routes — all Georgia-focused via country biasing (`gee`).
- No backend data persistence needed. Google Maps browser key loads client-side; Routes/Places calls go through the Lovable connector gateway (server function) so no secrets leak.

## User flow
1. Landing screen shows a big "Detect My Location" button, a short feasibility note, and the experimental-accuracy warning.
2. Tap → request `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })`, then start `watchPosition` to keep updating.
3. Status panel appears: lat, lng, accuracy (m), timestamp, precision score badge (Good <30 m / Usable 30–100 m / Weak >100 m / Unusable >500 m or stale >60 s).
4. Map centers on the fix; a search bar lets the user pick a destination in Georgia (Places Autocomplete, country-restricted).
5. On selection, fetch a route from current position → destination and draw the polyline with distance + ETA.
6. If geolocation fails/denies/times out, show a clear fallback card with reason and a "Use sample location (Tbilisi)" demo button that seeds a fake fix so the rest of the UI is demonstrable.

## Screens / components
- `routes/index.tsx` — full-screen shell, feasibility note, warning banner, main panel.
- `components/LocationButton.tsx` — detect + watch controls, permission-state handling.
- `components/StatusPanel.tsx` — coordinates, accuracy, age, precision badge.
- `components/MapView.tsx` — Google Maps JS API (`loading=async`, `callback=initMap`, no `mapId`, plain `Marker`). Client-only via `<ClientOnly>` + `React.lazy`.
- `components/DestinationSearch.tsx` — Places API (New) `AutocompleteSuggestion.fetchAutocompleteSuggestions` with `includedRegionCodes: ['ge']`.
- `components/RoutePreview.tsx` — shows distance/ETA/steps summary.
- `lib/routes.functions.ts` — `createServerFn` calling `routes/v2:computeRoutes` through the connector gateway.
- `lib/precision.ts` — pure scoring + staleness helpers.

## Precision + reliability logic
- Score buckets as specified; also flag "stale" if `Date.now() - timestamp > 60s`.
- Detect: `!('geolocation' in navigator)`, `PermissionsAPI` state = denied, `POSITION_UNAVAILABLE`, `TIMEOUT` — each gets its own message.
- Secure-context check: warn if `!window.isSecureContext` (Tesla browser occasionally serves mixed content).
- Watch cleanup on unmount; throttle re-renders to 1/s.

## Design
- Dark palette (near-black background, high-contrast text, one accent — Tesla-ish red `oklch(0.62 0.22 25)` used sparingly for the primary CTA), Inter or system-ui, min 48 px tap targets, no hover-only affordances, landscape-first.
- Not the generic AI purple-gradient look; flat surfaces, thin dividers, large numeric readouts for the status panel.

## Connector setup (during build)
- Link the Google Maps Platform connection so `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` and the gateway secrets are available.

## Feasibility verdict (will also be surfaced in-UI at the bottom)
- **Feasible in principle, unreliable in practice on Tesla.** The Tesla browser is a stripped Chromium; `navigator.geolocation` support has been inconsistent across firmware versions and often falls back to IP-based location (city-level, hundreds of meters to kilometers), which is not navigation-grade.
- **Real:** permission prompt, high-accuracy request, `watchPosition` updates, precision scoring, map + search + route rendering, HTTPS/secure-context handling, graceful failure UI.
- **Unreliable:** actual accuracy. Browsers cannot access the car's GPS chip, cannot read a nearby phone's GPS without that phone explicitly serving location over the network, and Wi-Fi/cell positioning coverage in Georgia is sparse compared to Google's dense wardriving datasets in Western markets. Expect frequent 500 m–5 km errors or `POSITION_UNAVAILABLE`.
- **Would need a companion mobile app for production:** a phone-side app that (a) reads real GPS via native APIs, (b) pushes coordinates to a small backend or LAN endpoint over Wi-Fi/hotspot, and (c) the Tesla browser polls that endpoint. That is the only way to get true GPS precision into the car browser without OEM integration.

## Out of scope
- Turn-by-turn voice guidance, offline tiles, saved trips, accounts, any Bluetooth/phone-pairing UX, native wrappers.
