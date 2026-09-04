# Fix stale GPS and a car arrow that points the wrong way

Two problems, both in the driving screen. No changes to payments, accounts or pricing.

## What is wrong today

- Every GPS reading is stored in React screen state, so the whole screen re-draws each time a fix arrives, and the car is redrawn only as often as the phone/car reports a position. Between readings there is nothing driving the car forward, so it feels behind and then jumps.
- There is no age check on a reading: a position the browser cached seconds ago is drawn as if it were live.
- The arrow's direction is taken mostly from the route line while navigating, so on a parallel street, before a turn, or after a wrong turn, it points where the route goes instead of where the car actually faces.
- The compass (device orientation) is never used, so when the car is slow or stopped the direction is unreliable.

## 1. Rebuild the location pipeline

- One single continuous location watcher for the whole app, started when tracking turns on and stopped when it turns off. High accuracy on, no cached positions, 5 second timeout. No repeated one-off location requests anywhere in the driving screen.
- Each reading is kept with position, accuracy, speed, direction and its own timestamp, plus its age at the moment it arrives.
- Quality gate before anything is drawn: reject readings that are too old, too inaccurate, imply an impossible jump, or disagree with the recent speed. A rejected reading never moves the car; the last trusted position keeps being carried forward by prediction until a good reading confirms the change.
- If the signal drops, prediction continues for a short window only, then a quiet "GPS signal weak" hint appears instead of a confidently wrong position.
- Readings feed the navigation engine directly (not screen state). The screen only receives a slow summary for arrival time, distance and the next instruction.

## 2. Separate movement from drawing

The car is drawn by the existing single animation loop at up to 60 frames per second, always gliding toward the predicted position:

```text
raw reading -> validation -> filtering -> road/route matching ->
target position -> prediction -> animation frame -> car on screen
```

No screen re-draw happens per frame or per reading.

## 3. A dedicated heading engine

- New heading module that picks the best available direction source and gives each one a confidence value:
  - movement direction from GPS: trusted when the car is moving with acceptable accuracy, confidence rising with speed;
  - device compass, when the browser provides it: preferred when slow or stopped;
  - route direction: reference only, used solely when no real direction source exists.
- When nothing reliable is available, the last good direction is kept rather than letting the arrow wander.
- Smoothing always takes the shortest rotation, so 359 to 1 turns forward through north instead of spinning the long way around, and the arrow eases from the old angle to the new one frame by frame. No snapping, no 300 degree spins, no sticking to the previous route direction.
- Position, heading and route direction are kept as three distinct things: the route may turn right while the car still points ahead, and the arrow converges with the road only as the car actually turns.

## 4. Debug panel (development only)

A small overlay, hidden in the published app, showing: accuracy, reading age, speed, GPS direction, device compass, route direction, filtered direction, chosen source, confidence, distance from route, reading frequency, animation frame rate and the last reading time.

## 5. Performance and cleanup

Exactly one location watcher, one position loop, one heading loop, one compass listener; all removed when navigation stops or the screen closes.

## Technical notes

- New `src/lib/maps/geoTracker.ts` — single `watchPosition` owner with `{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }`, age computation, subscriber fan-out.
- New `src/lib/maps/headingEngine.ts` — confidence-scored heading fusion (GPS course, `deviceorientationabsolute`/`webkitCompassHeading`, route bearing fallback) with shortest-path angular smoothing.
- New `src/components/NavDebugPanel.tsx` — gated on `import.meta.env.DEV`, fed from an engine snapshot, not per-frame state.
- `src/lib/maps/gpsEngine.ts` — add staleness rejection, speed-consistency check, jump confirmation, hold-last-good behaviour.
- `src/lib/maps/navigationEngine.ts` — consume the heading engine instead of route bearing for the rendered heading; keep route bearing for guidance only; expose debug metrics.
- `src/components/LocationButton.tsx` and `src/routes/map.tsx` — stop routing every fix through React state; subscribe the engine to the tracker and keep only throttled UI fields (ETA, distance, instruction) in state.
- `src/components/MapView.tsx` — wire tracker/heading engine lifecycle and unmount cleanup.

## Verification

Typecheck passes, `/map` loads, and a browser check confirms the arrow rotates the short way on simulated turns and never re-renders the screen per frame. On-road behaviour (straight, left/right turns, U-turn, roundabout, stop, slow crawl, device rotation, degraded and lost signal, intersections, reroute) needs a real drive to confirm.
