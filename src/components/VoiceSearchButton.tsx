import { useEffect, useRef, useState } from "react";

interface Props {
  /** Called with the recognised text once the user stops speaking. */
  onResult: (text: string) => void;
  /** Spoken language; Georgian first, browsers fall back on their own. */
  lang?: string;
  className?: string;
}

function recognitionCtor(): any | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictate a destination with the phone's microphone. Solves the Tesla browser
 * keyboard having no Georgian layout: the phone hears "რუსთაველის 24".
 */
export function VoiceSearchButton({ onResult, lang = "ka-GE", className }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    setSupported(recognitionCtor() != null);
    return () => {
      try { recRef.current?.stop?.(); } catch { /* ignore */ }
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      try { recRef.current?.stop?.(); } catch { /* ignore */ }
      setListening(false);
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = e?.results?.[0]?.[0]?.transcript?.trim();
      if (text) onResult(text);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      setError(
        e?.error === "not-allowed"
          ? "Microphone blocked. Allow it in the browser settings."
          : "Didn't catch that. Try again.",
      );
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "Stop listening" : "Speak the destination"}
        title={listening ? "Listening…" : "Speak the destination"}
        className={
          className ??
          "flex h-12 w-12 items-center justify-center rounded-xl border border-border text-lg " +
            (listening
              ? "animate-pulse bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent")
        }
      >
        🎤
      </button>
      {error && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-border bg-popover p-2 text-[11px] text-muted-foreground shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
