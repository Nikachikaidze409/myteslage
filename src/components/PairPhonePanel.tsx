import { useEffect, useState } from "react";
import { generatePairCode, subscribePair, type PairedFix } from "@/lib/pair-channel";

interface Props {
  onPairedFix: (f: PairedFix) => void;
}

const STORAGE_KEY = "tesla-nav.pair-code";

export function PairPhonePanel({ onPairedFix }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrigin(window.location.origin);
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setCode(saved);
  }, []);

  useEffect(() => {
    if (!code) return;
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, code);
    const unsub = subscribePair(code, (f) => {
      setConnected(true);
      onPairedFix(f);
    });
    return unsub;
  }, [code, onPairedFix]);

  const start = () => {
    setCode(generatePairCode());
    setConnected(false);
  };

  const forget = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    setCode(null);
    setConnected(false);
  };

  const phoneUrl = code ? `${origin}/phone/${code}` : "";
  const qrUrl = code
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&color=ffffff&bgcolor=1e2124&data=${encodeURIComponent(phoneUrl)}`
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Real GPS via phone
          </div>
          <div className="mt-1 text-sm text-foreground">
            {code
              ? "Paired. Open the link on your phone once — the Tesla will remember this code."
              : "Stream your phone's true GPS to this screen."}
          </div>
        </div>
        {!code && (
          <button
            onClick={start}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Pair phone
          </button>
        )}
        {code && (
          <button
            onClick={forget}
            className="h-11 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-accent"
          >
            Forget
          </button>
        )}
      </div>

      {code && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-4">
            <img src={qrUrl} alt="QR code" className="h-[120px] w-[120px] rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="font-mono text-2xl tracking-widest text-foreground">{code}</div>
              <a
                href={phoneUrl}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-xs text-primary underline"
              >
                {phoneUrl}
              </a>
              <div
                className={
                  "inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs " +
                  (connected
                    ? "bg-[color:var(--good)]/15 text-[color:var(--good)]"
                    : "bg-muted text-muted-foreground")
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: connected ? "var(--good)" : "var(--muted-foreground)" }}
                />
                {connected ? "Phone connected" : "Waiting for phone…"}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            On your phone, open the link above (or scan the QR) and tap “Start sharing my GPS”.
          </p>
        </div>
      )}
    </div>
  );
}