import { memo, useState } from "react";
import { searchNearby } from "@/lib/places.functions";
import { decodePolyline } from "@/lib/geo";

// Simple Model 3 Long Range assumption for planning UI
const FULL_RANGE_KM = 500;
const SAFETY_BUFFER = 0.85; // stop when we'd be at 15% or lower

interface Props {
  routeKm: number | null;
  encodedPolyline: string | null;
  onAddStop: (stop: { lat: number; lng: number; name: string }) => void;
}

function BatteryPanelImpl({ routeKm, encodedPolyline, onAddStop }: Props) {
  const [battery, setBattery] = useState(80);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rangeKm = (battery / 100) * FULL_RANGE_KM;
  const usable = rangeKm * SAFETY_BUFFER;
  const needsCharge = routeKm != null && routeKm > usable;

  const planStop = async () => {
    if (!encodedPolyline) return;
    const path = decodePolyline(encodedPolyline);
    if (path.length < 2) return;
    // find point along path at ~usable distance from origin
    let acc = 0;
    let target = path[Math.floor(path.length / 2)];
    for (let i = 1; i < path.length; i++) {
      const R = 6371;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const a = path[i - 1];
      const b = path[i];
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      const seg = 2 * R * Math.asin(Math.sqrt(h));
      acc += seg;
      if (acc >= usable) {
        target = b;
        break;
      }
    }
    setLoading(true);
    setMsg(null);
    try {
      const { places } = await searchNearby({
        data: {
          lat: target.lat,
          lng: target.lng,
          category: "supercharger",
          textQuery: "Tesla Supercharger",
          radiusMeters: 30000,
        },
      });
      const stop = places[0];
      if (!stop) {
        setMsg("No supercharger found nearby. Try a shorter leg.");
        return;
      }
      onAddStop({ lat: stop.lat, lng: stop.lng, name: stop.name });
      setMsg(`Added ${stop.name}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to find charger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Battery · range
        </div>
        <div className="font-display text-sm font-bold text-primary">
          {Math.round(rangeKm)} km
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-lg">⚡</span>
        <input
          type="range"
          min={5}
          max={100}
          value={battery}
          onChange={(e) => setBattery(parseInt(e.target.value, 10))}
          className="w-full accent-[color:var(--primary)]"
        />
        <span className="w-10 text-right font-display text-sm font-bold text-foreground">
          {battery}%
        </span>
      </div>

      {routeKm != null && (
        <div className="mt-3 text-xs">
          {needsCharge ? (
            <div className="text-[color:var(--bad)]">
              Route is {routeKm.toFixed(0)} km - needs a charging stop.
            </div>
          ) : (
            <div className="text-[color:var(--good,#16a34a)]">
              Route is {routeKm.toFixed(0)} km - you can make it on current charge.
            </div>
          )}
        </div>
      )}

      {needsCharge && (
        <button
          type="button"
          onClick={planStop}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Finding supercharger…" : "Add supercharger stop"}
        </button>
      )}
      {msg && <div className="mt-2 text-[11px] text-muted-foreground">{msg}</div>}
    </div>
  );
}

export const BatteryPanel = memo(BatteryPanelImpl);
