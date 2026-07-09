import { useEffect, useRef, useState } from "react";
import { generatePairCode, subscribePair, type PairedFix, type PairedNavState } from "@/lib/pair-channel";

interface Props {
  onPairedFix: (f: PairedFix) => void;
  onPairedNav?: (n: PairedNavState) => void;
}

const STORAGE_KEY = "tesla-nav.pair-code";
const PUBLIC_APP_ORIGIN = "https://myteslage.lovable.app";

export function PairPhonePanel({ onPairedFix, onPairedNav }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [channelStatus, setChannelStatus] = useState("not paired");
  const [origin, setOrigin] = useState("");
  const onPairedFixRef = useRef(onPairedFix);
  const onPairedNavRef = useRef(onPairedNav);

  useEffect(() => {
    onPairedFixRef.current = onPairedFix;
  }, [onPairedFix]);
  useEffect(() => {
    onPairedNavRef.current = onPairedNav;
  }, [onPairedNav]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentOrigin = window.location.origin;
    setOrigin(
      currentOrigin.includes("localhost") ? currentOrigin : PUBLIC_APP_ORIGIN,
    );
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setCode(saved);
  }, []);

  useEffect(() => {
    if (!code) return;
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, code);
    setChannelStatus("connecting");
    const unsub = subscribePair(
      code,
      (f) => {
        setConnected(true);
        setChannelStatus("receiving");
        onPairedFixRef.current(f);
      },
      setChannelStatus,
      (n) => onPairedNavRef.current?.(n),
    );
    return unsub;
  }, [code]);

  const start = () => {
    setCode(generatePairCode());
    setConnected(false);
    setChannelStatus("connecting");
  };

  const forget = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    setCode(null);
    setConnected(false);
    setChannelStatus("not paired");
  };

  const phoneUrl = code ? `${origin}/phone/${code}` : "";
  const qrUrl = code
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&color=1e293b&bgcolor=ffffff&data=${encodeURIComponent(phoneUrl)}`
    : "";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="font-display mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Mobile Integration
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
            <p className="text-xs font-medium text-muted-foreground">Pair your phone</p>
            <p className="font-display truncate text-base font-bold text-foreground">Get real GPS</p>
          </div>
          <button
            onClick={start}
            className="font-display h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110"
          >
            Pair
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
                  className={"h-1.5 w-1.5 rounded-full " + (connected ? "" : "")}
                  style={{ background: connected ? "var(--good)" : "var(--muted-foreground)" }}
                />
                {connected ? "Phone connected" : channelStatus === "error" ? "Connection error" : "Waiting for phone…"}
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
              onClick={forget}
              className="h-8 shrink-0 rounded-lg border border-border bg-white px-3 text-[11px] font-medium text-muted-foreground transition hover:bg-muted"
            >
              Forget
            </button>
          </div>
        </div>
      )}
    </div>
  );
}