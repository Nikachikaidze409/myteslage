import { useEffect, useRef, useState } from "react";
import type { Fix } from "./StatusPanel";
import { geoTracker } from "@/lib/maps/geoTracker";

interface Props {
  onFix: (f: Fix) => void;
  onError: (msg: string) => void;
  active: boolean;
  onActiveChange: (v: boolean) => void;
}

/**
 * Owns nothing but the on/off switch: the actual watcher lives in geoTracker
 * so exactly one exists for the whole app. The UI here only receives a
 * throttled reading for the status panel and route logic.
 */
export function LocationButton({ onFix, onError, active, onActiveChange }: Props) {
  const releaseRef = useRef<(() => void) | null>(null);
  const [pending, setPending] = useState(false);

  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;

  useEffect(() => {
    if (!active) {
      releaseRef.current?.();
      releaseRef.current = null;
      setPending(false);
      return;
    }

    setPending(true);
    const stopWatch = geoTracker.start();
    // ~1 Hz is plenty for ETA, distance and the status panel.
    const offFix = geoTracker.subscribe(
      (f) => {
        setPending(false);
        onFixRef.current({
          lat: f.lat,
          lng: f.lng,
          accuracy: f.accuracy,
          heading: f.heading,
          speed: f.speed,
          timestamp: f.timestamp,
          source: f.source === "phone" ? "phone" : "geolocation",
        });
      },
      { minIntervalMs: 1000 },
    );
    const offErr = geoTracker.onError((msg, code) => {
      if (code !== 3) setPending(false);
      if (code === 1) onActiveRef.current(false);
      onErrorRef.current(msg);
    });

    releaseRef.current = () => {
      offFix();
      offErr();
      stopWatch();
    };
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [active]);

  return (
    <button
      onClick={() => onActiveChange(!active)}
      className="font-display h-14 w-full rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 active:scale-[0.98]"
    >
      {pending ? "Searching for live GPS…" : active ? "Tracking on" : "Start tracking"}
    </button>
  );
}
