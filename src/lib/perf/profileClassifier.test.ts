import { describe, expect, it } from "vitest";

import { allowTransition, classifyPreInit, classifyRuntime } from "./profileClassifier";
import { PERF_THRESHOLDS, type PerfProfile } from "./profileConfig";

const runtimeBase = {
  current: "STANDARD" as PerfProfile,
  webgl2: true,
  avgFrameMs: 16,
  longFrames: 0,
  mapInitMs: 900,
  cores: 8,
  memoryGb: 8,
  reducedMotion: false,
  poorWindows: 0,
  rendererFailed: false,
  contextLost: false,
  alreadyDowngraded: false,
};

describe("classifyPreInit", () => {
  it("uses LEGACY when no WebGL context exists", () => {
    const v = classifyPreInit({ webgl2: false, webgl1: false, persisted: null });
    expect(v.profile).toBe("LEGACY");
  });

  it("starts on STANDARD for a first visit with WebGL2", () => {
    const v = classifyPreInit({ webgl2: true, webgl1: true, persisted: null });
    expect(v.profile).toBe("STANDARD");
  });

  it("honours a persisted HIGH when WebGL2 is available", () => {
    const v = classifyPreInit({ webgl2: true, webgl1: true, persisted: "HIGH" });
    expect(v.profile).toBe("HIGH");
  });

  it("ignores a persisted HIGH without WebGL2", () => {
    const v = classifyPreInit({ webgl2: false, webgl1: true, persisted: "HIGH" });
    expect(v.profile).toBe("STANDARD");
  });

  it("honours a persisted LEGACY", () => {
    const v = classifyPreInit({ webgl2: true, webgl1: true, persisted: "LEGACY" });
    expect(v.profile).toBe("LEGACY");
  });
});

describe("classifyRuntime", () => {
  it("never upgrades live, it only persists HIGH for the next session", () => {
    const v = classifyRuntime(runtimeBase);
    expect(v.applied).toBe("STANDARD");
    expect(v.persist).toBe("HIGH");
  });

  it("does not suggest HIGH without WebGL2", () => {
    const v = classifyRuntime({ ...runtimeBase, webgl2: false });
    expect(v.persist).toBe("STANDARD");
  });

  it("does not suggest HIGH when frames are merely acceptable", () => {
    const v = classifyRuntime({ ...runtimeBase, avgFrameMs: 30 });
    expect(v.applied).toBe("STANDARD");
    expect(v.persist).toBe("STANDARD");
  });

  it("reduces visual work before switching renderer", () => {
    const v = classifyRuntime({
      ...runtimeBase,
      current: "HIGH",
      avgFrameMs: PERF_THRESHOLDS.poorAvgFrameMs + 10,
      poorWindows: 1,
    });
    expect(v.applied).toBe("STANDARD");
  });

  it("drops to LEGACY only after sustained poor frames", () => {
    const v = classifyRuntime({
      ...runtimeBase,
      avgFrameMs: 80,
      poorWindows: PERF_THRESHOLDS.poorWindowsForLegacy,
    });
    expect(v.applied).toBe("LEGACY");
  });

  it("drops to LEGACY immediately on WebGL context loss", () => {
    const v = classifyRuntime({ ...runtimeBase, current: "HIGH", contextLost: true });
    expect(v.applied).toBe("LEGACY");
  });

  it("drops to LEGACY immediately when the renderer fails", () => {
    const v = classifyRuntime({ ...runtimeBase, rendererFailed: true });
    expect(v.applied).toBe("LEGACY");
  });

  it("does not step down twice in one session", () => {
    const v = classifyRuntime({
      ...runtimeBase,
      avgFrameMs: 80,
      poorWindows: 5,
      alreadyDowngraded: true,
    });
    expect(v.applied).toBe("STANDARD");
  });

  it("ignores reduced-motion devices for HIGH", () => {
    const v = classifyRuntime({ ...runtimeBase, reducedMotion: true });
    expect(v.persist).toBe("STANDARD");
  });
});

describe("allowTransition", () => {
  it("allows only downgrades", () => {
    expect(allowTransition("HIGH", "STANDARD")).toBe(true);
    expect(allowTransition("STANDARD", "LEGACY")).toBe(true);
    expect(allowTransition("LEGACY", "HIGH")).toBe(false);
    expect(allowTransition("STANDARD", "STANDARD")).toBe(false);
  });
});
