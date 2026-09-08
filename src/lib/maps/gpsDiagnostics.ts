// GPS pipeline diagnostics — MEASUREMENT ONLY.
//
// Nothing here influences navigation: no thresholds, no filtering, no
// smoothing. It records rolling, in-memory statistics that the ?gpsdebug=1
// overlay renders. No coordinates are ever stored, logged or persisted.
//
// All cadence/freshness maths uses LOCAL receive timestamps only, so a phone
// with a skewed device clock can never be compared against the Tesla's clock.

/** Rolling window size for every statistic below. */
export const HISTORY = 60;

export interface RawSample {
  accuracy: number;
  hasSpeed: boolean;
  hasHeading: boolean;
  /** Local receive time (Date.now() on the receiving device). */
  receivedAt: number;
}

export interface SourceDiag {
  count: number;
  accuracy: number | null;
  ageMs: number | null;
  lastIntervalMs: number | null;
  avgIntervalMs: number | null;
  hz: number | null;
  minAccuracy: number | null;
  medianAccuracy: number | null;
  maxAccuracy: number | null;
  hasSpeed: boolean;
  hasHeading: boolean;
}

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Rolling raw-fix statistics for ONE source (Tesla or Phone). */
export class SourceDiagnostics {
  private samples: RawSample[] = [];
  private intervals: number[] = [];
  private total = 0;

  record(sample: RawSample): void {
    const prev = this.samples[this.samples.length - 1];
    if (prev) {
      const dt = sample.receivedAt - prev.receivedAt;
      if (dt >= 0) {
        this.intervals.push(dt);
        if (this.intervals.length > HISTORY) this.intervals.shift();
      }
    }
    this.samples.push(sample);
    if (this.samples.length > HISTORY) this.samples.shift();
    this.total++;
  }

  snapshot(now: number): SourceDiag {
    const last = this.samples[this.samples.length - 1] ?? null;
    const accs = this.samples.map((s) => s.accuracy).filter((n) => Number.isFinite(n));
    const avgInterval = avg(this.intervals);
    return {
      count: this.total,
      accuracy: last ? last.accuracy : null,
      ageMs: last ? Math.max(0, now - last.receivedAt) : null,
      lastIntervalMs: this.intervals.length ? this.intervals[this.intervals.length - 1]! : null,
      avgIntervalMs: avgInterval,
      hz: avgInterval && avgInterval > 0 ? 1000 / avgInterval : null,
      minAccuracy: accs.length ? Math.min(...accs) : null,
      medianAccuracy: median(accs),
      maxAccuracy: accs.length ? Math.max(...accs) : null,
      hasSpeed: last ? last.hasSpeed : false,
      hasHeading: last ? last.hasHeading : false,
    };
  }

  reset(): void {
    this.samples = [];
    this.intervals = [];
    this.total = 0;
  }
}

export interface PipelineDiag {
  rawToDecision: number | null;
  rawToRendered: number | null;
  decisionToRendered: number | null;
  avgRawToDecision: number | null;
  avgRawToRendered: number | null;
  avgDecisionToRendered: number | null;
  samples: number;
}

/** Rolling displacement between the raw, decision and rendered positions. */
export class PipelineDiagnostics {
  private a: number[] = [];
  private b: number[] = [];
  private c: number[] = [];

  record(rawToDecision: number, rawToRendered: number, decisionToRendered: number): void {
    push(this.a, rawToDecision);
    push(this.b, rawToRendered);
    push(this.c, decisionToRendered);
  }

  snapshot(): PipelineDiag {
    return {
      rawToDecision: lastOf(this.a),
      rawToRendered: lastOf(this.b),
      decisionToRendered: lastOf(this.c),
      avgRawToDecision: avg(this.a),
      avgRawToRendered: avg(this.b),
      avgDecisionToRendered: avg(this.c),
      samples: this.a.length,
    };
  }

  reset(): void {
    this.a = [];
    this.b = [];
    this.c = [];
  }
}

function push(arr: number[], v: number): void {
  if (!Number.isFinite(v)) return;
  arr.push(v);
  if (arr.length > HISTORY) arr.shift();
}

function lastOf(arr: number[]): number | null {
  return arr.length ? arr[arr.length - 1]! : null;
}

export type RawQuality = "EXCELLENT" | "GOOD" | "WEAK" | "BAD" | "NO FIX";

/** Diagnostics label only — never read by navigation. */
export function classifyRaw(d: SourceDiag | null): RawQuality {
  if (!d || !d.count || d.medianAccuracy == null) return "NO FIX";
  const steady = d.avgIntervalMs != null && d.avgIntervalMs <= 3000;
  if (d.medianAccuracy <= 5 && steady) return "EXCELLENT";
  if (d.medianAccuracy <= 10) return "GOOD";
  if (d.medianAccuracy <= 50) return "WEAK";
  return "BAD";
}

export type PipelineQuality = "HEALTHY" | "SMOOTHING-LAG" | "STALE" | "REJECTING";

/** Diagnostics label only — never read by navigation. */
export function classifyPipeline(input: {
  active: SourceDiag | null;
  pipeline: PipelineDiag;
  accepted: number;
  rejected: number;
}): PipelineQuality {
  const { active, pipeline, accepted, rejected } = input;
  if (!active || active.ageMs == null || active.ageMs > 8000) return "STALE";
  const total = accepted + rejected;
  if (total >= 10 && rejected / total > 0.3) return "REJECTING";
  const lag = pipeline.avgRawToRendered ?? pipeline.avgRawToDecision;
  if (lag != null && active.medianAccuracy != null && lag > Math.max(10, active.medianAccuracy * 2)) {
    return "SMOOTHING-LAG";
  }
  return "HEALTHY";
}
