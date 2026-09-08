// Quality-based arbitration between the Tesla browser GPS and a paired phone.
//
// Pure logic: no timers, no React, no side effects. `now` is always supplied by
// the caller so the behaviour is fully deterministic and unit-testable.
//
// Freshness is measured with the LOCAL received time only. The phone and the
// Tesla can have very different device clocks, so `fix.timestamp` is never used
// for comparison — it is passed through untouched to the navigation pipeline.

export type LocationSource = "tesla" | "phone";

export type SwitchReason =
  | "initial-tesla"
  | "initial-phone"
  | "phone-significantly-better"
  | "tesla-stale"
  | "phone-stale"
  | "tesla-recovered"
  | "hud-phone"
  | "hud-phone-stale-fallback";

export interface SourceFix {
  accuracy: number;
  /** "geolocation" (Tesla) | "phone" | anything else is treated as Tesla. */
  source: string;
}

export interface SourceSnapshot {
  hasFix: boolean;
  accuracy: number | null;
  ageMs: number | null;
  score: number;
  stale: boolean;
}

export interface SelectorSnapshot {
  active: LocationSource | null;
  reason: SwitchReason | null;
  sinceSwitchMs: number | null;
  tesla: SourceSnapshot;
  phone: SourceSnapshot;
}

/** A source with no fix for longer than this is stale. */
export const STALE_MS = 8_000;
/** Phone must beat Tesla by this margin before a normal switch is considered. */
const SWITCH_MARGIN = 18;
/** Consecutive qualifying fixes required for a normal switch. */
const REQUIRED_STREAK = 2;
/** After a switch, normal quality comparisons cannot reverse it this soon. */
const SWITCH_LOCK_MS = 2_000;
/** Score Tesla must reach to win the source back. */
const TESLA_RECOVERY_SCORE = 75;
/** Small preferred-source bias for Tesla outside HUD mode. */
const TESLA_BIAS = 8;
/** Bias is only granted to an already decent Tesla fix. */
const TESLA_BIAS_MIN_SCORE = 50;

export function accuracyScore(accuracy: number): number {
  if (!Number.isFinite(accuracy) || accuracy < 0) return 0;
  if (accuracy <= 5) return 100;
  if (accuracy <= 10) return 96;
  if (accuracy <= 20) return 90;
  if (accuracy <= 30) return 82;
  if (accuracy <= 50) return 68;
  if (accuracy <= 100) return 45;
  if (accuracy <= 200) return 20;
  if (accuracy <= 500) return 8;
  return 0;
}

function freshnessPenalty(ageMs: number): number {
  if (ageMs <= 1_500) return 0;
  if (ageMs <= 3_000) return 5;
  if (ageMs <= 5_000) return 15;
  return 35;
}

export function normalizeSource(source: string): LocationSource {
  return source === "phone" ? "phone" : "tesla";
}

interface Track {
  accuracy: number | null;
  receivedAt: number | null;
}

export class LocationSourceSelector {
  private tracks: Record<LocationSource, Track> = {
    tesla: { accuracy: null, receivedAt: null },
    phone: { accuracy: null, receivedAt: null },
  };
  private hud = false;
  private active: LocationSource | null = null;
  private reason: SwitchReason | null = null;
  private lastSwitchAt: number | null = null;
  private streak: Record<LocationSource, number> = { tesla: 0, phone: 0 };

  setHudMode(on: boolean): void {
    this.hud = on;
  }

  get activeSource(): LocationSource | null {
    return this.active;
  }

  /**
   * Offer a freshly received fix. Returns true when this fix comes from the
   * source that should drive the navigation pipeline.
   */
  offer(fix: SourceFix, now: number): boolean {
    const src = normalizeSource(fix.source);
    this.tracks[src] = { accuracy: fix.accuracy, receivedAt: now };
    this.decide(src, now);
    return this.active === src;
  }

  snapshot(now: number): SelectorSnapshot {
    return {
      active: this.active,
      reason: this.reason,
      sinceSwitchMs: this.lastSwitchAt == null ? null : now - this.lastSwitchAt,
      tesla: this.describe("tesla", now),
      phone: this.describe("phone", now),
    };
  }

  // ---- internals ---------------------------------------------------------

  private describe(src: LocationSource, now: number): SourceSnapshot {
    const t = this.tracks[src];
    if (t.receivedAt == null || t.accuracy == null) {
      return { hasFix: false, accuracy: null, ageMs: null, score: 0, stale: true };
    }
    const age = now - t.receivedAt;
    return {
      hasFix: true,
      accuracy: t.accuracy,
      ageMs: age,
      score: this.score(src, now),
      stale: age > STALE_MS,
    };
  }

  private score(src: LocationSource, now: number): number {
    const t = this.tracks[src];
    if (t.receivedAt == null || t.accuracy == null) return 0;
    const age = now - t.receivedAt;
    if (age > STALE_MS) return 0;
    const raw = accuracyScore(t.accuracy);
    let s = raw - freshnessPenalty(age);
    if (!this.hud && src === "tesla" && raw >= TESLA_BIAS_MIN_SCORE) s += TESLA_BIAS;
    return Math.max(0, Math.min(100, s));
  }

  private fresh(src: LocationSource, now: number): boolean {
    const t = this.tracks[src];
    return t.receivedAt != null && now - t.receivedAt <= STALE_MS;
  }

  private usable(src: LocationSource, now: number): boolean {
    return this.fresh(src, now) && this.score(src, now) > 0;
  }

  private locked(now: number): boolean {
    return this.lastSwitchAt != null && now - this.lastSwitchAt < SWITCH_LOCK_MS;
  }

  private commit(src: LocationSource, reason: SwitchReason, now: number): void {
    if (this.active !== src) this.lastSwitchAt = now;
    this.active = src;
    this.reason = reason;
    this.streak.tesla = 0;
    this.streak.phone = 0;
  }

  private decide(incoming: LocationSource, now: number): void {
    const teslaUsable = this.usable("tesla", now);
    const phoneUsable = this.usable("phone", now);

    // HUD mode: the phone is the navigation brain, so it leads while fresh.
    if (this.hud) {
      if (phoneUsable) {
        if (this.active !== "phone" || this.reason !== "hud-phone") {
          this.commit("phone", "hud-phone", now);
        }
      } else if (teslaUsable) {
        this.commit("tesla", "hud-phone-stale-fallback", now);
      }
      return;
    }

    if (this.active == null) {
      if (incoming === "tesla" && teslaUsable) this.commit("tesla", "initial-tesla", now);
      else if (incoming === "phone" && phoneUsable) this.commit("phone", "initial-phone", now);
      return;
    }

    if (this.active === "tesla") {
      // Tesla gone quiet: the phone takes over at once (stale bypasses the lock).
      if (!this.fresh("tesla", now) && phoneUsable) {
        this.commit("phone", "tesla-stale", now);
        return;
      }
      if (incoming !== "phone") return;
      const better =
        phoneUsable && this.score("phone", now) - this.score("tesla", now) >= SWITCH_MARGIN;
      if (!better) {
        this.streak.phone = 0;
        return;
      }
      this.streak.phone++;
      if (this.streak.phone >= REQUIRED_STREAK && !this.locked(now)) {
        this.commit("phone", "phone-significantly-better", now);
      }
      return;
    }

    // active === "phone"
    if (!this.fresh("phone", now) && teslaUsable) {
      this.commit("tesla", "phone-stale", now);
      return;
    }
    if (incoming !== "tesla") return;
    const good = teslaUsable && this.score("tesla", now) >= TESLA_RECOVERY_SCORE;
    if (!good) {
      this.streak.tesla = 0;
      return;
    }
    this.streak.tesla++;
    if (this.streak.tesla >= REQUIRED_STREAK && !this.locked(now)) {
      this.commit("tesla", "tesla-recovered", now);
    }
  }
}
