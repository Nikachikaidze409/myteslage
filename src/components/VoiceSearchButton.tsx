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

  /**
   * Start listening in `useLang`. Some phones (notably iOS Safari) do not
   * support Georgian speech at all and fail instantly, so we retry once in
   * the phone's own language rather than blaming the speaker.
   */
  const listen = (useLang: string, canFallback: boolean) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = useLang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let got = false;
    rec.onresult = (e: any) => {
      const res = e?.results?.[e.resultIndex ?? 0];
      const text = res?.[0]?.transcript?.trim();
      if (text && res?.isFinal) {
        got = true;
        onResult(text);
      }
    };
    rec.onerror = (e: any) => {
      const kind = e?.error;
      setListening(false);
      if (
        canFallback &&
        (kind === "language-not-supported" || kind === "service-not-allowed" || kind === "bad-grammar")
      ) {
        const fallback =
          typeof navigator !== "undefined" && navigator.language && navigator.language !== useLang
            ? navigator.language
            : "en-US";
        setTimeout(() => listen(fallback, false), 150);
        return;
      }
      if (kind === "not-allowed" || kind === "service-not-allowed") {
        setError("Microphone blocked. Allow it in the browser settings.");
      } else if (kind === "no-speech") {
        setError("Nothing heard. Tap and speak right after the button turns blue.");
      } else if (kind === "language-not-supported") {
        setError("This phone cannot recognise Georgian speech. Type the address instead.");
      } else if (kind === "network") {
        setError("No connection for speech. Check the internet and try again.");
      } else {
        setError("Didn't catch that. Try again.");
      }
    };
    rec.onend = () => {
      setListening(false);
      if (!got) {
        setError((prev) => prev ?? "Nothing heard. Tap and speak right after the button turns blue.");
      }
    };
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setError("Could not start the microphone. Try again.");
    }
  };

  const toggle = () => {
    if (listening) {
      try { recRef.current?.stop?.(); } catch { /* ignore */ }
      setListening(false);
      return;
    }
    listen(lang, true);
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
      {(listening || error) && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-border bg-popover p-2 text-[11px] text-muted-foreground shadow-lg">
          {listening ? "Listening… / გისმენთ…" : error}
        </div>
      )}
    </div>
  );
}
