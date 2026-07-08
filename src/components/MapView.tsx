import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/maps-loader";
import type { Fix } from "./StatusPanel";

interface Props {
  fix: Fix | null;
  destination: { lat: number; lng: number; name?: string } | null;
  encodedPolyline: string | null;
}

const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };

export function MapView({ fix, destination, encodedPolyline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const meMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const accuracyCircle = useRef<any>(null);
  const routeLine = useRef<any>(null);

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
    const pos = { lat: fix.lat, lng: fix.lng };
    if (!meMarker.current) {
      meMarker.current = new g.maps.Marker({ map, position: pos, title: "You" });
    } else {
      meMarker.current.setPosition(pos);
    }
    if (accuracyCircle.current) accuracyCircle.current.setMap(null);
    accuracyCircle.current = new g.maps.Circle({
      map,
      center: pos,
      radius: fix.accuracy,
      strokeColor: "#ef4444",
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillColor: "#ef4444",
      fillOpacity: 0.12,
    });
    map.panTo(pos);
    if (map.getZoom() < 12) map.setZoom(13);
  }, [fix]);

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
        strokeColor: "#ef4444",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
      const bounds = new g.maps.LatLngBounds();
      path.forEach((p: any) => bounds.extend(p));
      map.fitBounds(bounds, 60);
    }
  }, [encodedPolyline]);

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