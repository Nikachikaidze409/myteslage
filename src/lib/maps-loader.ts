let loaderPromise: Promise<any> | null = null;

type AuthFailureListener = (message: string) => void;
const authFailureListeners = new Set<AuthFailureListener>();
let authFailed = false;

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

export function getMapsApiKey(): string | undefined {
  const own = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const connector = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  return (own && own.trim()) || connector;
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (loaderPromise) return loaderPromise;

  const key = getMapsApiKey();
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Missing Google Maps browser key"));

  // Google calls this global when the key is rejected (e.g. domain not allowed).
  (window as any).gm_authFailure = () => {
    authFailed = true;
    const message = authFailureMessage();
    authFailureListeners.forEach((cb) => cb(message));
  };

  loaderPromise = new Promise((resolve, reject) => {
    (window as any).__initGmaps = () => resolve((window as any).google);
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
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}
