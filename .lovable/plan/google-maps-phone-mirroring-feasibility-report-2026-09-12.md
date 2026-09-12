# Google Maps Phone Mirroring — Feasibility Report

No code changes are proposed here. This is the investigation you asked for, plus a recommendation.

One correction first: this app does not use MapLibre or TomTom. Direct Tesla navigation is built on Google Maps JavaScript + Google Routes. That does not change the conclusions below, but it matters for how "Mode 1" is described.

## Short answer

A website alone can never mirror the native Google Maps app from a phone. Not on iOS, not on Android. This is an operating-system privacy rule, not a gap in our code.

On Android it becomes possible only if the driver installs a companion app we publish. On iPhone it is possible in a narrow, awkward form that Apple is likely to reject from the App Store, and the mirror stops or degrades as soon as the phone locks or the user switches apps in some situations.

The bigger blocker sits at the other end: the Tesla browser. Even with a perfect phone-side capture, we have no confirmed ability to play a live low-latency video stream inside the Tesla browser. That must be tested on a real car before anything else is built.

## The eleven questions

1. **Can Android do this?** Yes, with a native companion app. Android's MediaProjection API captures the screen, and since Android 14 QPR2 the user can choose to share a single app window instead of the whole screen [1](https://developer.android.com/about/versions/14/features/app-screen-sharing). The user must approve a system dialog each session; it cannot be silent.
2. **Can iOS do this?** Partially. Apple's ReplayKit broadcast extension captures the whole screen system-wide after the user starts it from the system share sheet or Control Center. The user cannot pick "just Google Maps" — it is the entire screen or nothing. Broadcast extensions also run under a tight memory limit, which constrains video encoding quality.
3. **Can a pure web app do this?** No. Browser screen capture (`getDisplayMedia`) is not available in Safari on iOS at all, and on Android Chrome it can only capture a browser tab or the browser itself — never another installed app [2](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) [3](https://cobaltcapture.com/reference/screen-capture-browser-support). Option A in your brief is not achievable. Nothing in our code can work around it.
4. **Native Android companion app required?** Yes.
5. **Native iOS companion app required?** Yes, and with a broadcast extension. App Store review risk is real: the app's entire function would be streaming another company's app to a car screen, and Apple restricts driving-related displays.
6. **Can the Tesla browser receive the stream?** Unknown and untested. Tesla's browser is Chromium-based, so WebRTC is plausible, but versions differ across MCU1/MCU2/MCU3 and software releases, autoplay of video is often restricted, and hardware video decoding for a continuous stream is not guaranteed. This is the single biggest unknown and the cheapest thing to test.
7. **Should WebRTC be used?** Yes, if anything is built. It is the only standard way to get sub-second live video. Repeated screenshots over HTTP would be exactly the fake implementation you ruled out.
8. **Expected latency?** With WebRTC over the phone's own hotspot or LTE, roughly 150–400 ms on a good connection, higher on weak mobile signal. Acceptable for a map, marginal for turn-by-turn timing.
9. **Permissions the user must approve?** Android: the system screen-capture dialog, plus a persistent notification while capturing. iOS: starting a system broadcast manually, plus a red status indicator. Both must be re-approved per session; neither can be automated.
10. **Limitations.** Whole-screen capture on iOS leaks notifications and messages onto the car display. Battery drain and phone heat during long drives. Capture pauses or stops when the phone locks on iOS. Mobile data cost for continuous video. Google's terms on redistributing the Maps app display to another screen are a legal question, not just a technical one. Two app-store releases to maintain, with review cycles outside our control — this stops being a website project.
11. **Recommended architecture.** See below.

## Recommendation

Do not start building companion apps yet. Do this in order, stopping at whichever step fails:

**Step 1 — Prove the Tesla can play the stream.** A tiny test page in the Tesla browser that receives a WebRTC video stream from a laptop. Cheap, fast, and if the Tesla cannot play it smoothly the rest of the plan is dead regardless of phone capabilities. Nothing else should be built before this answers yes.

**Step 2 — Android first, if step 1 passes.** One Android companion app: pairs by scanning the same QR code we already generate, requests screen capture of the Google Maps window, and streams over WebRTC to the Tesla page. Android is the only platform where the capture is both allowed and reasonably clean.

**Step 3 — iOS only if there is real demand**, accepting whole-screen capture, privacy exposure, and App Store rejection risk.

**Throughout:** direct Tesla navigation stays exactly as it is and remains the default. The mirror is a second mode. If the phone disconnects, the Tesla returns to direct navigation — never a black screen.

## What happens to the existing phone pairing

The pairing work already shipped (QR code, temporary session, connection states, phone-as-controller) is the correct foundation for this feature too — a companion app would scan the same QR and join the same session. I would leave it in place rather than remove it. Separately, it is also a working fallback for anyone who will not install an app.

## Technical notes

- Signalling for WebRTC can reuse the existing realtime pairing channel; only SDP offer/answer and ICE candidates need to pass through it. No new backend service is required for signalling itself.
- A TURN relay will likely be needed. Phone and Tesla are often on different networks (car Wi-Fi vs phone LTE), and direct peer connections fail there. TURN is a paid, bandwidth-metered service.
- Suggested encoding target: H.264 baseline, 720p, 20–24 fps, 1.0–1.5 Mbps, adaptive. H.264 maximises the chance of hardware decoding in the Tesla browser.
- Google Maps does not set FLAG_SECURE on its map screens, so Android capture of that window is not blocked at the OS level.
- Deep links (`comgooglemaps://`, `https://www.google.com/maps/dir/?api=1&...`) can launch the Maps app from the companion app, so the driver lands directly in navigation after pairing.

## What I need from you

Confirm whether you want me to prepare Step 1 — the Tesla WebRTC receive test — as the next piece of work, or whether the app-store requirement changes your mind about the whole feature.
