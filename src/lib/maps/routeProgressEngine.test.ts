import { describe, expect, it } from "vitest";
import { RouteProgressEngine } from "./routeProgressEngine";

// Local flat-earth helpers: x = metres east, y = metres north of an origin in
// Tbilisi. The engine uses the same equirectangular approximation, so metres
// in these tests are metres in the engine.
const LAT0 = 41.7;
const LNG0 = 44.8;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320;
const KY = 110540;
const pt = (x: number, y: number) => ({ lat: LAT0 + y / KY, lng: LNG0 + x / KX });

/** Densify a polyline so projection behaves like real route geometry. */
function densify(vertices: { lat: number; lng: number }[], stepM = 10) {
  const out: { lat: number; lng: number }[] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    const dx = (b.lng - a.lng) * KX;
    const dy = (b.lat - a.lat) * KY;
    const len = Math.hypot(dx, dy);
    const n = Math.max(1, Math.round(len / stepM));
    for (let k = 1; k <= n; k++) {
      out.push({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n });
    }
  }
  return out;
}

/** Google's polyline algorithm — used to test real step geometry. */
function encodePolyline(points: { lat: number; lng: number }[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += enc(lat - lastLat) + enc(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

interface Drive {
  x: number;
  y: number;
  t: number;
  accuracy?: number;
  speed?: number;
  heading?: number | null;
}

function run(engine: RouteProgressEngine, fixes: Drive[]) {
  const results: { offRoute: boolean; maneuverMissed: boolean; reason: string; along: number }[] = [];
  for (const f of fixes) {
    const r = engine.update(
      {
        lat: pt(f.x, f.y).lat,
        lng: pt(f.x, f.y).lng,
        accuracy: f.accuracy ?? 5,
        speed: f.speed ?? 10,
        heading: f.heading ?? null,
      },
      f.t,
    );
    if (r) {
      results.push({
        offRoute: r.verdict.offRoute,
        maneuverMissed: r.verdict.maneuverMissed,
        reason: r.verdict.reason,
        along: r.match.along,
      });
    }
  }
  return results;
}

/** Straight road heading east for 500 m. */
const straight = () => densify([pt(0, 0), pt(500, 0)]);
/** 200 m east, then a 90° left turn and 200 m north. */
const cityTurn = () => densify([pt(0, 0), pt(200, 0), pt(200, 200)]);

describe("RouteProgressEngine — step geometry", () => {
  it("locates maneuver points from step polylines, not distance guesses", () => {
    const e = new RouteProgressEngine();
    // Deliberately wrong declared distances: geometry must win.
    e.setRoute(
      cityTurn(),
      [
        { instruction: "Turn left", distanceMeters: 10, polyline: encodePolyline([pt(0, 0), pt(200, 0)]) },
        { instruction: "Arrive", distanceMeters: 10, polyline: encodePolyline([pt(200, 0), pt(200, 200)]) },
      ],
      0,
    );
    const [first, second] = e.stepBoundaries;
    expect(first.endAlong).toBeGreaterThan(195);
    expect(first.endAlong).toBeLessThan(205);
    expect(second.endAlong).toBeGreaterThan(395);
  });

  it("falls back to cumulative distances when a step polyline is missing", () => {
    const e = new RouteProgressEngine();
    e.setRoute(cityTurn(), [
      { instruction: "Turn left", distanceMeters: 200 },
      { instruction: "Arrive", distanceMeters: 200 },
    ], 0);
    expect(e.stepBoundaries[0].endAlong).toBeGreaterThan(190);
  });
});

describe("RouteProgressEngine — maneuvers", () => {
  const turnSteps = [
    { instruction: "Turn left", distanceMeters: 200, polyline: encodePolyline([pt(0, 0), pt(200, 0)]) },
    { instruction: "Arrive", distanceMeters: 200, polyline: encodePolyline([pt(200, 0), pt(200, 200)]) },
  ];

  it("1. a correctly taken turn never reroutes", () => {
    const e = new RouteProgressEngine();
    e.setRoute(cityTurn(), turnSteps, 0);
    const out = run(e, [
      { x: 160, y: 0, t: 3000 },
      { x: 180, y: 0, t: 4000 },
      { x: 195, y: 0, t: 5000 },
      { x: 200, y: 10, t: 6000 },
      { x: 200, y: 30, t: 7000 },
      { x: 200, y: 55, t: 8000 },
    ]);
    expect(out.some((r) => r.offRoute)).toBe(false);
  });

  it("2. a missed 90° city turn reroutes on the first credible fix past it", () => {
    const e = new RouteProgressEngine();
    e.setRoute(cityTurn(), turnSteps, 0);
    const out = run(e, [
      { x: 160, y: 0, t: 3000 },
      { x: 180, y: 0, t: 4000 },
      { x: 215, y: 0, t: 5000 },
    ]);
    expect(out[2].offRoute).toBe(true);
    expect(out[2].maneuverMissed).toBe(true);
    expect(out[2].reason).toBe("maneuver-missed");
  });

  it("3. a missed shallow fork/ramp is still detected quickly", () => {
    // Straight east, then a 32° right fork.
    const forkEnd = pt(200 + 200 * Math.cos((32 * Math.PI) / 180), -200 * Math.sin((32 * Math.PI) / 180));
    const path = densify([pt(0, 0), pt(200, 0), forkEnd]);
    const e = new RouteProgressEngine();
    e.setRoute(path, [
      { instruction: "Keep right", distanceMeters: 200, polyline: encodePolyline([pt(0, 0), pt(200, 0)]) },
      { instruction: "Arrive", distanceMeters: 200, polyline: encodePolyline([pt(200, 0), forkEnd]) },
    ], 0);
    const out = run(e, [
      { x: 175, y: 0, t: 3000, accuracy: 4 },
      { x: 200, y: 0, t: 4000, accuracy: 4 },
      { x: 235, y: 0, t: 5000, accuracy: 4 },
    ]);
    expect(out.some((r) => r.maneuverMissed)).toBe(true);
  });
});

describe("RouteProgressEngine — generic deviation", () => {
  it("4. clear >15 m departure on good GPS confirms fast (2 fixes / ~600 ms)", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      { x: 100, y: 0, t: 3000, accuracy: 4 },
      { x: 120, y: 20, t: 3600, accuracy: 4 },
      { x: 140, y: 28, t: 4200, accuracy: 4 },
    ]);
    expect(out[2].offRoute).toBe(true);
    expect(out[2].reason).toBe("off-route-strong");
  });

  it("5. a single lateral GPS spike does not reroute", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      { x: 100, y: 0, t: 3000, accuracy: 4 },
      { x: 120, y: 30, t: 4000, accuracy: 4 },
      { x: 140, y: 0, t: 5000, accuracy: 4 },
      { x: 160, y: 1, t: 6000, accuracy: 4 },
    ]);
    expect(out.some((r) => r.offRoute)).toBe(false);
  });

  it("6. poor 40 m accuracy near the route produces no false reroute", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      { x: 100, y: 0, t: 3000, accuracy: 40 },
      { x: 120, y: 22, t: 4000, accuracy: 40 },
      { x: 140, y: 25, t: 5000, accuracy: 45 },
      { x: 160, y: 28, t: 6000, accuracy: 40 },
      { x: 180, y: 24, t: 7000, accuracy: 45 },
    ]);
    expect(out.some((r) => r.offRoute)).toBe(false);
  });

  it("7. a parallel road close to the route does not cause oscillation", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      { x: 100, y: 0, t: 3000, heading: 90 },
      { x: 130, y: 3, t: 4000, heading: 90 },
      { x: 160, y: -2, t: 5000, heading: 90 },
      { x: 190, y: 2, t: 6000, heading: 90 },
      { x: 220, y: 0, t: 7000, heading: 90 },
    ]);
    expect(out.some((r) => r.offRoute)).toBe(false);
    const alongs = out.map((r) => r.along);
    for (let i = 1; i < alongs.length; i++) expect(alongs[i]).toBeGreaterThanOrEqual(alongs[i - 1]);
  });

  it("8. a self-crossing route does not jump progress to the wrong segment", () => {
    // A loop that crosses itself at the origin.
    const loop = densify([pt(0, 0), pt(200, 0), pt(200, 200), pt(-100, 200), pt(-100, -100), pt(300, -100)]);
    const e = new RouteProgressEngine();
    e.setRoute(loop, [], 0);
    const out = run(e, [
      { x: 50, y: 0, t: 3000, heading: 90 },
      { x: 150, y: 0, t: 4000, heading: 90 },
      { x: 200, y: 100, t: 5000, heading: 0 },
      { x: 100, y: 200, t: 6000, heading: 270 },
      { x: -100, y: 100, t: 7000, heading: 180 },
      { x: 0, y: -100, t: 8000, heading: 90 },
    ]);
    const alongs = out.map((r) => r.along);
    for (let i = 1; i < alongs.length; i++) expect(alongs[i]).toBeGreaterThanOrEqual(alongs[i - 1]);
    expect(alongs[alongs.length - 1]).toBeGreaterThan(900);
  });

  it("9. a U-turn produces exactly one reroute event", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      { x: 100, y: 0, t: 3000, heading: 90 },
      { x: 150, y: 0, t: 4000, heading: 90 },
      { x: 130, y: 0, t: 5000, heading: 270 },
      { x: 100, y: 0, t: 6000, heading: 270 },
      { x: 70, y: 0, t: 7000, heading: 270 },
      { x: 40, y: 0, t: 8000, heading: 270 },
    ]);
    expect(out.filter((r) => r.offRoute).length).toBe(1);
  });

  it("10. the first fix after a GPS blackout never reroutes", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      { x: 100, y: 0, t: 3000, accuracy: 4 },
      { x: 200, y: 45, t: 13000, accuracy: 4 },
    ]);
    expect(out[1].offRoute).toBe(false);
    expect(out[1].reason).toBe("gps-recovery");
  });
});

describe("RouteProgressEngine — reroute lifecycle", () => {
  const departFixes = (t0: number): Drive[] => [
    { x: 100, y: 0, t: t0, accuracy: 4 },
    { x: 120, y: 20, t: t0 + 600, accuracy: 4 },
    { x: 140, y: 30, t: t0 + 1200, accuracy: 4 },
    { x: 160, y: 40, t: t0 + 1800, accuracy: 4 },
    { x: 180, y: 50, t: t0 + 2400, accuracy: 4 },
  ];

  it("11. after a SUCCESSFUL reroute the detector waits for reacquisition", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const first = run(e, departFixes(3000));
    expect(first.filter((r) => r.offRoute).length).toBe(1);
    e.markRerouted(6000);
    const after = run(e, [
      { x: 200, y: 60, t: 7000, accuracy: 4 },
      { x: 220, y: 70, t: 8000, accuracy: 4 },
      { x: 240, y: 80, t: 9000, accuracy: 4 },
    ]);
    expect(after.some((r) => r.offRoute)).toBe(false);
    expect(after.every((r) => r.reason === "awaiting-route-reacquire")).toBe(true);
  });

  it("12. after a FAILED reroute the system can reroute again", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    expect(run(e, departFixes(3000)).filter((r) => r.offRoute).length).toBe(1);
    e.markRerouteFailed(6000);
    const after = run(e, [
      { x: 200, y: 60, t: 9000, accuracy: 4 },
      { x: 220, y: 70, t: 9600, accuracy: 4 },
      { x: 240, y: 80, t: 10200, accuracy: 4 },
    ]);
    expect(after.some((r) => r.offRoute)).toBe(true);
  });

  it("13. repeated fixes during one deviation raise only one reroute event", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const out = run(e, [
      ...departFixes(3000),
      { x: 200, y: 60, t: 6000, accuracy: 4 },
      { x: 220, y: 70, t: 6600, accuracy: 4 },
      { x: 240, y: 80, t: 7200, accuracy: 4 },
      { x: 260, y: 90, t: 7800, accuracy: 4 },
    ]);
    expect(out.filter((r) => r.offRoute).length).toBe(1);
  });

  it("14. installing new geometry retires the old deviation event", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    expect(run(e, departFixes(3000)).filter((r) => r.offRoute).length).toBe(1);
    // A brand new route along the driver's actual line.
    e.setRoute(densify([pt(100, 0), pt(100, 300)]), [], 6000);
    const after = run(e, [
      { x: 120, y: 20, t: 6500, accuracy: 4 },
      { x: 130, y: 40, t: 7000, accuracy: 4 },
    ]);
    expect(after.some((r) => r.offRoute)).toBe(false);
  });
});

describe("RouteProgressEngine — shared by the phone/HUD brain", () => {
  it("phone-style fixes (no heading, speed from the device) use the same rules", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const onRoute = run(e, [
      { x: 100, y: 0, t: 3000, accuracy: 8, speed: 12, heading: null },
      { x: 140, y: 2, t: 4000, accuracy: 8, speed: 12, heading: null },
    ]);
    expect(onRoute.some((r) => r.offRoute)).toBe(false);

    const off = run(e, [
      { x: 170, y: 25, t: 5000, accuracy: 8, speed: 12, heading: null },
      { x: 200, y: 45, t: 6000, accuracy: 8, speed: 12, heading: null },
      { x: 230, y: 65, t: 7000, accuracy: 8, speed: 12, heading: null },
    ]);
    expect(off.some((r) => r.offRoute)).toBe(true);
  });
});

// A confirmed verdict is consumed by the engine, so every caller must convert
// it into a request, an owning in-flight request, or an explicit failure.
describe("reroute event consumption", () => {
  const depart = (t0: number): Drive[] => [
    { x: 100, y: 0, t: t0, accuracy: 4 },
    { x: 120, y: 20, t: t0 + 600, accuracy: 4 },
    { x: 140, y: 30, t: t0 + 1200, accuracy: 4 },
    { x: 160, y: 40, t: t0 + 1800, accuracy: 4 },
    { x: 180, y: 50, t: t0 + 2400, accuracy: 4 },
  ];

  /** Mirrors the caller contract used by phone.$code.tsx and map.tsx. */
  function consume(e: RouteProgressEngine, fixes: Drive[], canStart: () => boolean) {
    let requests = 0;
    for (const r of run(e, fixes)) {
      if (!r.offRoute) continue;
      if (canStart()) requests++;
      else e.markRerouteFailed();
    }
    return requests;
  }

  it("1. a phone deviation soon after the previous reroute is not lost", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    // Previous reroute succeeded at t=2500, well under the old 5 s cooldown.
    expect(consume(e, depart(3000), () => true)).toBe(1);
  });

  it("2. a Tesla verdict shortly after a request is not silently consumed", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    expect(consume(e, depart(3000), () => true)).toBe(1);
    // 400 ms later — far inside the old 1200 ms debounce — a failure re-arms
    // and fresh evidence still produces an event.
    e.markRerouteFailed(5400);
    const again = consume(
      e,
      [
        { x: 200, y: 60, t: 8400, accuracy: 4 },
        { x: 220, y: 70, t: 9000, accuracy: 4 },
        { x: 240, y: 80, t: 9600, accuracy: 4 },
      ],
      () => true,
    );
    expect(again).toBe(1);
  });

  it("3. a refused request leaves the engine able to retry from fresh evidence", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    let allow = false;
    // Controller refuses: the event is returned via markRerouteFailed().
    expect(consume(e, depart(3000), () => allow)).toBe(0);
    allow = true;
    const retry = consume(
      e,
      [
        { x: 200, y: 60, t: 9000, accuracy: 4 },
        { x: 220, y: 70, t: 9600, accuracy: 4 },
        { x: 240, y: 80, t: 10200, accuracy: 4 },
      ],
      () => allow,
    );
    expect(retry).toBe(1);
  });

  it("4. continuous off-route fixes still produce one request per episode", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    const requests = consume(
      e,
      [
        ...depart(3000),
        { x: 200, y: 60, t: 6000, accuracy: 4 },
        { x: 220, y: 70, t: 6600, accuracy: 4 },
        { x: 240, y: 80, t: 7200, accuracy: 4 },
        { x: 260, y: 90, t: 7800, accuracy: 4 },
      ],
      () => true,
    );
    expect(requests).toBe(1);
  });

  it("5. new geometry still requires reacquisition before another event", () => {
    const e = new RouteProgressEngine();
    e.setRoute(straight(), [], 0);
    expect(consume(e, depart(3000), () => true)).toBe(1);
    e.markRerouted(6000);
    const after = consume(
      e,
      [
        { x: 200, y: 60, t: 7000, accuracy: 4 },
        { x: 220, y: 70, t: 8000, accuracy: 4 },
        { x: 240, y: 80, t: 9000, accuracy: 4 },
      ],
      () => true,
    );
    expect(after).toBe(0);
  });
});
