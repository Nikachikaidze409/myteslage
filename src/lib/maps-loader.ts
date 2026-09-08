import { getMapsBrowserKey } from "@/lib/maps.functions";

let loaderPromise: Promise<any> | null = null;

type AuthFailureListener = (message: string) => void;
const authFailureListeners = new Set<AuthFailureListener>();
let authFailed = false;

// The project-owned browser key, fetched once from the server.
let fetchedKey: string | null | undefined = undefined;
let fetchKeyPromise: Promise<string | null> | null = null;
// Version suffix: bump to drop keys cached by an older build.
const KEY_CACHE = "tmg:mapkey:v3";

function cachedKey(): string | null {
  try {
    const v = window.sessionStorage.getItem(KEY_CACHE);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function resolveBrowserKey(): Promise<string | null> {
  if (fetchedKey !== undefined) return Promise.resolve(fetchedKey);
  // Reusing the key within the tab removes a round trip before the map script.
  const cached = cachedKey();
  if (cached) {
    fetchedKey = cached;
    return Promise.resolve(cached);
  }
  if (fetchKeyPromise) return fetchKeyPromise;
  fetchKeyPromise = getMapsBrowserKey()
    .then((res) => {
      fetchedKey = res.key ?? null;
      if (fetchedKey) {
        try {
          window.sessionStorage.setItem(KEY_CACHE, fetchedKey);
        } catch {
          /* storage disabled */
        }
      }
      return fetchedKey;
    })
    .catch(() => {
      fetchedKey = null;
      return null;
    })
    .finally(() => {
      fetchKeyPromise = null;
    });
  return fetchKeyPromise;
}

function authFailureMessage(): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
  return `Google rejected the Maps key on ${host}. Check the key's restrictions and that billing is enabled in Google Cloud.`;
}

/** Subscribe to Google's auth failure callback (invalid key / domain not allowed). */
export function onMapsAuthFailure(cb: AuthFailureListener): () => void {
  authFailureListeners.add(cb);
  if (authFailed) cb(authFailureMessage());
  return () => authFailureListeners.delete(cb);
}

/** A working map wins over a stale rejection: called once a map actually renders. */
export function clearMapsAuthFailure(): void {
  authFailed = false;
}

/** Drop the cached script/promise so the next load starts completely fresh. */
export function resetMapsLoader(): void {
  loaderPromise = null;
  authFailed = false;
  fetchedKey = undefined;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(KEY_CACHE);
    } catch {
      /* storage disabled */
    }
    document
      .querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')
      .forEach((el) => el.remove());
  }
}

/** Build-time key, when one is configured. The server key is the source of truth. */
export function getMapsApiKey(): string | undefined {
  const own = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  return own && own.trim() ? own : undefined;
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (loaderPromise) return loaderPromise;

  loaderPromise = Promise.resolve(getMapsApiKey() ?? null)
    .then((k) => k ?? resolveBrowserKey())
    .then((key) => {
      if (!key) throw new Error("Missing Google Maps browser key");
      return loadGoogleMapsWithKey(key);
    });

  // A failed load must not be cached: let the next call try again.
  loaderPromise = loaderPromise.catch((err) => {
    loaderPromise = null;
    throw err;
  });
  return loaderPromise;
}

function loadGoogleMapsWithKey(key: string): Promise<any> {
  authFailed = false;

  // Google calls this global when the key is rejected (e.g. domain not allowed).
  (window as any).gm_authFailure = () => {
    authFailed = true;
    const message = authFailureMessage();
    authFailureListeners.forEach((cb) => cb(message));
  };

  return new Promise<any>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };

    (window as any).__initGmaps = () => done(() => resolve((window as any).google));

    const s = document.createElement("script");
    const params = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      callback: "__initGmaps",
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => done(() => {
      s.remove();
      reject(new Error("network"));
    });
    // Slow in-car connections: fail fast so we can retry instead of hanging.
    const timer = window.setTimeout(() => done(() => {
      s.remove();
      reject(new Error("timeout"));
    }), 15000);
    document.head.appendChild(s);
  });
}
