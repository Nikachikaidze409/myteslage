## Context

Tesla firmware suspends the browser when the car shifts into Reverse (the reverse camera takes over the screen). No web app can force itself back to the foreground — Tesla exposes no API for gear state, background execution, or app relaunch. When you shift back to D/P you must tap the browser icon again.

The only thing we control is **what happens when the browser reopens**. Today the app loads on the home screen and you have to re-enter your destination and re-tap "Start navigation". This plan makes the app resume exactly where you left off, so one tap on the browser icon puts you straight back into turn-by-turn.

## What this plan changes

Add full session persistence + auto-resume:

1. **Persist active nav session** to `localStorage` whenever it changes:
   - Selected destination (lat, lng, name)
   - Active route (encoded polyline, alternatives, chosen index)
   - Route options (avoid tolls / highways / ferries)
   - Waypoints (e.g. supercharger stops)
   - Navigation state (was it in "navigating" mode?)
   - Timestamp of last save

2. **On app load**, if a saved session exists and is < 2 hours old:
   - Restore destination, route, waypoints, options into state immediately
   - Auto-request geolocation (same as tapping "Detect location")
   - Once the first GPS fix arrives, auto-enter navigating mode and resume turn-by-turn — no taps required
   - Show a small "Resumed trip to {destination}" toast with a "Cancel" button in case the user doesn't want to resume

3. **Clear the saved session** when:
   - User taps "End navigation" / clears destination
   - User arrives (distance to destination < 50 m)
   - Session is older than 2 hours on load (stale)

4. **Recovery hint in UI**: small text under the browser-reopen scenario — "Trip auto-resumes when you reopen the browser" — so the user knows what to expect.

## What this plan does NOT do (and why)

- **Auto-relaunch the browser after reverse** — impossible from a web app. Tesla firmware controls this. The only true auto-resume is Tesla's split-screen mode (Model S/X and newer 3/Y), where the browser stays alive alongside the map and returns automatically when you shift out of R. I'll mention this in the UI as the recommended setup.
- **Background GPS while hidden** — the browser is fully suspended by Tesla; no JS runs. We can't keep tracking during reverse.

## Technical details

Files to touch:

- **New** `src/lib/session.ts` — `saveSession()`, `loadSession()`, `clearSession()` helpers wrapping `localStorage` under key `nav-session-v1`, with a 2-hour TTL and a version field for future migrations.
- **Edit** `src/routes/index.tsx` — call `saveSession()` inside effects that already watch destination/route/options/waypoints; on mount, call `loadSession()` and hydrate state; when the first `fix` arrives and a session was restored, auto-trigger `startNavigation()`. Clear session on end/arrival.
- **Edit** `src/components/RoutePreview.tsx` (or a new small `ResumeToast.tsx`) — show the "Resumed trip — Cancel" toast for ~5 s after auto-restore.
- **Edit** `src/components/FeasibilityNote.tsx` (or wherever tips live) — add the split-screen recommendation and "auto-resumes on reopen" note.

No backend, no schema changes, no new dependencies. Uses existing `localStorage` pattern already in `src/lib/favorites.ts`.
