## Plan B — Phone does the heavy lifting, Tesla shows a big driver HUD

Quick reality check on "people install CarPlay on Tesla easily": those mods (like the LOAM adapter) are hardware dongles plugged into the car's internals that impersonate a rear display. That is a native/hardware path, not a browser path. Nothing running in a webpage can become CarPlay. What we CAN do is make our web setup feel closer to that experience — that's Plan B.

### The idea

- **Phone page** = the "brain." Full interactive map (our Google Maps-based UI), search, route computation, GPS, rerouting.
- **Tesla page** = a big, glanceable HUD. No fiddly search on the Tesla keyboard. Huge next-turn arrow, street name, distance to turn, ETA, distance remaining, current speed, and the map centered on the car with the route line. Tap targets on Tesla are limited to: Cancel trip, Reroute, Mute/unmute voice, Recenter.
- Phone stays mounted or in pocket. You start the trip on the phone once; the Tesla screen mirrors the essentials from that point on.

### What changes vs. today

**Phone page (`/phone/$code`) becomes a real map + search UI**
- Add Places autocomplete, favorites, recents on the phone (reuse existing components).
- Phone computes the route via our existing `routes.functions.ts` and broadcasts the full nav state (destination, polyline, steps, current step index, next-turn distance, ETA, off-route reroute events) over the Supabase Realtime channel — not just raw GPS.
- Phone owns rerouting logic (`off-route.ts` moves here) so the Tesla is a pure viewer.

**Tesla page (`/`) becomes HUD-first**
- New top banner: giant next-turn arrow + "In 400 m turn right on Rustaveli Ave" style text, styled for 17" viewing distance.
- Map below, follow-mode locked on the car marker, route polyline drawn from the broadcast payload (no route API calls from the Tesla side).
- Bottom bar: ETA · Distance remaining · Speed · [Cancel] [Recenter] [Mute].
- Search bar and heavy panels (favorites, battery, alternatives) get hidden when a phone session is active — the Tesla stops being a "control everything" surface and becomes a display.
- If phone disconnects, Tesla falls back to today's standalone mode automatically.

**Realtime channel payload upgrade**
Extend `pair-channel.ts` to broadcast a structured `NavState` (position, heading, speed, destination, encoded polyline, steps, currentStepIndex, distanceToNextStep, etaSeconds, distanceRemaining, isRerouting) instead of just `{lat, lng, accuracy}`. Tesla subscribes and renders; it never recomputes routes.

**Voice guidance stays on the Tesla** (Web Speech API) so the driver hears turns from the car speakers area even with phone muted.

### What this buys the user
- No typing on the Tesla on-screen keyboard mid-drive.
- Route quality = whatever the phone's GPS + our routing gives (much better than Tesla browser GPS).
- Tesla screen is optimized for glancing, not tapping.
- Phone can be locked in a pocket for GPS-only, OR unlocked on a mount for full search — same code path, user's choice.

### What this does NOT do (being honest)
- It is not CarPlay. Google Maps' native app is not involved; we render our own map using Google Maps Platform tiles/routes (same as today).
- After a reverse-gear interruption, the Tesla browser still has to be reopened manually — session-restore already handles resuming the trip when it reopens.
- If the phone screen locks and the browser tab gets suspended by iOS/Android, GPS broadcast pauses. We'll add a "Keep screen awake" wake-lock toggle on the phone page and warn the user; true background GPS needs a native app.

### Files touched

- `src/lib/pair-channel.ts` — extend payload schema to `NavState`.
- `src/routes/phone.$code.tsx` — add map, search, favorites, route compute, reroute loop, broadcast NavState. This becomes the "primary" screen.
- `src/routes/index.tsx` — when paired session is active, switch to HUD layout; hide search/panels; subscribe to NavState instead of computing.
- `src/components/NavBanner.tsx` — enlarge for HUD role (bigger arrow, bigger type).
- New `src/components/HudBottomBar.tsx` — ETA/distance/speed + Cancel/Recenter/Mute.
- `src/components/MapView.tsx` — accept a "hud mode" prop that disables interactive controls except pan/zoom and recenter.
- `src/lib/off-route.ts` — no code change, just imported from phone route now.
- Wake Lock API added to `src/routes/phone.$code.tsx`.

### Feasibility summary I'll give at the end
- Real: everything above works in browsers today.
- Unreliable: iOS backgrounding the phone tab when screen locks (mitigated by Wake Lock, not eliminated).
- Would require a companion native app for production: true background GPS with screen off, and real CarPlay-style takeover of the Tesla display.
