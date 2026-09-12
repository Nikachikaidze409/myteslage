import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { subscribePair, type PairedFix, type PairedNavState, type PairedView } from "@/lib/pair-channel";
import { createPairSession, endPairSession } from "@/lib/pair.functions";
import {
  tickRemoteState,
  remoteStateLabel,
  type RemoteState,
} from "@/lib/remote-state";

export interface PairControls {
  /** Terminate the session from the Tesla side (notifies the phone). */
  disconnect: () => void;
}

/** Dev-only diagnostics snapshot (?remotedebug=1). Never contains tokens. */
export interface PairDiag {
  state: RemoteState;
  code: string | null;
  latencyMs: number | null;
  rxPerSec: number;
  reconnects: number;
  lastMessageAt: number | null;
}

interface Props {
  onPairedFix: (f: PairedFix) => void;
  onPairedNav?: (n: PairedNavState) => void;
  /** Remote camera view pushed from the phone's map control. */
  onRemoteView?: (v: PairedView) => void;
  /** Full connection-state machine updates. */
  onConnectionState?: (s: RemoteState) => void;
  /** Imperative disconnect for HUD-mode chrome. */
  controlsRef?: MutableRefObject<PairControls | null>;
  /** Dev-only diagnostics callback (?remotedebug=1), ~1 Hz. */
  onDiag?: (d: PairDiag) => void;
}

const STORAGE_KEY = "tesla-nav.pair-code";
const PUBLIC_APP_ORIGIN = "https://myteslage.lovable.app";

export function PairPhonePanel({
  onPairedFix,
  onPairedNav,
  onRemoteView,
  onConnectionState,
  controlsRef,
  onDiag,
}: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<RemoteState>("disconnected");
  const [origin, setOrigin] = useState("");

  const onPairedFixRef = useRef(onPairedFix);
  const onPairedNavRef = useRef(onPairedNav);
  const onRemoteViewRef = useRef(onRemoteView);
  const stateRef = useRef<RemoteState>("disconnected");
  // Last time anything arrived from the phone (heartbeat or fix): liveness.
  const lastSeenRef = useRef<number | null>(null);
  // Diagnostics counters (client memory only).
  const rxCountRef = useRef(0);
  const rxWindowRef = useRef<{ start: number; count: number }>({ start: 0, count: 0 });
  const rxPerSecRef = useRef(0);
  const reconnectsRef = useRef(0);
  const latencyRef = useRef<number | null>(null);
  const lastMessageAtRef = useRef<number | null>(null);

  useEffect(() => {
    onPairedFixRef.current = onPairedFix;
  }, [onPairedFix]);
  useEffect(() => {
    onPairedNavRef.current = onPairedNav;
  }, [onPairedNav]);
  useEffect(() => {
    onRemoteViewRef.current = onRemoteView;
  }, [onRemoteView]);

  const setRemoteState = (s: RemoteState) => {
    if (stateRef.current === s) return;
    stateRef.current = s;
    setState(s);
  };

  // Report state changes upward.
  useEffect(() => {
    onConnectionState?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentOrigin = window.location.origin;
    setOrigin(currentOrigin.includes("localhost") ? currentOrigin : PUBLIC_APP_ORIGIN);
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setCode(saved);
      setRemoteState("connecting");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Channel subscription: lives as long as a pairing code exists.
  useEffect(() => {
    if (!code) return;
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, code);
    const markSeen = () => {
      const now = Date.now();
      lastSeenRef.current = now;
      lastMessageAtRef.current = now;
      rxCountRef.current++;
      if (stateRef.current === "connecting" || stateRef.current === "reconnecting") {
        setRemoteState("connected");
      }
    };
    const unsub = subscribePair(
      code,
      (f) => {
        markSeen();
        onPairedFixRef.current(f);
      },
      (status) => {
        if (status === "error") setRemoteState("error");
        if (status === "closed" && stateRef.current !== "disconnected") {
          // The socket dropped; heartbeats may still recover it via resubscribe.
          if (stateRef.current === "connected") setRemoteState("reconnecting");
        }
      },
      (n) => {
        markSeen();
        onPairedNavRef.current?.(n);
      },
      {
        onHeartbeat: (t) => {
          markSeen();
          // One-way latency estimate: phone clock vs Tesla clock. On real
          // devices the clocks differ, so clamp to a sane display range.
          const d = Date.now() - t;
          latencyRef.current = d >= 0 && d < 60_000 ? d : null;
        },
        onView: (v) => {
          markSeen();
          onRemoteViewRef.current?.(v);
        },
        onDisconnect: () => {
          setRemoteState("disconnected_by_user");
        },
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 1 Hz liveness tick: connected → reconnecting → session_expired.
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      const next = tickRemoteState(stateRef.current, now, lastSeenRef.current);
      if (next !== stateRef.current) {
        if (next === "reconnecting") reconnectsRef.current++;
        setRemoteState(next);
      }
      // Diagnostics rate window (~1 Hz when requested).
      if (onDiag) {
        const w = rxWindowRef.current;
        if (w.start === 0) {
          w.start = now;
          w.count = rxCountRef.current;
        } else if (now - w.start >= 1000) {
          rxPerSecRef.current = ((rxCountRef.current - w.count) * 1000) / (now - w.start);
          w.start = now;
          w.count = rxCountRef.current;
        }
        onDiag({
          state: stateRef.current,
          code,
          latencyMs: latencyRef.current,
          rxPerSec: rxPerSecRef.current,
          reconnects: reconnectsRef.current,
          lastMessageAt: lastMessageAtRef.current,
        });
      }
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, onDiag != null]);

  const start = () => {
    setRemoteState("pairing");
    lastSeenRef.current = null;
    void createPairSession()
      .then((s) => {
        setCode(s.code);
        setRemoteState("connecting");
      })
      .catch(() => setRemoteState("error"));
  };

  const disconnect = () => {
    // Tell the phone first so it can stop its GPS watch immediately.
    if (code) {
      try {
        void import("@/integrations/supabase/client").then(({ supabase }) => {
          const ch = supabase.channel(
            `pair-${code.toLowerCase()}`,
            { config: { broadcast: { self: false } } },
          );
          ch.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              void ch
                .send({ type: "broadcast", event: "disconnect", payload: { by: "tesla" } })
                .finally(() => void supabase.removeChannel(ch));
            }
          });
        });
      } catch {
        /* best effort */
      }
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    setCode(null);
    lastSeenRef.current = null;
    setRemoteState("disconnected");
    void endPairSession().catch(() => {});
  };

  // Imperative controls for HUD-mode chrome.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = { disconnect };
    return () => {
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsRef, code]);

  const phoneUrl = code ? `${origin}/phone/${code}` : "";
  const qrUrl = code
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&color=1e293b&bgcolor=ffffff&data=${encodeURIComponent(phoneUrl)}`
    : "";

  const connected = state === "connected";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="font-display mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Phone Remote
      </div>

      {!code && (
        <div className="flex items-center gap-4 rounded-2xl bg-muted/60 p-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-white text-primary">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="3" width="12" height="18" rx="2" strokeWidth="2" />
              <circle cx="12" cy="17.5" r="1" fill="currentColor" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {state === "disconnected_by_user" ? "Phone disconnected" : "Use your phone as the remote"}
            </p>
            <p className="font-display truncate text-base font-bold text-foreground">
              {state === "pairing" ? "Creating code…" : "Control this screen"}
            </p>
          </div>
          <button
            onClick={start}
            disabled={state === "pairing"}
            className="font-display h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:opacity-60"
          >
            {state === "pairing" ? "…" : "Connect phone"}
          </button>
        </div>
      )}

      {code && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-muted/60 p-4">
            <img src={qrUrl} alt="QR code" className="h-[92px] w-[92px] shrink-0 rounded-lg bg-white" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pair Device</p>
                <p className="font-display text-xl font-bold tracking-widest text-foreground">{code}</p>
              </div>
              <div
                className={
                  "inline-flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-medium " +
                  (connected
                    ? "bg-[color:var(--good)]/15 text-[color:var(--good)]"
                    : "bg-white text-muted-foreground")
                }
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      connected
                        ? "var(--good)"
                        : state === "reconnecting"
                          ? "var(--warn, #d97706)"
                          : "var(--muted-foreground)",
                  }}
                />
                {remoteStateLabel(state)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <a
              href={phoneUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-primary underline underline-offset-2"
            >
              {phoneUrl}
            </a>
            <button
              onClick={disconnect}
              className="h-8 shrink-0 rounded-lg border border-border bg-white px-3 text-[11px] font-medium text-muted-foreground transition hover:bg-muted"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
