// Lightweight, development-only counters for Google API usage.
// No secrets, no network, no timers: just increments plus a console snapshot
// when ?navdebug=1 is on. Makes a future billing spike easy to explain.

export type UsageKey =
  | "route.request"
  | "route.reroute"
  | "route.traffic"
  | "route.duplicate"
  | "route.stale"
  | "roads.snap"
  | "places.autocomplete"
  | "places.details"
  | "places.nearby"
  | "geocode.reverse";

const counters: Record<string, number> = {};

export function countApi(key: UsageKey): void {
  counters[key] = (counters[key] ?? 0) + 1;
}

export function apiUsageSnapshot(): Record<string, number> {
  return { ...counters };
}

export function resetApiUsage(): void {
  for (const k of Object.keys(counters)) delete counters[k];
}
