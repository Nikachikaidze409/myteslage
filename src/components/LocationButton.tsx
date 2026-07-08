import { useEffect, useRef, useState } from "react";
import type { Fix } from "./StatusPanel";

interface Props {
  onFix: (f: Fix) => void;
  onError: (msg: string) => void;
  active: boolean;
  onActiveChange: (v: boolean) => void;
}

export function LocationButton({ onFix, onError, active, onActiveChange }: Props) {
  const watchId = useRef<number | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return () => {
      if (watchId.current != null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  const stop = () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    onActiveChange(false);
  };

  const start = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onError("This browser does not expose the Geolocation API.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      onError("Geolocation needs a secure (HTTPS) context. This page is not secure.");
      return;
    }
    setPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPending(false);
        onFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          source: "geolocation",
        });
        watchId.current = navigator.geolocation.watchPosition(
          (p) =>
            onFix({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: p.coords.accuracy,
              timestamp: p.timestamp,
              source: "geolocation",
            }),
          (err) => onError(describeError(err)),
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
        );
        onActiveChange(true);
      },
      (err) => {
        setPending(false);
        onError(describeError(err));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  };

  return (
    <button
      onClick={active ? stop : start}
      disabled={pending}
      className="h-16 w-full rounded-xl bg-primary px-8 text-lg font-semibold text-primary-foreground shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? "Requesting…" : active ? "Stop tracking" : "Detect my location"}
    </button>
  );
}

function describeError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Permission denied. Enable location access in the Tesla browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "Position unavailable. The browser could not determine a location — Wi-Fi/cell signals may be insufficient.";
    case err.TIMEOUT:
      return "Timed out waiting for a location fix.";
    default:
      return err.message || "Unknown geolocation error.";
  }
}