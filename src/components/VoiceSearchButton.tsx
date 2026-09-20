import { useEffect, useRef, useState } from "react";
import { transcribeDestination } from "@/lib/voice.functions";

interface Props {
  /** Called with the destination once the AI understood the sentence. */
  onResult: (text: string) => void;
  className?: string;
}

/** Pack mono float samples into a 16 kHz 16-bit WAV file. */
function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const target = 16_000;
  const flatLength = chunks.reduce((n, c) => n + c.length, 0);
  const flat = new Float32Array(flatLength);
  let at = 0;
  for (const c of chunks) {
    flat.set(c, at);
    at += c.length;
  }

  const ratio = sampleRate / target;
  const outLength = Math.max(1, Math.floor(flat.length / ratio));
  const samples = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const v = flat[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, v));
    samples[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: "audio/wav" });
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Say the destination out loud. The recording goes to the AI, which
 * understands Georgian ("წამიყვანე სითი მოლში") and answers with the
 * address to search. Works on every phone, including iPhone, where the
 * browser's own speech engine has no Georgian.
 */
export function VoiceSearchButton({ onResult, className }: Props) {
  const [phase, setPhase] = useState<"idle" | "recording" | "thinking">("idle");
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const autoStopRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
      stopRef.current?.();
    },
    [],
  );

  const send = async (blob: Blob) => {
    if (blob.size < 2048) {
      setPhase("idle");
      setError("Nothing was heard. Speak right after the button turns red.");
      return;
    }
    setPhase("thinking");
    try {
      const audio = await toBase64(blob);
      const res = await transcribeDestination({ data: { audio } });
      setPhase("idle");
      onResult(res.query);
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Could not understand that. Try again.");
    }
  };

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone blocked. Allow it in the browser settings.");
      return;
    }

    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      stream.getTracks().forEach((t) => t.stop());
      setError("This browser cannot record audio.");
      return;
    }
    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    setPhase("recording");

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
      stopRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect();
      source.disconnect();
      const blob = encodeWav(chunks, ctx.sampleRate);
      void ctx.close();
      void send(blob);
    };
    stopRef.current = stop;
    // Never leave the microphone open.
    autoStopRef.current = window.setTimeout(stop, 12_000);
  };

  const toggle = () => {
    if (phase === "thinking") return;
    if (phase === "recording") {
      stopRef.current?.();
      return;
    }
    void start();
  };

  const hint =
    phase === "recording"
      ? "Listening… tap to finish / გისმენთ…"
      : phase === "thinking"
        ? "Understanding… / ვამუშავებ…"
        : error;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={phase === "recording" ? "Stop and send" : "Speak the destination"}
        title="Speak the destination"
        className={
          className ??
          "flex h-12 w-12 items-center justify-center rounded-xl border border-border text-lg " +
            (phase === "recording"
              ? "animate-pulse bg-[color:var(--bad)] text-white"
              : phase === "thinking"
                ? "bg-primary/70 text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent")
        }
      >
        {phase === "thinking" ? "…" : "🎤"}
      </button>
      {hint && (
        <div className="absolute right-0 top-full z-10 mt-1 w-52 rounded-lg border border-border bg-popover p-2 text-[11px] text-muted-foreground shadow-lg">
          {hint}
        </div>
      )}
    </div>
  );
}
