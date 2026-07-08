import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pairChannelName, type PairedFix } from "@/lib/pair-channel";

export const Route = createFileRoute("/phone/$code")({
  head: () => ({
    meta: [{ title: "Phone GPS relay" }],
  }),
  component: PhoneRelay,
});

function PhoneRelay() {
  const { code } = Route.useParams();
  const upperCode = code.toUpperCase();
  const [status, setStatus] = useState<"idle" | "starting" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<PairedFix | null>(null);
  const [sent, setSent] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const watchRef = useRef<number | null>(null);
  const PHONE_KEY = `tesla-nav.phone-autostart.${upperCode}`;

  useEffect(() => {
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, []);

  const start = async () => {
    if (typeof window !== "undefined") window.localStorage.setItem(PHONE_KEY, "1");
    setError(null);
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("This browser has no geolocation.");
      return;
    }
    setStatus("starting");

    const channel = supabase.channel(pairChannelName(upperCode));
    channelRef.current = channel;
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED") resolve();
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") reject(new Error("Channel failed"));
      });
    }).catch((e) => {
      setError(String(e));
      setStatus("error");
    });

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const fix: PairedFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        };
        setLast(fix);
        setSent((n) => n + 1);
        setStatus("streaming");
        try {
          await channel.send({ type: "broadcast", event: "fix", payload: fix });
        } catch (e) {
          console.error(e);
        }
      },
      (err) => {
        setStatus("error");
        setError(err.message || "Geolocation error");
      },
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 20_000 },
    );
  };

  // Auto-resume streaming if this phone has paired with this code before.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PHONE_KEY) === "1") {
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upperCode]);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Phone GPS relay</div>
          <h1 className="mt-1 text-2xl font-semibold">Pairing code {upperCode}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep this tab open. Your phone's real GPS will stream to the Tesla screen showing the
            same code. Nothing is stored — coordinates go straight through a live channel.
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
          <div className="rounded-xl border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 p-4 text-sm">
            {error}
          </div>
        )}

        {last && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-5 font-mono text-sm">
            <div>lat {last.lat.toFixed(6)}</div>
            <div>lng {last.lng.toFixed(6)}</div>
            <div>± {Math.round(last.accuracy)} m</div>
            {last.speed != null && <div>speed {(last.speed * 3.6).toFixed(1)} km/h</div>}
            <div className="text-muted-foreground">updates sent: {sent}</div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          On iOS, keep the screen on (Settings → Display → Auto-Lock → Never) so the browser
          doesn't pause GPS.
        </p>
      </div>
    </div>
  );
}