# Map-first redesign

Rebuild the app's look and flow around one full-screen map, in the style of a modern navigation product, with an original brand system. All existing behaviour stays — nothing is deleted, the heavy driving tools move into a Drive mode layer instead of crowding the screen.

## What exists today (and what happens to it)

The `/map` screen is a two-column layout: a long scrolling sidebar of panels (tracking button, status, phone pairing, favourites, nearby chips, alternatives, battery, step list, route preview, feasibility note) next to the map, plus a floating search bar, nav banner and bottom HUD during navigation.

Kept, all of it:

- Live GPS tracking, route projection, smooth car marker, auto-reroute
- Phone pairing GPS, session restore after reverse, favourites/recents
- Route alternatives, avoid options, battery/charge planning, nearby categories
- Sign-in, membership gate, admin bypass, pricing/checkout/legal pages

Moved, not removed: battery planning, phone pairing and route preferences become panels inside the details sheet / a Settings sheet rather than always-visible sidebar blocks.

## New layout

```text
mobile                          desktop
+----------------------+        +--------------+---------------------+
|  [ search field    ] |        | search       |                     |
|                      |        | results /    |      full map       |
|        map           |        | place detail |                     |
|                      |        | directions   |   [zoom] [layers]   |
|   [locate] [layers]  |        | (collapsible)|   [locate]          |
| ---- bottom sheet ---|        +--------------+---------------------+
```

- **Search bar** floats at top (top-center on desktop, full-width on mobile), with server-side autocomplete as you type, recent/favourite shortcuts when empty, and clear empty / no-result / error states.
- **Place sheet**: selecting a suggestion, a map POI, or a long-press drops a pin and opens a sheet with name, address, photo, rating and review count, open/closed status and hours, phone, website, distance and ETA from you, plus Directions / Save / Share actions. Missing fields simply don't render.
- **Directions view**: origin and destination fields (swap, "Your location"), driving/walking/cycling/transit where the API supports it, route cards with ETA, distance and traffic note, selected route drawn bold with alternatives dimmed and tappable, and the step list below.
- **Map controls**: zoom in/out, recenter/locate, map type (default / satellite / terrain) and traffic toggle, compass/north reset. Large tap targets, bottom-right cluster, safe-area aware.
- **Drive mode**: starting a route switches to the existing navigation HUD (maneuver banner, ETA/remaining bar, recenter, end trip). No voice anywhere.

## Visual system

Original palette and typography defined as tokens in `src/styles.css`: deep ink surfaces, a single saturated accent for routes/actions (not Google blue), soft elevation, 16–20px rounded panels, 150–200ms transitions. Custom SVG icons; no Google marks or assets. Map styling is a custom light/dark style pair, readable at speed.

## Data and reliability

- Places details, photos, autocomplete, geocoding and routing all run server-side through the existing connector server functions; browser only gets the referrer-restricted map key.
- Explicit UI for: loading skeletons, empty query, no results, location permission denied, location unavailable, API error with retry, offline.
- Many pins (category results) render through a marker clusterer, with markers reused rather than recreated.

## Phases (app runnable after each)

1. Brand tokens, map style, shared UI primitives (sheet, panel, control button, icons).
2. New app shell for `/map`: full-screen map + responsive search/details container; existing panels temporarily hosted inside it.
3. Search + place details sheet with photos/hours/rating via an extended place-details server function.
4. Directions view: origin/destination, travel modes, route cards, selected/alternative rendering, step list.
5. Controls, layers/traffic, clustering, error/empty states, mobile polish.
6. Marketing/auth/pricing pages restyled to the same brand.

## Technical notes

- `src/lib/search.functions.ts` gains richer place details (photos, hours, rating, phone, website, types) and a photo-proxy server function so no key reaches the client.
- `src/lib/routes.functions.ts` gains a travel-mode parameter; existing driving behaviour unchanged by default.
- `src/components/MapView.tsx` is refactored into map core plus overlay layers (route, pins, cluster, user marker) to keep it maintainable; live-navigation logic in `route-progress.ts` / `fix-filter.ts` is reused as-is.
- New components: `SearchPanel`, `PlaceSheet`, `DirectionsPanel` (rewrite), `MapControls`, `ResponsiveSheet`.
- No database, auth, payment or pricing changes. No voice features of any kind.
