// One authoritative gate for every route request that reaches Google.
//
// Priorities: REROUTE > USER (new destination / avoid / waypoints) > TRAFFIC.
// A lower-priority request can never start while a higher one is running, and
// identical requests are de-duplicated instead of being sent twice.

import { countApi } from "./apiUsage";

export type RoutePurpose = "reroute" | "user" | "traffic";

const PRIORITY: Record<RoutePurpose, number> = { reroute: 3, user: 2, traffic: 1 };

/** Repeating the exact same traffic refresh sooner than this is pointless. */
const TRAFFIC_DEDUPE_MS = 60_000;

export interface RouteTicket {
  id: number;
  purpose: RoutePurpose;
  signal: AbortSignal;
}

interface Active extends RouteTicket {
  fingerprint: string;
  controller: AbortController;
}

export function routeFingerprint(input: {
  purpose: RoutePurpose;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  avoid?: string[];
  avoidUnpaved?: boolean;
}): string {
  // ~100 m origin resolution: tiny GPS movement must not look like a new request.
  const o = `${input.origin.lat.toFixed(3)},${input.origin.lng.toFixed(3)}`;
  const d = `${input.destination.lat.toFixed(5)},${input.destination.lng.toFixed(5)}`;
  const w = (input.waypoints ?? []).map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  const a = [...(input.avoid ?? [])].sort().join(",");
  return `${input.purpose}#${o}#${d}#${w}#${a}#${input.avoidUnpaved ? 1 : 0}`;
}

export class RouteRequestController {
  private active: Active | null = null;
  private nextId = 1;
  private lastDone = new Map<string, number>();

  /** True while a reroute is being computed. */
  get rerouting(): boolean {
    return this.active?.purpose === "reroute";
  }

  get busy(): boolean {
    return this.active !== null;
  }

  /**
   * Ask for permission to send a request. Returns null when the request is a
   * duplicate or is outranked by one already running.
   */
  begin(purpose: RoutePurpose, fingerprint: string): RouteTicket | null {
    const active = this.active;
    if (active) {
      const sameOrLower = PRIORITY[purpose] <= PRIORITY[active.purpose];
      if (active.fingerprint === fingerprint || sameOrLower) {
        countApi("route.duplicate");
        return null;
      }
      // Higher priority (a reroute) takes over.
      active.controller.abort();
      this.active = null;
    }

    if (purpose === "traffic") {
      const doneAt = this.lastDone.get(fingerprint);
      if (doneAt && Date.now() - doneAt < TRAFFIC_DEDUPE_MS) {
        countApi("route.duplicate");
        return null;
      }
    }

    const controller = new AbortController();
    const ticket: Active = {
      id: this.nextId++,
      purpose,
      fingerprint,
      controller,
      signal: controller.signal,
    };
    this.active = ticket;
    countApi(
      purpose === "reroute" ? "route.reroute" : purpose === "traffic" ? "route.traffic" : "route.request",
    );
    return { id: ticket.id, purpose, signal: ticket.signal };
  }

  /** Only the newest accepted request may write application state. */
  isCurrent(id: number): boolean {
    return this.active?.id === id;
  }

  finish(id: number): void {
    if (this.active?.id !== id) {
      countApi("route.stale");
      return;
    }
    this.lastDone.set(this.active.fingerprint, Date.now());
    this.active = null;
  }

  /** Give up on whatever is running (trip stopped, screen unmounted). */
  cancelAll(): void {
    this.active?.controller.abort();
    this.active = null;
  }
}
