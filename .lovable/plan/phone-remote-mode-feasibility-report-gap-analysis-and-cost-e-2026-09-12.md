# Phone Remote Mode — feasibility report, gap analysis, and cost estimate

## Short answer first

Two things you should know before we build anything:

1. **True screen mirroring of the native Google Maps app is not possible from a website.** Not on iPhone, not on Android, in any browser. A web page can never read or control another app's screen. `getDisplayMedia` (screen capture) does not exist on iOS Safari at all, and on Android Chrome it only captures a browser tab — not the Maps app. So architecture "C" and "native app mirroring" are off the table unless we ship a real mobile app from the App Store / Play Store.
2. **You already have ~70% of this feature built.** The app already has QR pairing, a short-lived pairing code, a phone page at `/phone/CODE`, a realtime channel, a Tesla "HUD mode" where the car becomes a display, and phone-to-car broadcasting of location and full navigation state. What is missing is polish, not architecture.

So the recommended architecture is **B: phone as web controller, Tesla as receiver over a realtime data channel** — which is exactly what the current code does.

## What each platform can actually do

| Capability | iPhone/Safari | Android/Chrome | Tesla browser |
| --- | --- | --- | --- |
| Open a paired controller web page | Yes | Yes | Yes (it is the display) |
| Realtime data channel (WebSocket) | Yes | Yes | Yes — already in use |
| GPS from the phone into the web page | Yes | Yes | Unreliable, which is why pairing exists |
| Capture the phone's own screen | No | Tab only | n/a |
| Capture/control the native Google Maps app | No | No | n/a |
| Keep sending while phone screen locks | Limited, needs screen awake | Limited | n/a |

The one real iOS caveat: when the phone screen sleeps or Safari goes to the background, the browser suspends and the stream to the car pauses. We handle that with a wake-lock request and a reconnect path, not by pretending it works.

## What already exists in the app

- QR code + 6-character pairing code, 12-hour expiry, server-issued, revocable.
- Phone page `/phone/CODE` that sends GPS fixes and full navigation state.
- Tesla HUD mode: sidebar collapses, car renders the phone's route, phone owns routing.
- Server-side access gate so a paired phone inherits the owner's membership.
- One source of truth: in paired mode the phone computes the route; the car only draws it.

## What is missing (the actual work)

1. **A visible "Connect phone" entry point** in the navigation UI, instead of pairing living in the More panel.
2. **Explicit connection states** — DISCONNECTED, PAIRING, CONNECTING, CONNECTED, RECONNECTING, DISCONNECTED_BY_USER, SESSION_EXPIRED, ERROR — shown on both devices with matching wording.
3. **Map view sync**: pan, zoom and bearing from the phone are not yet mirrored to the car. This is a small delta message per gesture, throttled, applied to the existing camera without fighting follow-mode.
4. **Heartbeat + auto-reconnect + timeout**: today a silent phone leaves the car waiting. Add a liveness ping, and after a timeout the car drops back to direct navigation by itself.
5. **Disconnect from either side**, with the car always returning to a usable direct-control state.
6. **Diagnostics panel** (dev/query-flag only) with session id, state, latency, message rates, reconnect count.

## Technical notes

- Transport stays Supabase realtime broadcast (WebSocket, already authenticated and already deployed). No polling, no new server, no WebRTC needed for state sync.
- New message types on the existing channel: `MAP_VIEW_CHANGED` (center/zoom/bearing, throttled to ~10/s and coalesced), `REMOTE_STATE` (connection heartbeat), `DISCONNECT`. Existing `fix`, `nav`, `nav_clear` are unchanged.
- Camera precedence: while navigating, follow-camera keeps authority; remote view changes only apply when the car is not actively following, so navigation smoothness is untouched.
- No new map instance, no second navigation engine, no extra GPS watcher, no extra route calls. The remote layer is a thin state channel above the existing engines.
- Pairing token stays short-lived and server-issued; the QR carries only the code, never credentials.

## Build order

**Prototype (stage 1)** — "Connect phone" button in the nav UI, full connection-state machine on both devices, heartbeat, timeout, disconnect from either side, automatic fallback to direct mode.

**Stage 2** — map view sync (pan/zoom/bearing) phone → Tesla, throttled and camera-safe.

**Stage 3** — diagnostics panel and reconnect hardening.

## Cost estimate (in credits, not tokens)

Lovable doesn't meter tokens directly. Build mode charges are usage-based and depend on task complexity and how many back-and-forth messages a feature needs; plan mode (where we are now) costs 1 credit per message. Because of that, an exact credit total can't be predicted in advance.

What I can say honestly:

- This feature is cheaper than it looks, because the pairing backbone (QR code, phone page, realtime channel, HUD mode) already exists. We are extending working code, not building from zero.
- Stage 1 prototype is a small-to-medium build task; stages 2 and 3 are each smaller than stage 1.
- Expect the whole three-stage feature to take a handful of build-mode messages if the prototype goes smoothly — each message carries a usage-based charge scaled to the work in it.
- The best way to control cost is to approve this plan and build one stage at a time, checking the result after each stage before continuing.

You can watch your live balance and per-message usage any time via the credit bar (click the project name, top left) or Settings → Plans & credits.

One correction to your brief: this app uses Google Maps, not MapLibre/TomTom. Everything above is written against the Google Maps engines actually in the project.
