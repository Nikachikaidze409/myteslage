/**
 * Meta Pixel helpers.
 *
 * The base pixel (fbq init + PageView) is loaded once in src/routes/__root.tsx,
 * so `window.fbq` exists before any route component runs. These helpers only
 * add conversion events, and every Purchase is de-duplicated so a page reload,
 * a poll loop or two success paths can never report the same payment twice.
 */

const STORAGE_PREFIX = "tsl.fbq.purchase:";
/** Paddle overlay + Paddle success page must not both count one payment. */
export const PADDLE_RECENT_KEY = "tsl.fbq.purchase:paddle-recent";
const PADDLE_RECENT_WINDOW_MS = 30 * 60 * 1000;

type Fbq = (...args: unknown[]) => void;

function getFbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof fbq === "function" ? fbq : null;
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — event still fired once for this page view */
  }
}

/** True when a Paddle purchase was already reported very recently. */
export function paddlePurchaseRecentlyTracked(now = Date.now()): boolean {
  const raw = readFlag(PADDLE_RECENT_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  return Number.isFinite(ts) && now - ts < PADDLE_RECENT_WINDOW_MS;
}

/**
 * Fires `fbq('track','Purchase', { value, currency })` at most once per
 * `dedupeKey` (a payment order id / Paddle transaction id).
 * Returns true when the event was actually sent.
 */
export function trackPurchaseOnce(
  dedupeKey: string,
  value: number,
  currency: string,
): boolean {
  if (!dedupeKey || !Number.isFinite(value) || value <= 0) return false;
  const storageKey = `${STORAGE_PREFIX}${dedupeKey}`;
  if (readFlag(storageKey)) return false;

  const fbq = getFbq();
  if (!fbq) return false;

  fbq("track", "Purchase", { value, currency }, { eventID: dedupeKey });
  writeFlag(storageKey, String(Date.now()));
  if (currency !== "GEL") writeFlag(PADDLE_RECENT_KEY, String(Date.now()));
  return true;
}

/** Marks a Paddle purchase as reported (used by the overlay callback). */
export function markPaddlePurchaseTracked(now = Date.now()) {
  writeFlag(PADDLE_RECENT_KEY, String(now));
}
