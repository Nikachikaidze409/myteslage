import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  pairChannelName,
  type PairedFix,
  type PairedNavState,
  type PairedView,
} from "@/lib/pair-channel";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/remote-state";
import { DestinationSearch, type Destination } from "@/components/DestinationSearch";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { snapToRoad } from "@/lib/snap-to-road.functions";
import { RouteProgressEngine } from "@/lib/maps/routeProgressEngine";
import { decodePolyline } from "@/lib/geo";
import { createMap } from "@/lib/maps/googleMapsService";


export const Route = createFileRoute("/phone/$code")({
  head: () => ({
    meta: [{ title: "Tesla nav - phone remote" }],
  }),
  component: PhoneRelay,
});

type PhoneStatus = "idle" | "starting" | "streaming" | "ended" | "error";

function PhoneRelay() {
  const { code } = Route.useParams();
  const upperCode = code.toUpperCase();
  const [status, setStatus] = useState<PhoneStatus>("idle");
  const [channelStatus, setChannelStatus] = useState("not connected");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<PairedFix | null>(null);
  const [sent, setSent] = useState(0);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [mapControlOn, setMapControlOn] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelReadyRef = useRef(false);
  const watchRef = useRef<number | null>(null);
  const lastFixRef = useRef<PairedFix | null>(null);
  // Set by the routing effect; called on every GPS fix to detect off-route.
  const onFixRef = useRef<((fix: PairedFix) => void) | null>(null);
  const wakeLockRef = useRef<any>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  // True after the user (or the Tesla) deliberately ended the session: no
  // automatic channel re-creation until they explicitly reconnect.
  const userEndedRef = useRef(false);

  // Phone-side map control surface.
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const phoneGoogleRef = useRef<any>(null);
  const phoneMapRef = useRef<any>(null);
  const phoneMarkerRef = useRef<any>(null);
  const phonePolylineRef = useRef<any>(null);
  const phoneFollowRef = useRef(true);
  const lastViewSentRef = useRef(0);
  const sendViewRef = useRef<((follow: boolean) => void) | null>(null);

  const PHONE_KEY = `tesla-nav.phone-autostart.${upperCode}`;
  const DEST_KEY = `tesla-nav.phone-dest.${upperCode}`;

  // Broadcast helper. Buffers if the channel isn't ready yet.
  const broadcast = (
    event: "fix" | "nav" | "nav_clear" | "view" | "heartbeat" | "disconnect",
    payload: unknown,
  ) => {
    const ch = channelRef.current;
    if (!ch || !channelReadyRef.current) return;
    void ch.send({ type: "broadcast", event, payload });
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current != null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const teardownChannel = () => {
    stopHeartbeat();
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    channelReadyRef.current = false;
  };

  /**
   * The realtime channel connects on page load — pairing is "live" as soon as
   * the phone opens the link, even before GPS sharing starts. Supabase keeps
   * the socket alive; on a hard close we re-create the channel once after a
   * short delay unless the session was deliberately ended.
   */
  const connectChannel = () => {
    if (channelRef.current) return;
    const channel = supabase.channel(pairChannelName(upperCode), {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel.on("broadcast", { event: "disconnect" }, () => {
      // The Tesla ended the session: stop GPS and tell the driver.
      userEndedRef.current = true;
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (typeof window !== "undefined") window.localStorage.removeItem(PHONE_KEY);
      teardownChannel();
      setStatus("ended");
      setChannelStatus("disconnected by Tesla");
    });
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setChannelStatus("connected");
        channelReadyRef.current = true;
        // Liveness for the Tesla: ~every 2 s while this page is connected.
        stopHeartbeat();
        broadcast("heartbeat", { t: Date.now() });
        heartbeatRef.current = window.setInterval(
          () => broadcast("heartbeat", { t: Date.now() }),
          HEARTBEAT_INTERVAL_MS,
        );
        const pending = lastFixRef.current;
        if (pending) broadcast("fix", pending);
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        channelReadyRef.current = false;
        setChannelStatus("connection error");
        setError(
          "The live pairing channel could not connect. Check the phone's internet and reload both screens.",
        );
      } else if (s === "CLOSED") {
        channelReadyRef.current = false;
        stopHeartbeat();
        setChannelStatus("closed");
        if (!userEndedRef.current && reconnectTimerRef.current == null) {
          setChannelStatus("reconnecting…");
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            if (channelRef.current) {
              void supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
            connectChannel();
          }, 2000);
        }
      }
    });
  };

  // Connect the channel on mount; full cleanup on unmount.
  useEffect(() => {
    connectChannel();
    return () => {
      userEndedRef.current = true;
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      teardownChannel();
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release?.(); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upperCode]);

  // Restore last destination for this code so a reload resumes the trip.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DEST_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Destination;
      if (typeof d?.lat === "number" && typeof d?.lng === "number") setDestination(d);
    } catch { /* ignore */ }
  }, [DEST_KEY]);

  const requestWakeLock = async () => {
    try {
      const nav = navigator as any;
      if (nav?.wakeLock?.request) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
        setWakeLockOn(true);
        wakeLockRef.current.addEventListener?.("release", () => setWakeLockOn(false));
      }
    } catch { /* ignore */ }
  };

  // NOTE: this MUST stay synchronous up to the navigator.geolocation.watchPosition
  // call. On iOS Safari, any `await` before requesting geolocation breaks the
  // "user activation" from the tap and the browser rejects the call as
  // PERMISSION_DENIED without ever prompting.
  const start = () => {
    setError(null);
    userEndedRef.current = false;
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("This browser has no geolocation.");
      return;
    }
    connectChannel();
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setStatus("starting");

    // Ask for screen wake-lock so the browser tab doesn't get suspended.
    void requestWakeLock();

    // Call watchPosition SYNCHRONOUSLY from the click handler so iOS honours the gesture.
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (typeof window !== "undefined") window.localStorage.setItem(PHONE_KEY, "1");
        const fix: PairedFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        };
        lastFixRef.current = fix;
        setLast(fix);
        setSent((n) => n + 1);
        setStatus("streaming");
        broadcast("fix", fix);
        onFixRef.current?.(fix);
      },

      (err) => {
        if (typeof window !== "undefined") window.localStorage.removeItem(PHONE_KEY);
        setStatus("error");
        if (err.code === 1) {
          setError(
            "This site was blocked from using location. On iPhone: Settings → Safari → Location → Allow, then reload. On Android: tap the address bar's site icon → Permissions → Location → Allow.",
          );
        } else if (err.code === 2) {
          setError("Phone GPS is unavailable. Make sure Location Services is on in system settings.");
        } else {
          setError(err.message || "Geolocation error");
        }
      },
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 20_000 },
    );
  };

  /** Hang up from the phone side: notify the Tesla, stop GPS, close the channel. */
  const disconnect = () => {
    userEndedRef.current = true;
    broadcast("disconnect", { by: "phone" });
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(PHONE_KEY);
    // Give the disconnect message a tick to flush before closing the socket.
    window.setTimeout(teardownChannel, 150);
    setStatus("idle");
    setMapControlOn(false);
    setChannelStatus("disconnected");
  };

  // Auto-resume streaming if this phone already gave permission for this code.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PHONE_KEY) !== "1") return;
    const perms = (navigator as any).permissions;
    if (!perms?.query) return;
    perms
      .query({ name: "geolocation" })
      .then((res: PermissionStatus) => {
        if (res.state === "granted") start();
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upperCode]);

  // ---- phone-side map control surface -------------------------------------
  // A small optional map: panning/zooming it drives the Tesla camera; the
  // Tesla applies the view like a driver gesture (follow camera yields).
  useEffect(() => {
    if (!mapControlOn || !mapContainerRef.current) return;
    let cancelled = false;
    let listeners: any[] = [];
    createMap(mapContainerRef.current)
      .then(({ google, map }) => {
        if (cancelled) return;
        phoneGoogleRef.current = google;
        phoneMapRef.current = map;
        map.setOptions({
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        const c = lastFixRef.current;
        if (c) {
          map.setCenter({ lat: c.lat, lng: c.lng });
          map.setZoom(16);
        }
        const sendView = (follow: boolean) => {
          const now = Date.now();
          if (!follow && now - lastViewSentRef.current < 150) return;
          lastViewSentRef.current = now;
          const ctr = map.getCenter?.();
          if (!ctr) return;
          broadcast("view", {
            lat: ctr.lat(),
            lng: ctr.lng(),
            zoom: map.getZoom?.() ?? 16,
            bearing: map.getHeading?.() ?? 0,
            follow,
            sentAt: now,
          } satisfies PairedView);
        };
        sendViewRef.current = sendView;
        listeners.push(
          map.addListener("drag", () => {
            phoneFollowRef.current = false;
            sendView(false);
          }),
        );
        listeners.push(map.addListener("zoom_changed", () => sendView(phoneFollowRef.current)));
        listeners.push(map.addListener("heading_changed", () => sendView(false)));
      })
      .catch(() => { /* map control is optional; GPS/nav keep working */ });
    return () => {
      cancelled = true;
      sendViewRef.current = null;
      for (const l of listeners) {
        try { l?.remove?.(); } catch { /* ignore */ }
      }
      phoneMapRef.current = null;
      phoneGoogleRef.current = null;
      phoneMarkerRef.current = null;
      phonePolylineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapControlOn]);

  // Keep the phone map's own marker in step with GPS.
  useEffect(() => {
    const map = phoneMapRef.current;
    const g = phoneGoogleRef.current;
    if (!map || !g || !last) return;
    const p = { lat: last.lat, lng: last.lng };
    if (!phoneMarkerRef.current) {
      phoneMarkerRef.current = new g.maps.Marker({ map, position: p, title: "You" });
    } else {
      phoneMarkerRef.current.setPosition(p);
    }
    if (phoneFollowRef.current) map.panTo(p);
  }, [last, mapControlOn]);

  // Draw the active route on the phone map.
  useEffect(() => {
    const map = phoneMapRef.current;
    const g = phoneGoogleRef.current;
    if (!map || !g) return;
    if (!route) {
      phonePolylineRef.current?.setMap(null);
      phonePolylineRef.current = null;
      return;
    }
    const path = decodePolyline(route.encodedPolyline);
    if (!phonePolylineRef.current) {
      phonePolylineRef.current = new g.maps.Polyline({
        map,
        path,
        strokeColor: "#2563eb",
        strokeWeight: 5,
        strokeOpacity: 0.9,
      });
    } else {
      phonePolylineRef.current.setPath(path);
    }
  }, [route, mapControlOn]);

  const recenterOnCar = () => {
    phoneFollowRef.current = true;
    const fix = lastFixRef.current;
    if (fix && phoneMapRef.current) phoneMapRef.current.panTo({ lat: fix.lat, lng: fix.lng });
    sendViewRef.current?.(true);
  };

  // Compute the route once a destination + first fix exist. Refresh only when
  // it can actually change anything: a few minutes apart, after real movement,
  // never near the destination, and never while a request is in flight.
  useEffect(() => {
    if (!destination) {
      setRoute(null);
      broadcast("nav_clear", null);
      if (typeof window !== "undefined") window.localStorage.removeItem(DEST_KEY);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEST_KEY, JSON.stringify(destination));
    }
    let cancelled = false;
    let interval: number | null = null;
    let lastComputeAt = 0;
    let inFlight = false;
    let inFlightPurpose: "user" | "traffic" | "reroute" | null = null;
    let requestSeq = 0;
    let lastOrigin: { lat: number; lng: number } | null = null;
    // Snap the destination once per destination, then reuse it.
    let snappedDest: { lat: number; lng: number } | null = null;
    // Local copy of the active route (React state inside this closure can be stale).
    let activeRoute: RouteResult | null = null;
    // The SAME decision engine the Tesla screen uses: identical maneuver
    // detection, adaptive thresholds, fast path and anti-flapping. The phone
    // stays the routing brain; only the algorithm is shared.
    const progress = new RouteProgressEngine();

    const MIN_REFRESH_MS = 240_000;
    const MIN_MOVE_M = 2_000;
    const NEAR_DEST_M = 3_000;

    const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const dLat = ((b.lat - a.lat) * Math.PI) / 180;
      const dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const lat1 = (a.lat * Math.PI) / 180;
      const lat2 = (b.lat * Math.PI) / 180;
      const h =
        Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const compute = async (purpose: "user" | "traffic" | "reroute") => {
      const fix = lastFixRef.current;
      if (!fix) return;
      if (inFlight) {
        // A reroute outranks a background refresh: let it start, the older
        // response is discarded by the sequence check below.
        if (!(purpose === "reroute" && inFlightPurpose === "traffic")) return;
      }
      const seq = ++requestSeq;
      inFlight = true;
      inFlightPurpose = purpose;
      const loud = purpose === "user";
      if (loud) setRouteBusy(true);
      setRouteError(null);
      if (purpose === "reroute") {
        setRerouting(true);
        if (activeRoute) {
          // Always rebroadcast the actual active route — never zeros/empty
          // steps from stale React state.
          broadcast("nav", {
            destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
            encodedPolyline: activeRoute.encodedPolyline,
            distanceMeters: activeRoute.distanceMeters,
            durationSeconds: activeRoute.durationSeconds,
            steps: activeRoute.steps,
            isRerouting: true,
            updatedAt: Date.now(),
          } satisfies PairedNavState);
        }
      }
      try {
        if (!snappedDest) {
          snappedDest = await snapToRoad({ data: { lat: destination.lat, lng: destination.lng } })
            .then((s) => ({ lat: s.lat, lng: s.lng }))
            .catch(() => ({ lat: destination.lat, lng: destination.lng }));
        }
        const resp = await computeRoute({
          data: {
            origin: { lat: fix.lat, lng: fix.lng },
            destination: snappedDest,
            purpose: purpose === "user" ? "user" : purpose === "reroute" ? "reroute" : "traffic",
            alternatives: false,
          },
        });
        if (cancelled || seq !== requestSeq) return;
        const primary = resp.routes[0];
        if (!primary) throw new Error("No route");
        setRoute(primary);
        activeRoute = primary;
        // New geometry accepted: this is the only reroute SUCCESS path.
        progress.setRoute(decodePolyline(primary.encodedPolyline), primary.steps);
        if (purpose === "reroute") progress.markRerouted();
        lastComputeAt = Date.now();
        lastOrigin = { lat: fix.lat, lng: fix.lng };
        broadcast("nav", {
          destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
          encodedPolyline: primary.encodedPolyline,
          distanceMeters: primary.distanceMeters,
          durationSeconds: primary.durationSeconds,
          steps: primary.steps,
          isRerouting: false,
          updatedAt: Date.now(),
        } satisfies PairedNavState);
      } catch (e) {
        if (!cancelled && seq === requestSeq) {
          setRouteError(e instanceof Error ? e.message : "Route failed");
        }
        // The request failed: no new route exists, so the engine must stay
        // eligible instead of believing the deviation was resolved.
        if (purpose === "reroute") progress.markRerouteFailed();
      } finally {
        if (seq === requestSeq) {
          inFlight = false;
          inFlightPurpose = null;
          if (!cancelled) {
            setRerouting(false);
            if (loud) setRouteBusy(false);
          }
        }
      }
    };

    // Called on every GPS fix: the shared engine decides, not this screen.
    const evaluateFix = (fix: PairedFix) => {
      if (cancelled || !activeRoute) return;
      const res = progress.update(
        {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          heading: fix.heading ?? null,
          speed: fix.speed ?? 0,
        },
        performance.now(),
      );
      if (!res?.verdict.offRoute) return;
      // The verdict is consumed: it must start a request, be owned by an
      // in-flight reroute, or be explicitly returned to the engine.
      if (inFlight && inFlightPurpose === "reroute") return;
      if (inFlight && inFlightPurpose === "user") {
        progress.markRerouteFailed();
        return;
      }
      if (metersBetween(fix, destination) < 60) {
        progress.markRerouteFailed();
        return;
      }
      void compute("reroute");
    };
    onFixRef.current = evaluateFix;

    const maybeRefresh = () => {
      const fix = lastFixRef.current;
      if (!fix || inFlight || cancelled) return;
      if (Date.now() - lastComputeAt < MIN_REFRESH_MS) return;
      if (lastOrigin && metersBetween(lastOrigin, fix) < MIN_MOVE_M) return;
      if (metersBetween(fix, destination) < NEAR_DEST_M) return;
      void compute("traffic");
    };

    // Wait for a first fix if none yet.
    if (!lastFixRef.current) {
      const wait = window.setInterval(() => {
        if (lastFixRef.current) {
          window.clearInterval(wait);
          void compute("user");
        }
      }, 500);
      return () => {
        cancelled = true;
        onFixRef.current = null;
        window.clearInterval(wait);
      };
    }

    void compute("user");
    interval = window.setInterval(maybeRefresh, 60_000);

    return () => {
      cancelled = true;
      onFixRef.current = null;
      if (interval) window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);



  const cancelTrip = () => {
    setDestination(null);
    setRoute(null);
    broadcast("nav_clear", null);
  };

  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const min = (s: number) => `${Math.round(s / 60)} min`;

  const connected = channelStatus === "connected";

  return (
    <div className="min-h-screen bg-background p-5 text-foreground">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Phone remote · Tesla display
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Pairing code {upperCode}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your phone is the remote: GPS, search and routing happen here and the Tesla screen
            mirrors it. Keep this tab open.
          </p>
        </div>

        {/* Connection state, matching the Tesla display wording. */}
        <div
          className={
            "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium " +
            (connected
              ? "border-[color:var(--good)]/40 bg-[color:var(--good)]/10 text-[color:var(--good)]"
              : "border-border bg-card text-muted-foreground")
          }
        >
          <span className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: connected ? "var(--good)" : "var(--muted-foreground)" }}
            />
            {connected ? "Connected to Tesla" : `Tesla link: ${channelStatus}`}
          </span>
          {status === "streaming" && (
            <button
              onClick={disconnect}
              className="rounded-lg border border-border bg-white px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Disconnect
            </button>
          )}
        </div>

        {status === "ended" && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="font-semibold text-foreground">Tesla ended this session</div>
            <div className="text-muted-foreground">
              The car went back to direct control. Reconnect to use the phone as the remote again.
            </div>
            <button
              onClick={start}
              className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              Reconnect
            </button>
          </div>
        )}

        {(status === "idle" || status === "starting") && (
          <button
            onClick={start}
            disabled={status === "starting"}
            className="h-16 w-full rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-60"
          >
            {status === "starting" ? "Starting…" : "Start sharing my GPS"}
          </button>
        )}

        {error && (
          <div className="space-y-3 rounded-xl border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 p-4 text-sm">
            <div className="font-semibold text-[color:var(--bad)]">Can't read GPS</div>
            <div className="text-foreground">{error}</div>
            <button
              onClick={start}
              className="h-11 w-full rounded-lg border border-border bg-secondary text-sm font-medium text-secondary-foreground hover:bg-accent"
            >
              Try again
            </button>
          </div>
        )}

        {status === "streaming" && (
          <>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Where to?
              </div>
              <DestinationSearch onSelect={setDestination} />
            </div>

            {destination && (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Trip sent to Tesla
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground">{destination.name}</div>
                  {route && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {km(route.distanceMeters)} · {min(route.durationSeconds)}
                    </div>
                  )}
                  {rerouting && (
                    <div className="mt-1 text-sm text-primary">Rerouting…</div>
                  )}
                  {routeBusy && !route && (
                    <div className="mt-1 text-sm text-muted-foreground">Computing route…</div>
                  )}
                  {routeError && (
                    <div className="mt-1 text-sm text-[color:var(--bad)]">{routeError}</div>
                  )}
                </div>
                <button
                  onClick={cancelTrip}
                  className="h-11 w-full rounded-lg border border-border bg-secondary text-sm font-medium text-secondary-foreground hover:bg-accent"
                >
                  Cancel trip
                </button>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Map control
                </div>
                <button
                  onClick={() => setMapControlOn((v) => !v)}
                  className="rounded-lg border border-border bg-white px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  {mapControlOn ? "Hide map" : "Show map"}
                </button>
              </div>
              {mapControlOn && (
                <>
                  <div
                    ref={mapContainerRef}
                    className="h-64 w-full overflow-hidden rounded-lg border border-border"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Pan or zoom here and the Tesla screen follows. Tap recenter to hand the camera
                    back to the car.
                  </p>
                  <button
                    onClick={recenterOnCar}
                    className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                  >
                    Recenter Tesla on the car
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {last && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-4 font-mono text-xs">
            <div>lat {last.lat.toFixed(6)} · lng {last.lng.toFixed(6)}</div>
            <div>± {Math.round(last.accuracy)} m {last.speed != null && `· ${(last.speed * 3.6).toFixed(0)} km/h`}</div>
            <div className="text-muted-foreground">
              updates {sent} · {channelStatus} · screen {wakeLockOn ? "kept awake" : "may sleep"}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Keep this page open. If iOS locks the screen the GPS pauses - enable "Keep screen awake"
          in your browser or set Auto-Lock to Never.
        </p>
      </div>
    </div>
  );
}
