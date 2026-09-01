import { getMapsBrowserKey } from "@/lib/maps.functions";

let loaderPromise: Promise<any> | null = null;

type AuthFailureListener = (message: string) => void;
const authFailureListeners = new Set<AuthFailureListener>();
let authFailed = false;

// Cached browser key fetched from the server (project-owned key, referrer-restricted).
let fetchedKey: string | null | undefined = undefined;
let fetchKeyPromise: Promise<string | null> | null = null;

function resolveBrowserKey(): Promise<string | null> {
  if (fetchedKey !== undefined) return Promise.resolve(fetchedKey);
  if (fetchKeyPromise) return fetchKeyPromise;
  fetchKeyPromise = getMapsBrowserKey()
    .then((res) => {
      fetchedKey = res.key ?? null;
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

/** The Lovable-managed connector browser key (authorized on *.lovable.app). */
function getConnectorKey(): string | undefined {
  return import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
}

function authFailureMessage(): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
  return `The map key does not allow ${host}. Add ${host} to the Google Maps API key's allowed websites, or open the app on the Lovable domain.`;
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
  if (typeof window !== "undefined") {
    document
      .querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')
      .forEach((el) => el.remove());
  }
}

export function getMapsApiKey(): string | undefined {
  const own = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const connector = getConnectorKey();
  return (own && own.trim()) || connector;
}

/**
 * Load Google Maps, preferring the project-owned key (covers teslanavi.online).
 * If Google rejects that key (gm_authFailure), fall back once to the
 * Lovable-managed connector key, which is authorized on *.lovable.app.
 */
export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (loaderPromise) return loaderPromise;

  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

  loaderPromise = resolveBrowserKey().then(async (primary) => {
    const connector = getConnectorKey();
    if (!primary && !connector) throw new Error("Missing Google Maps browser key");

    const firstKey = primary ?? connector!;
    try {
      return await loadGoogleMapsWithKey(firstKey, channel);
    } catch (err) {
      // Auth failure (domain not allowed): try the other key once.
      if ((err as Error).message !== "auth") throw err;
      const fallbackKey = firstKey === connector ? primary : connector;
      if (!fallbackKey || fallbackKey === firstKey) throw err;
      resetMapsLoader();
      return await loadGoogleMapsWithKey(fallbackKey, channel);
    }
  });

  // A failed load must not be cached: let the next call try again.
  loaderPromise = loaderPromise.catch((err) => {
    loaderPromise = null;
    throw err;
  });
  return loaderPromise;
}

function loadGoogleMapsWithKey(key: string, channel: string | undefined): Promise<any> {
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

    (window as any).__initGmaps = () => {
      // If Google rejected the key, treat as auth failure so we can fall back.
      done(() => {
        if (authFailed) return reject(new Error("auth"));
        resolve((window as any).google);
      });
    };

    const s = document.createElement("script");
    const params = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      libraries: "places,geometry",
      callback: "__initGmaps",
    });
    if (channel) params.set("channel", channel);
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
