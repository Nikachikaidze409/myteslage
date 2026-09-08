import { describe, expect, it } from "vitest";

import {
  HISTORY,
  PipelineDiagnostics,
  SourceDiagnostics,
  classifyPipeline,
  classifyRaw,
  median,
} from "./gpsDiagnostics";
import { GpsEngine } from "./gpsEngine";

const sample = (accuracy: number, receivedAt: number) => ({
  accuracy,
  hasSpeed: true,
  hasHeading: false,
  receivedAt,
});

describe("SourceDiagnostics", () => {
  it("derives interval, average interval and Hz from local receive times", () => {
    const d = new SourceDiagnostics();
    d.record(sample(5, 1000));
    d.record(sample(5, 2000));
    d.record(sample(5, 3000));
    const s = d.snapshot(3500);
    expect(s.lastIntervalMs).toBe(1000);
    expect(s.avgIntervalMs).toBe(1000);
    expect(s.hz).toBeCloseTo(1, 5);
    expect(s.ageMs).toBe(500);
    expect(s.count).toBe(3);
  });

  it("reports rolling min / median / max accuracy", () => {
    const d = new SourceDiagnostics();
    [12, 4, 8, 30].forEach((a, i) => d.record(sample(a, 1000 + i * 1000)));
    const s = d.snapshot(5000);
    expect(s.minAccuracy).toBe(4);
    expect(s.maxAccuracy).toBe(30);
    expect(s.medianAccuracy).toBe(10);
  });

  it("caps the rolling history but keeps a lifetime count", () => {
    const d = new SourceDiagnostics();
    for (let i = 0; i < HISTORY + 25; i++) d.record(sample(3 + (i % 2), 1000 + i * 1000));
    const s = d.snapshot(1000 + (HISTORY + 25) * 1000);
    expect(s.count).toBe(HISTORY + 25);
    expect(s.medianAccuracy).toBeGreaterThanOrEqual(3);
    expect(s.medianAccuracy).toBeLessThanOrEqual(4);
  });

  it("never uses device timestamps: only the receive time passed in", () => {
    const d = new SourceDiagnostics();
    // A phone with a badly skewed device clock still yields sane cadence,
    // because only the local receive time reaches the recorder.
    d.record(sample(6, 10_000));
    d.record(sample(6, 11_000));
    const s = d.snapshot(11_200);
    expect(s.lastIntervalMs).toBe(1000);
    expect(s.ageMs).toBe(200);
  });

  it("tracks speed / heading availability of the latest fix", () => {
    const d = new SourceDiagnostics();
    d.record({ accuracy: 5, hasSpeed: false, hasHeading: true, receivedAt: 1 });
    const s = d.snapshot(1);
    expect(s.hasSpeed).toBe(false);
    expect(s.hasHeading).toBe(true);
  });
});

describe("median", () => {
  it("handles empty, odd and even lengths", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 3])).toBe(2);
  });
});

describe("PipelineDiagnostics", () => {
  it("keeps current and rolling average displacements, capped at HISTORY", () => {
    const p = new PipelineDiagnostics();
    p.record(1, 2, 1);
    p.record(3, 4, 1);
    const s = p.snapshot();
    expect(s.rawToDecision).toBe(3);
    expect(s.avgRawToDecision).toBe(2);
    expect(s.avgRawToRendered).toBe(3);
    expect(s.samples).toBe(2);

    for (let i = 0; i < HISTORY + 10; i++) p.record(5, 5, 0);
    expect(p.snapshot().samples).toBe(HISTORY);
  });
});

describe("GpsEngine diagnostics", () => {
  it("counts offered / accepted / rejected with an explicit reason", () => {
    const e = new GpsEngine();
    expect(e.ingest({ lat: 41.7, lng: 44.8, accuracy: 5, timestamp: 0 }, 0)).toBe(true);
    expect(e.ingest({ lat: NaN, lng: 44.8, accuracy: 5, timestamp: 1000 }, 1000)).toBe(false);
    expect(e.diagnostics().lastReject).toBe("invalid-coordinate");
    expect(e.ingest({ lat: 41.7, lng: 44.8, accuracy: 9999, timestamp: 2000 }, 2000)).toBe(false);
    expect(e.diagnostics().lastReject).toBe("accuracy-too-poor");
    // 1 km in a second is not a road vehicle.
    expect(e.ingest({ lat: 41.71, lng: 44.8, accuracy: 5, timestamp: 1000 }, 3000)).toBe(false);
    expect(e.diagnostics().lastReject).toBe("impossible-jump");

    const d = e.diagnostics();
    expect(d.offered).toBe(4);
    expect(d.accepted).toBe(1);
    expect(d.rejected).toBe(3);
  });
});

describe("quality labels", () => {
  it("classifies raw GPS by median accuracy and cadence", () => {
    const good = new SourceDiagnostics();
    [4, 5, 4].forEach((a, i) => good.record(sample(a, i * 1000)));
    expect(classifyRaw(good.snapshot(2000))).toBe("EXCELLENT");

    const weak = new SourceDiagnostics();
    [30, 40, 35].forEach((a, i) => weak.record(sample(a, i * 1000)));
    expect(classifyRaw(weak.snapshot(2000))).toBe("WEAK");

    expect(classifyRaw(null)).toBe("NO FIX");
  });

  it("classifies the pipeline as stale, rejecting, lagging or healthy", () => {
    const src = new SourceDiagnostics();
    [4, 5, 4].forEach((a, i) => src.record(sample(a, i * 1000)));
    const fresh = src.snapshot(2000);
    const flat = { rawToDecision: 1, rawToRendered: 1, decisionToRendered: 0, avgRawToDecision: 1, avgRawToRendered: 1, avgDecisionToRendered: 0, samples: 3 };

    expect(classifyPipeline({ active: fresh, pipeline: flat, accepted: 10, rejected: 0 })).toBe("HEALTHY");
    expect(classifyPipeline({ active: src.snapshot(60_000), pipeline: flat, accepted: 10, rejected: 0 })).toBe("STALE");
    expect(classifyPipeline({ active: fresh, pipeline: flat, accepted: 5, rejected: 10 })).toBe("REJECTING");
    expect(
      classifyPipeline({
        active: fresh,
        pipeline: { ...flat, avgRawToRendered: 40, rawToRendered: 40 },
        accepted: 10,
        rejected: 0,
      }),
    ).toBe("SMOOTHING-LAG");
  });
});
