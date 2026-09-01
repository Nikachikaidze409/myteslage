# Make the map work and feel like Google Maps

Two problems to solve: search returns nothing on teslanavi.online, and the map screen lacks the interactions drivers expect from Google Maps.

## 1. Fix search (server-side)

Today the search bar calls Google's Places autocomplete directly from the browser using the site's own Maps key. If Places API (New) is not enabled or not allowed on that key, every keystroke fails silently and no suggestions appear — exactly what you're seeing.

Fix: move search to the server.

- New server search that runs through Lovable's Google connector (same path the "Nearby" chips already use successfully), so it does not depend on the browser key's Places configuration.
- Autocomplete-as-you-type with 250 ms debounce, biased to Georgia and to your current location so nearby streets rank first.
- Selecting a result returns coordinates plus a clean name and address.
- Real error messages in the search box ("Search unavailable, retry") instead of silence, so problems are visible.

## 2. Search results on the map

- Selecting a result drops a labeled pin and pans/zooms to fit both you and the destination.
- A result card appears with name, address, distance and ETA from your position, and two buttons: **Directions** and **Cancel**.
- Multiple matches show as a short list; tapping one previews it on the map before committing to a route.

## 3. Tap a place, and category shortcuts

- Tapping any point or Google POI on the map opens the same result card (reverse-geocoded address for blank spots), with Directions.
- Category row on the map: Charging, Gas, Food, Coffee, Parking — results render as pins you can tap, not just a text list.
- Long-press/tap-hold anywhere sets a custom destination.

## 4. Map look and controls

- Google-style light map styling tuned for the Tesla screen: bigger road labels, high contrast, less clutter.
- Persistent controls: zoom in/out, recenter ("My location"), and a north/heading-up toggle, all with large touch targets.
- Smoother pan and zoom: fewer redraws while dragging, reused map objects, gesture handling set to greedy so one finger pans.

## 5. Turn-by-turn (no voice)

- Large next-maneuver banner: arrow, street name, distance to the turn, counting down live.
- Steps advance automatically as you pass each maneuver; the traveled part of the route dims.
- Remaining distance, ETA and arrival time update every second.
- Off-route triggers an immediate reroute with a brief "Rerouting" indicator.
- No spoken guidance.

## Technical notes

- New `src/lib/search.functions.ts`: server functions for text autocomplete and place details via the connector gateway (Places API New `searchText` / `places/{id}`), with location bias and Georgia region code.
- `src/components/DestinationSearch.tsx` switches from the browser Places SDK to these server functions and surfaces errors.
- `src/components/MapView.tsx`: result pin + card, map/POI click handling, category pins, styling, control cluster, gesture and redraw tuning.
- `src/components/NavBanner.tsx` / `DirectionsPanel.tsx`: live maneuver countdown driven by existing `src/lib/route-progress.ts`.
- `src/routes/map.tsx` wires selection, preview, and navigation state.
- Reverse geocoding uses the connector gateway server-side.
- No database, auth, payment, or pricing changes.
