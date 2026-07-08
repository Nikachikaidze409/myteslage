import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/maps-loader";
import type { Fix } from "./StatusPanel";
import { snapToRoad } from "@/lib/snap-to-road.functions";

interface Props {
  fix: Fix | null;
  destination: { lat: number; lng: number; name?: string } | null;
  encodedPolyline: string | null;
  navigating?: boolean;
}

const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };

export function MapView({ fix, destination, encodedPolyline, navigating }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const meMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const accuracyCircle = useRef<any>(null);
  const routeLine = useRef<any>(null);
  const lastPolylineRef = useRef<string | null>(null);
  // Smooth-animation state — tween marker from previous rendered pos to newest fix.
  const rafRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentHeadingRef = useRef<number>(0);
  const snapInFlightRef = useRef(false);
  const lastSnapAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 7,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: DARK_STYLE,
        });
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map || !fix) return;
    const rawPos = { lat: fix.lat, lng: fix.lng };

    // Ensure the marker exists at the raw position on first fix.
    if (!meMarker.current) {
      meMarker.current = new g.maps.Marker({
        map,
        position: rawPos,
        title: "You",
        icon: {
          path: fix.heading == null ? g.maps.SymbolPath.CIRCLE : g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: fix.heading == null ? 9 : 6,
          rotation: fix.heading ?? 0,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        zIndex: 1000,
      });
      currentPosRef.current = rawPos;
    }

    // Accuracy circle — reuse instance instead of recreating (was flashing every tick).
    if (!accuracyCircle.current) {
      accuracyCircle.current = new g.maps.Circle({
        map,
        center: rawPos,
        radius: fix.accuracy,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
      });
    } else {
      accuracyCircle.current.setRadius(fix.accuracy);
    }

    // Kick off (or update) an animation toward the newest target.
    const startTargetTween = (target: { lat: number; lng: number }, headingDeg: number | null) => {
      const startPos = currentPosRef.current ?? target;
      const startHeading = currentHeadingRef.current;
      const endHeading = headingDeg ?? startHeading;
      // Shortest rotation direction
      let dh = endHeading - startHeading;
      while (dh > 180) dh -= 360;
      while (dh < -180) dh += 360;
      const t0 = performance.now();
      const duration = 900; // ~ matches the phone's 1 Hz stream
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = t; // linear — car speed feels natural without easing
        const lat = startPos.lat + (target.lat - startPos.lat) * eased;
        const lng = startPos.lng + (target.lng - startPos.lng) * eased;
        const heading = startHeading + dh * eased;
        currentPosRef.current = { lat, lng };
        currentHeadingRef.current = heading;
        meMarker.current?.setPosition({ lat, lng });
        meMarker.current?.setIcon({
          path: headingDeg == null ? g.maps.SymbolPath.CIRCLE : g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: headingDeg == null ? 9 : 6,
          rotation: heading,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        });
        accuracyCircle.current?.setCenter({ lat, lng });
        if (navigating) {
          map.panTo({ lat, lng });
          if (headingDeg != null) map.setHeading(heading);
        } else {
          map.panTo({ lat, lng });
        }
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else rafRef.current = null;
      };
      rafRef.current = requestAnimationFrame(step);
    };

    // Snap to nearest road (throttled) when navigating — hides GPS jitter.
    const useTarget = (target: { lat: number; lng: number }) => {
      startTargetTween(target, fix.heading ?? null);
      if (navigating) {
        if (map.getZoom() < 16) map.setZoom(17);
      } else if (map.getZoom() < 12) {
        map.setZoom(13);
      }
    };

    const nowMs = Date.now();
    if (navigating && !snapInFlightRef.current && nowMs - lastSnapAtRef.current > 800) {
      snapInFlightRef.current = true;
      lastSnapAtRef.current = nowMs;
      snapToRoad({ data: { lat: rawPos.lat, lng: rawPos.lng } })
        .then((snapped) => {
          useTarget({ lat: snapped.lat, lng: snapped.lng });
        })
        .catch(() => {
          useTarget(rawPos);
        })
        .finally(() => {
          snapInFlightRef.current = false;
        });
    } else {
      useTarget(rawPos);
    }
  }, [fix, navigating]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (destMarker.current) {
      destMarker.current.setMap(null);
      destMarker.current = null;
    }
    if (destination) {
      destMarker.current = new g.maps.Marker({
        map,
        position: destination,
        title: destination.name ?? "Destination",
      });
    }
  }, [destination]);

  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (routeLine.current) {
      routeLine.current.setMap(null);
      routeLine.current = null;
    }
    if (encodedPolyline && g.maps.geometry) {
      const path = g.maps.geometry.encoding.decodePath(encodedPolyline);
      routeLine.current = new g.maps.Polyline({
        map,
        path,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.9,
        strokeWeight: 6,
      });
      // Only fit bounds when the route polyline actually changes and we're not in live-follow mode
      if (!navigating && lastPolylineRef.current !== encodedPolyline) {
        const bounds = new g.maps.LatLngBounds();
        path.forEach((p: any) => bounds.extend(p));
        map.fitBounds(bounds, 60);
      }
      lastPolylineRef.current = encodedPolyline;
    } else {
      lastPolylineRef.current = null;
    }
  }, [encodedPolyline, navigating]);

  return <div ref={containerRef} className="h-full w-full rounded-xl bg-muted" />;
}

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1f2124" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1f2124" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa0a6" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2d31" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3d42" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1114" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];