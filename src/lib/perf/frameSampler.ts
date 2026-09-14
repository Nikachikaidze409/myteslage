// Passive animation-frame sampler. It measures the intervals of frames the
// browser is already producing - it never renders or computes anything extra,
// so it cannot itself slow the map down.

import { PERF_THRESHOLDS } from "./profileConfig";

export interface FrameSample {
  avgFrameMs: number;
  longFrames: number;
  frames: number;
}

export class FrameSampler {
  private raf = 0;
  private stopped = false;

  /** Sample one window and report it. Returns a cancel function. */
  sample(durationMs: number, done: (s: FrameSample) => void): () => void {
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
      done({ avgFrameMs: 0, longFrames: 0, frames: 0 });
      return () => {};
    }
    this.stopped = false;
    let last = performance.now();
    const start = last;
    let frames = 0;
    let total = 0;
    let longFrames = 0;

    const tick = (now: number) => {
      if (this.stopped) return;
      const dt = now - last;
      last = now;
      // The very first interval includes scheduling latency; ignore it.
      if (frames > 0) {
        total += dt;
        if (dt > PERF_THRESHOLDS.longFrameMs) longFrames++;
      }
      frames++;
      if (now - start >= durationMs) {
        this.raf = 0;
        const counted = Math.max(1, frames - 1);
        done({ avgFrameMs: total / counted, longFrames, frames });
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };

    this.raf = requestAnimationFrame(tick);
    return () => this.stop();
  }

  stop(): void {
    this.stopped = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
