import { useCallback, useEffect, useRef, useState } from "react";
import type { Fix } from "@/components/StatusPanel";

export type LocationStatus = "idle" | "starting" | "live" | "denied" | "unavailable";

/**
 * The single authoritative live-location stream.
 *
 * Mounted once at the top of the map screen so it is completely independent of
 * the sidebar, HUD mode, 2D/3D switching and route changes. Exactly one
 * `watchPosition` watcher exists for the lifetime of the screen; nothing in the
 * UI can restart or duplicate it.
 */
export function useLiveLocation(onFix: (f: Fix) => void) {
  const watchId = useRef<number | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("This browser does not expose the Geolocation API.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("unavailable");
      setError("Geolocation needs a secure (HTTPS) context. This page is not secure.");
      return;
    }
    // One watcher, ever. A second call is a no-op instead of a new prompt.
    if (watchId.current != null) return;
    setStatus("starting");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("live");
        setError(null);
        onFixRef.current({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
          source: "geolocation",
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // Never re-prompt in a loop: drop the watcher and stay denied.
          if (watchId.current != null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
          }
          setStatus("denied");
        } else if (err.code !== err.TIMEOUT) {
          setStatus("unavailable");
        }
        setError(describeError(err));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, []);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setStatus("idle");
  }, []);

  // Auto-start once. If the permission is already granted we start silently;
  // otherwise we still start (the browser shows its own one-time prompt).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    const perms = (navigator as any)?.permissions;
    if (perms?.query) {
      perms
        .query({ name: "geolocation" as PermissionName })
        .then((p: PermissionStatus) => {
          if (cancelled) return;
          if (p.state === "denied") {
            setStatus("denied");
            setError("Location permission is blocked in the browser settings.");
          } else {
            start();
          }
          p.onchange = () => {
            if (p.state === "granted") start();
            if (p.state === "denied") {
              stop();
              setStatus("denied");
            }
          };
        })
        .catch(() => !cancelled && start());
    } else {
      start();
    }
    return () => {
      cancelled = true;
    };
  }, [start, stop]);

  // Tear the watcher down only when the screen itself unmounts.
  useEffect(() => () => stop(), [stop]);

  return { status, error, start, stop };
}

function describeError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Permission denied. Enable location access in the Tesla browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "Position unavailable. The browser could not determine a location.";
    case err.TIMEOUT:
      return "Still searching for a live GPS fix. Keep this page open.";
    default:
      return err.message || "Unknown geolocation error.";
  }
}
