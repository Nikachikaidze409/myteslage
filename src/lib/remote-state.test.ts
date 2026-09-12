import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_DEAD_MS,
  HEARTBEAT_STALE_MS,
  heartbeatHealth,
  remoteStateLabel,
  shouldReturnToDirectMode,
  tickRemoteState,
} from "./remote-state";

describe("heartbeatHealth", () => {
  it("is dead with no heartbeat ever", () => {
    expect(heartbeatHealth(10_000, null)).toBe("dead");
  });
  it("is live just after a heartbeat", () => {
    expect(heartbeatHealth(10_000, 9_000)).toBe("live");
  });
  it("goes stale after the stale threshold", () => {
    expect(heartbeatHealth(10_000, 10_000 - HEARTBEAT_STALE_MS)).toBe("stale");
  });
  it("is dead after the dead threshold", () => {
    expect(heartbeatHealth(30_000, 30_000 - HEARTBEAT_DEAD_MS)).toBe("dead");
  });
});

describe("tickRemoteState", () => {
  it("keeps a live connection connected", () => {
    expect(tickRemoteState("connected", 5_000, 4_500)).toBe("connected");
  });
  it("recovers a reconnecting connection when heartbeats resume", () => {
    expect(tickRemoteState("reconnecting", 50_000, 49_000)).toBe("connected");
  });
  it("drops to reconnecting when heartbeats go stale", () => {
    expect(tickRemoteState("connected", 10_000, 10_000 - HEARTBEAT_STALE_MS - 1)).toBe(
      "reconnecting",
    );
  });
  it("expires the session when the phone is gone", () => {
    expect(tickRemoteState("reconnecting", 60_000, 60_000 - HEARTBEAT_DEAD_MS - 1)).toBe(
      "session_expired",
    );
  });
  it("never changes event-driven states on a timer", () => {
    expect(tickRemoteState("connecting", 100_000, null)).toBe("connecting");
    expect(tickRemoteState("pairing", 100_000, null)).toBe("pairing");
    expect(tickRemoteState("disconnected", 100_000, null)).toBe("disconnected");
    expect(tickRemoteState("disconnected_by_user", 100_000, 0)).toBe("disconnected_by_user");
  });
});

describe("shouldReturnToDirectMode", () => {
  it("returns to direct mode only when the phone is gone for good", () => {
    expect(shouldReturnToDirectMode("session_expired")).toBe(true);
    expect(shouldReturnToDirectMode("disconnected_by_user")).toBe(true);
    expect(shouldReturnToDirectMode("reconnecting")).toBe(false);
    expect(shouldReturnToDirectMode("connected")).toBe(false);
  });
});

describe("remoteStateLabel", () => {
  it("has a label for every state", () => {
    const states = [
      "disconnected",
      "pairing",
      "connecting",
      "connected",
      "reconnecting",
      "disconnected_by_user",
      "session_expired",
      "error",
    ] as const;
    for (const s of states) expect(remoteStateLabel(s).length).toBeGreaterThan(0);
  });
});
