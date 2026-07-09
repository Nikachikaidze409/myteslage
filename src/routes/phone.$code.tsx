import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pairChannelName, type PairedFix, type PairedNavState } from "@/lib/pair-channel";
import { DestinationSearch, type Destination } from "@/components/DestinationSearch";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";
import { snapToRoad } from "@/lib/snap-to-road.functions";

export const Route = createFileRoute("/phone/$code")({
  head: () => ({
    meta: [{ title: "Tesla nav — phone brain" }],
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
  const [wakeLockOn, setWakeLockOn] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelReadyRef = useRef(false);
  const watchRef = useRef<number | null>(null);
  const lastFixRef = useRef<PairedFix | null>(null);
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

    // Kick off the realtime channel in parallel — do NOT await it before geolocation.
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

  // Compute route whenever destination + first fix are ready. Also re-compute
  // periodically as the phone moves so the Tesla always has a current polyline.
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

    const compute = async (silent: boolean) => {
      const fix = lastFixRef.current;
      if (!fix) return;
      if (!silent) setRouteBusy(true);
      setRouteError(null);
      try {
        const snapped = await snapToRoad({ data: { lat: destination.lat, lng: destination.lng } })
          .then((s) => ({ lat: s.lat, lng: s.lng }))
          .catch(() => ({ lat: destination.lat, lng: destination.lng }));
        const resp = await computeRoute({
          data: {
            origin: { lat: fix.lat, lng: fix.lng },
            destination: snapped,
            alternatives: false,
          },
        });
        if (cancelled) return;
        const primary = resp.routes[0];
        if (!primary) throw new Error("No route");
        setRoute(primary);
        lastComputeAt = Date.now();
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
        if (!cancelled) setRouteError(e instanceof Error ? e.message : "Route failed");
      } finally {
        if (!cancelled && !silent) setRouteBusy(false);
      }
    };

    // Wait for a first fix if none yet.
    if (!lastFixRef.current) {
      const wait = window.setInterval(() => {
        if (lastFixRef.current) {
          window.clearInterval(wait);
          void compute(false);
        }
      }, 500);
      return () => window.clearInterval(wait);
    }

    void compute(false);
    // Silent refresh every 30s to keep polyline traffic-aware.
    interval = window.setInterval(() => {
      if (Date.now() - lastComputeAt < 20_000) return;
      void compute(true);
    }, 30_000);

    return () => {
      cancelled = true;
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
          Keep this page open. If iOS locks the screen the GPS pauses — enable "Keep screen awake"
          in your browser or set Auto-Lock to Never.
        </p>
      </div>
    </div>
  );
}