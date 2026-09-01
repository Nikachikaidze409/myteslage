# Fix: stuck on paywall + Google Maps error on the custom domain

## Problem 1 — customer signed in with the wrong email and can't get out

Verified in the database:
- `tornikekip@gmail.com` exists and **has an active live membership** (period ends 1 Oct 2026).
- Several near-miss typo accounts exist too (`tornikekp@gmail.com`, `tornime.kipiani@gmail.com`, `sanikidzetato@gmail.con`) with no membership.

Root cause: the only "Sign out" button in the whole app lives on the `/map` screen. A user signed in with a typo account never reaches `/map` — the access gate bounces them to `/pricing`, which has no way to sign out or switch account. So they are trapped in a loop that only offers "buy again".

### Changes
1. Add a **"Signed in as x@y.com — Sign out / use another account"** row to:
   - `/pricing` (top of the page, when a session exists)
   - `/checkout`
   Signing out clears the session and returns to `/auth`.
2. On `/auth`, show the currently signed-in email with a "Not you? Sign out" link instead of silently redirecting.
3. When the gate redirects to `/pricing` because of no membership, show a short line: "This account (email) has no active membership. Wrong account? Sign out."
4. Sign-out uses the clean sequence: cancel queries, clear cache, sign out, replace-navigate to `/auth`.

No changes to billing logic — the customer's existing membership stays as is; they just sign in with the correct email and go straight to the map.

## Problem 2 — "This page didn't load Google Maps correctly"

The map loads with the Lovable-managed Google Maps browser key (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`). That key is HTTP-referrer restricted to Lovable domains, so on **teslanavi.online** Google rejects it with `RefererNotAllowedMapError` — exactly the error your customer sees. The same app works on the `.lovable.app` domain.

### Changes
1. Support a **project-owned Google Maps key**: read an optional key/secret first and fall back to the Lovable connector key. You create the key in Google Cloud with these authorized referrers:
   - `https://teslanavi.online/*`
   - `https://www.teslanavi.online/*`
   - `https://myteslage.lovable.app/*`
   and these APIs enabled: Maps JavaScript, Places, Routes/Directions, Roads, Geocoding.
   I'll request the key through the secret prompt when we build this.
2. Replace the raw Google error with a readable in-app message ("Map can't load on this domain — the map key doesn't allow teslanavi.online") plus a retry, so customers see something actionable instead of a broken screen.
3. Verify the map loads on both the Lovable domain and teslanavi.online after the key is in place.

## Technical notes
- Files touched: `src/routes/pricing.tsx`, `src/routes/checkout.tsx`, `src/routes/auth.tsx`, `src/components/AuthGate.tsx`, `src/lib/maps-loader.ts`, `src/components/MapView.tsx`.
- No database migration required; no payment/webhook changes.
