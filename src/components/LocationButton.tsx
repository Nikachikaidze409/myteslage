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

  // Auto-start when parent flips `active` on (e.g. session restore after Tesla reverse).
  useEffect(() => {
    if (active && watchId.current == null) start();
    if (!active && watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const stop = () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setPending(false);
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
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setPending(true);
    onActiveChange(true);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPending(false);
        onFix({
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
        if (err.code !== err.TIMEOUT) setPending(false);
        if (err.code === err.PERMISSION_DENIED) onActiveChange(false);
        onError(describeError(err));
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  };

  return (
    <button
      onClick={active ? stop : start}
      className="font-display h-14 w-full rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 active:scale-[0.98]"
    >
      {pending ? "Searching for live GPS…" : active ? "Stop tracking" : "Detect live location"}
    </button>
  );
}

function describeError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Permission denied. Enable location access in the Tesla browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "Position unavailable. The browser could not determine a location - Wi-Fi/cell signals may be insufficient.";
    case err.TIMEOUT:
      return "Still searching for a live GPS fix. Keep this page open and pair your phone if the Tesla browser stops updating.";
    default:
      return err.message || "Unknown geolocation error.";
  }
}