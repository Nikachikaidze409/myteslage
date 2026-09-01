# Connect your Google Maps API key so the map works on teslanavi.online

## What's happening now

The map loads with the Lovable-managed Google Maps browser key, which is HTTP-referrer restricted to `*.lovable.app`. On `teslanavi.online` Google rejects it with `RefererNotAllowedMapError`, so customers there see "This page didn't load Google Maps correctly." On `myteslage.lovable.app` the managed key is allowed, so it works there.

You just created your own Google Cloud API key and saved it as the secret `GOOGLE_API_KEY`. The app's map loader (`src/lib/maps-loader.ts`) reads a **browser-exposed** variable (`import.meta.env.VITE_GOOGLE_MAPS_API_KEY`) and falls back to the managed connector key. Browser code cannot read server-only runtime secrets directly, so a small server function is needed to hand your key to the browser at runtime.

Your key is HTTP-referrer restricted, so it is safe to expose to the browser — Google only honors it on the domains you authorized.

## Changes

1. **New server function** `src/lib/maps.functions.ts`:
   - `getMapsBrowserKey` (GET `createServerFn`) returns `{ key }` where `key` is `process.env.GOOGLE_API_KEY` (your saved secret), falling back to `process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` if the secret is absent.
   - Public (no auth) — it only returns a referrer-restricted browser key, no user data.

2. **Update `src/lib/maps-loader.ts`**:
   - `loadGoogleMaps()` first tries `getMapsApiKey()` (existing `import.meta.env` path, unchanged). If that yields the managed connector key only, it fetches your key from `getMapsBrowserKey` once (cached in a module variable) and uses that instead.
   - The loader's retry/timeout/auth-failure behavior stays as is.

3. **Update `src/components/MapView.tsx` and `src/components/DestinationSearch.tsx`**: no change to their `loadGoogleMaps()` calls — the key resolution moves inside the loader.

4. **Verify** the map initializes on the Lovable domain (`myteslage.lovable.app`) and on `teslanavi.online` once deployed. Confirm no `RefererNotAllowedMapError` and the map surface renders.

## Prerequisite on your side (Google Cloud Console)

Before the map works on teslanavi.online, your key's HTTP-referrer allowlist must include:
- `https://teslanavi.online/*`
- `https://*.teslanavi.online/*`
- `https://myteslage.lovable.app/*`
- `https://id-preview--6fef22b8-032d-4c78-acb2-2495788dfa3e.lovable.app/*`

and these APIs enabled on the key: Maps JavaScript, Places (New), Routes, Roads, Geocoding.

## Technical notes

- Files touched: `src/lib/maps.functions.ts` (new), `src/lib/maps-loader.ts`.
- No database, auth, payment, or pricing changes.
- The key stays a server secret; only a referrer-restricted browser copy is handed to the client at runtime.
