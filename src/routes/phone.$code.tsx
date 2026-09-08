import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pairChannelName, type PairedFix, type PairedNavState } from "@/lib/pair-channel";
import { DestinationSearch, type Destination } from "@/components/DestinationSearch";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { snapToRoad } from "@/lib/snap-to-road.functions";
import { RouteProgressEngine } from "@/lib/maps/routeProgressEngine";
import { decodePolyline } from "@/lib/geo";


export const Route = createFileRoute("/phone/$code")({
  head: () => ({
    meta: [{ title: "Tesla nav - phone brain" }],
  }),
  component: PhoneRelay,
});

function PhoneRelay() {
  const { code } = Route.useParams();
  const upperCode = code.toUpperCase();
  const [status, setStatus] = useState<"idle" | "starting" | "streaming" | "error">("idle");
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

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelReadyRef = useRef(false);
  const watchRef = useRef<number | null>(null);
  const lastFixRef = useRef<PairedFix | null>(null);
  // Set by the routing effect; called on every GPS fix to detect off-route.
  const onFixRef = useRef<((fix: PairedFix) => void) | null>(null);
  const wakeLockRef = useRef<any>(null);

  const PHONE_KEY = `tesla-nav.phone-autostart.${upperCode}`;
  const DEST_KEY = `tesla-nav.phone-dest.${upperCode}`;

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release?.(); } catch { /* ignore */ }
      }
    };
  }, []);

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

  // Broadcast helper. Buffers if the channel isn't ready yet.
  const broadcast = (event: "fix" | "nav" | "nav_clear", payload: unknown) => {
    const ch = channelRef.current;
    if (!ch || !channelReadyRef.current) return;
    void ch.send({ type: "broadcast", event, payload });
  };

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
    setChannelStatus("connecting");
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("This browser has no geolocation.");
      return;
    }
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    channelReadyRef.current = false;
    setStatus("starting");

    // Kick off the realtime channel in parallel - do NOT await it before geolocation.
    let pending: PairedFix | null = null;
    const channel = supabase.channel(pairChannelName(upperCode));
    channelRef.current = channel;
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setChannelStatus("connected");
        channelReadyRef.current = true;
        if (pending) {
          void channel.send({ type: "broadcast", event: "fix", payload: pending });
          pending = null;
        }
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        setChannelStatus("connection error");
        setError(
          "Phone GPS is running, but the live pairing channel could not connect. Reload both screens.",
        );
      } else if (s === "CLOSED") {
        setChannelStatus("closed");
      }
    });

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
        if (channelReadyRef.current) {
          broadcast("fix", fix);
        } else {
          pending = fix;
        }
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
    let lastRerouteAt = 0;

    const MIN_REFRESH_MS = 240_000;
    const MIN_MOVE_M = 2_000;
    const NEAR_DEST_M = 3_000;
    /** Final anti-runaway guard on top of the engine's own one-event latch. */
    const REROUTE_MIN_GAP_MS = 5_000;

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
        lastRerouteAt = Date.now();
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
      const now = Date.now();
      if (inFlight || now - lastRerouteAt < REROUTE_MIN_GAP_MS) return;
      if (metersBetween(fix, destination) < 60) return;
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

  return (
    <div className="min-h-screen bg-background p-5 text-foreground">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Phone brain · Tesla HUD
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Pairing code {upperCode}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your phone owns GPS + search + routing. The Tesla screen shows a big driver HUD driven
            from here. Keep this tab open.
          </p>
        </div>

        {status !== "streaming" && (
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