import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps-loader";
import type { Fix } from "./StatusPanel";
import { snapToRoad } from "@/lib/snap-to-road.functions";

interface Props {
  fix: Fix | null;
  destination: { lat: number; lng: number; name?: string } | null;
  encodedPolyline: string | null;
  navigating?: boolean;
  showTraffic?: boolean;
  waypoints?: { lat: number; lng: number; name?: string }[];
  alternates?: { encodedPolyline: string; index: number }[];
  onSelectAlternate?: (index: number) => void;
  /** Increment to programmatically trigger recenter-on-me from a parent. */
  recenterSignal?: number;
}

const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };

export function MapView({ fix, destination, encodedPolyline, navigating, showTraffic, waypoints, alternates, onSelectAlternate, recenterSignal }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const meMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const waypointMarkersRef = useRef<any[]>([]);
  const trafficLayerRef = useRef<any>(null);
  const accuracyCircle = useRef<any>(null);
  const routeLine = useRef<any>(null);
  const altLinesRef = useRef<any[]>([]);
  const lastPolylineRef = useRef<string | null>(null);
  // Smooth-animation state — tween marker from previous rendered pos to newest fix.
  const rafRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentHeadingRef = useRef<number>(0);
  const snapInFlightRef = useRef(false);
  const lastSnapAtRef = useRef(0);
  const haloOverlayRef = useRef<any>(null);
  const haloElRef = useRef<HTMLDivElement | null>(null);
  // Follow-me camera mode. True = camera tracks the car; false = user is panning/zooming freely.
  const followRef = useRef<boolean>(false);
  const programmaticMoveRef = useRef<boolean>(false);
  const [followUi, setFollowUi] = useState(false);

  const recenterOnMe = () => {
    const g = (window as any).google;
    const map = mapRef.current;
    const pos = currentPosRef.current;
    if (!g || !map || !pos) return;
    followRef.current = true;
    setFollowUi(true);
    programmaticMoveRef.current = true;
    map.panTo(pos);
    if (map.getZoom() < 16) map.setZoom(17);
    // Release the guard on the next tick so subsequent user drags disable follow.
    setTimeout(() => (programmaticMoveRef.current = false), 250);
  };

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
          styles: LIGHT_STYLE,
          backgroundColor: "#f1f5f9",
        });

        // Any user drag disables follow-me so the camera doesn't fight the finger.
        mapRef.current.addListener("dragstart", () => {
          if (programmaticMoveRef.current) return;
          if (followRef.current) {
            followRef.current = false;
            setFollowUi(false);
          }
        });

        // Pulsing halo overlay under the "you are here" marker.
        const el = document.createElement("div");
        el.className = "gps-halo";
        el.innerHTML =
          '<span class="gps-halo-ring"></span><span class="gps-halo-ring" style="animation-delay:1s"></span>';
        haloElRef.current = el;

        class HaloOverlay extends g.maps.OverlayView {
          onAdd() {
            const pane = (this as any).getPanes()?.overlayLayer as HTMLElement | undefined;
            if (pane && el) pane.appendChild(el);
          }
          draw() {
            const proj = (this as any).getProjection();
            const pos = currentPosRef.current;
            if (!proj || !pos || !el) return;
            const p = proj.fromLatLngToDivPixel(new g.maps.LatLng(pos.lat, pos.lng));
            if (!p) return;
            el.style.left = `${p.x}px`;
            el.style.top = `${p.y}px`;
          }
          onRemove() {
            if (el?.parentNode) el.parentNode.removeChild(el);
          }
        }
        haloOverlayRef.current = new HaloOverlay();
        haloOverlayRef.current.setMap(mapRef.current);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
      if (haloOverlayRef.current) {
        haloOverlayRef.current.setMap(null);
        haloOverlayRef.current = null;
      }
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
        trafficLayerRef.current = null;
      }
    };
  }, []);

  // Turn follow on when navigation starts; off when it stops.
  useEffect(() => {
    followRef.current = !!navigating;
    setFollowUi(!!navigating);
    if (navigating && currentPosRef.current) {
      const map = mapRef.current;
      if (map) {
        programmaticMoveRef.current = true;
        map.panTo(currentPosRef.current);
        if (map.getZoom() < 16) map.setZoom(17);
        setTimeout(() => (programmaticMoveRef.current = false), 250);
      }
    }
  }, [navigating]);

  // Parent-triggered recenter.
  useEffect(() => {
    if (recenterSignal == null) return;
    recenterOnMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  // Traffic overlay toggle
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new g.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
  }, [showTraffic]);

  // Waypoint markers (e.g. supercharger stops)
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    for (const m of waypointMarkersRef.current) m.setMap(null);
    waypointMarkersRef.current = [];
    for (const w of waypoints ?? []) {
      waypointMarkersRef.current.push(
        new g.maps.Marker({
          map,
          position: { lat: w.lat, lng: w.lng },
          title: w.name ?? "Stop",
          label: { text: "⚡", fontSize: "18px" },
        }),
      );
    }
  }, [waypoints]);

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
        // Nudge the halo overlay to follow the tween.
        haloOverlayRef.current?.draw?.();
        if (followRef.current) {
          programmaticMoveRef.current = true;
          map.panTo({ lat, lng });
          if (headingDeg != null) map.setHeading(heading);
          // Release guard shortly after — dragstart during a pan tween is a real user gesture.
          setTimeout(() => (programmaticMoveRef.current = false), 50);
        }
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else rafRef.current = null;
      };
      rafRef.current = requestAnimationFrame(step);
    };

    // Snap to nearest road (throttled) when navigating — hides GPS jitter.
    const useTarget = (target: { lat: number; lng: number }) => {
      startTargetTween(target, fix.heading ?? null);
      // Never force zoom on plain fixes — user's pinch/scroll should always win.
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
    // Clear old alternates
    for (const l of altLinesRef.current) l.setMap(null);
    altLinesRef.current = [];
    if (g.maps.geometry && alternates) {
      for (const alt of alternates) {
        if (!alt.encodedPolyline || alt.encodedPolyline === encodedPolyline) continue;
        const path = g.maps.geometry.encoding.decodePath(alt.encodedPolyline);
        const line = new g.maps.Polyline({
          map,
          path,
          strokeColor: "#94a3b8",
          strokeOpacity: 0.75,
          strokeWeight: 5,
          zIndex: 1,
          clickable: true,
        });
        line.addListener("click", () => onSelectAlternate?.(alt.index));
        altLinesRef.current.push(line);
      }
    }
  }, [alternates, encodedPolyline, onSelectAlternate]);

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
        zIndex: 5,
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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-2xl bg-muted" />
      <button
        type="button"
        onClick={recenterOnMe}
        aria-label="Center on my location"
        title="My location"
        className={`absolute bottom-8 left-4 z-30 flex items-center gap-2 rounded-full border px-4 py-2.5 shadow-lg backdrop-blur transition ${
          followUi
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-white/95 text-foreground hover:bg-white"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        <span className="text-sm font-semibold">My location</span>
      </button>
    </div>
  );
}

const LIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eef2f7" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];