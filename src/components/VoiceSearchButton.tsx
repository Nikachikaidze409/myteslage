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
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };

  useEffect(() => {
    setSupported(recognitionCtor() != null);
    return () => {
      clearTimers();
      try { recRef.current?.abort?.(); } catch { /* ignore */ }
    };
  }, []);

  if (!supported) return null;

  /**
   * Start listening in `useLang`. Some phones (notably iOS Safari) have no
   * Georgian speech model: they open the microphone and then stay silent
   * forever instead of failing, so we also fall back on a hard timeout.
   */
  const listen = (useLang: string, canFallback: boolean) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    clearTimers();
    setError(null);
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = useLang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let got = false;
    let heardAnything = false;
    /** Best text so far, even if the engine never marks it final. */
    let bestText = "";

    const fallbackLang = () =>
      typeof navigator !== "undefined" && navigator.language && navigator.language !== useLang
        ? navigator.language
        : "en-US";

    const finish = (text: string) => {
      if (got) return;
      got = true;
      clearTimers();
      try { rec.stop?.(); } catch { /* ignore */ }
      setListening(false);
      onResult(text);
    };

    rec.onresult = (e: any) => {
      heardAnything = true;
      let text = "";
      let final = false;
      for (let i = 0; i < (e?.results?.length ?? 0); i++) {
        const r = e.results[i];
        text += r?.[0]?.transcript ?? "";
        if (r?.isFinal) final = true;
      }
      text = text.trim();
      if (!text) return;
      bestText = text;
      if (final) {
        finish(text);
        return;
      }
      // Mobile engines often never flag "final": submit shortly after the
      // speaker pauses instead of waiting forever.
      clearTimers();
      timersRef.current.push(
        window.setTimeout(() => {
          if (bestText) finish(bestText);
        }, 1_200),
      );
    };

    rec.onspeechstart = () => {
      heardAnything = true;
    };

    rec.onerror = (e: any) => {
      const kind = e?.error;
      if (got) return;
      clearTimers();
      setListening(false);
      if (
        canFallback &&
        (kind === "language-not-supported" || kind === "service-not-allowed" || kind === "bad-grammar")
      ) {
        window.setTimeout(() => listen(fallbackLang(), false), 150);
        return;
      }
      if (kind === "aborted") return;
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
      if (got) return;
      clearTimers();
      setListening(false);
      if (bestText) {
        finish(bestText);
        return;
      }
      if (canFallback && !heardAnything) {
        window.setTimeout(() => listen(fallbackLang(), false), 150);
        return;
      }
      setError((prev) => prev ?? "Nothing heard. Tap and speak right after the button turns blue.");
    };

    try {
      rec.start();
      setListening(true);
      // Safety net: an engine with no model for this language can open the
      // microphone and never emit a single event. Never stay stuck on
      // "Listening…": retry once in the phone's own language, then give up.
      timersRef.current.push(
        window.setTimeout(() => {
          if (got || heardAnything) return;
          try { rec.abort?.(); } catch { /* ignore */ }
          setListening(false);
          if (canFallback) {
            window.setTimeout(() => listen(fallbackLang(), false), 150);
          } else {
            setError("Nothing heard. Tap and speak right after the button turns blue.");
          }
        }, 6_000),
      );
      // Absolute cap so the microphone never stays open.
      timersRef.current.push(
        window.setTimeout(() => {
          if (got) return;
          if (bestText) finish(bestText);
          else {
            try { rec.stop?.(); } catch { /* ignore */ }
            setListening(false);
          }
        }, 12_000),
      );
    } catch {
      setListening(false);
      setError("Could not start the microphone. Try again.");
    }
  };

  const toggle = () => {
    if (listening) {
      clearTimers();
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
