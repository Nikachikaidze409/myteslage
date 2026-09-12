/**
 * Phone remote mode — shared connection state machine.
 *
 * Both ends (Tesla display and phone controller) use these states and the
 * same labels so the two screens always agree on what is happening.
 * The transitions that depend on time are pure functions so they are
 * unit-testable without a realtime channel.
 */
export type RemoteState =
  | "disconnected"
  | "pairing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected_by_user"
  | "session_expired"
  | "error";

/** No heartbeat for this long → the phone may be asleep; show "reconnecting". */
export const HEARTBEAT_STALE_MS = 6_000;
/** No heartbeat for this long → the session is treated as lost. */
export const HEARTBEAT_DEAD_MS = 20_000;
/** Phone sends one heartbeat this often while its page is connected. */
export const HEARTBEAT_INTERVAL_MS = 2_000;

export function heartbeatHealth(
  now: number,
  lastSeenAt: number | null,
): "live" | "stale" | "dead" {
  if (lastSeenAt == null) return "dead";
  const age = now - lastSeenAt;
  if (age >= HEARTBEAT_DEAD_MS) return "dead";
  if (age >= HEARTBEAT_STALE_MS) return "stale";
  return "live";
}

/**
 * Advance the Tesla-side state on a 1 Hz tick. Only the live states are
 * affected: pairing/connecting/disconnected states change on events, not time.
 */
export function tickRemoteState(
  current: RemoteState,
  now: number,
  lastSeenAt: number | null,
): RemoteState {
  if (current !== "connected" && current !== "reconnecting") return current;
  const health = heartbeatHealth(now, lastSeenAt);
  if (health === "live") return "connected";
  if (health === "stale") return "reconnecting";
  return "session_expired";
}

/** True when the Tesla should drop back to direct-control mode. */
export function shouldReturnToDirectMode(s: RemoteState): boolean {
  return s === "session_expired" || s === "disconnected_by_user";
}

export function remoteStateLabel(s: RemoteState): string {
  switch (s) {
    case "disconnected":
      return "Not paired";
    case "pairing":
      return "Creating pairing code…";
    case "connecting":
      return "Waiting for phone…";
    case "connected":
      return "Phone connected";
    case "reconnecting":
      return "Reconnecting…";
    case "disconnected_by_user":
      return "Disconnected";
    case "session_expired":
      return "Phone connection lost";
    case "error":
      return "Connection error";
  }
}
