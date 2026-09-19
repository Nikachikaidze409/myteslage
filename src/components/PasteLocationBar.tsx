import { useRef, useState } from "react";
import { resolvePastedLocation } from "@/lib/place-link.functions";
import type { Destination } from "@/components/DestinationSearch";
import { VoiceSearchButton } from "@/components/VoiceSearchButton";

interface Props {
  onResolved: (d: Destination) => void;
  origin?: { lat: number; lng: number } | null;
}

/**
 * Paste a Google Maps link (WhatsApp/Viber/Telegram share), raw coordinates or
 * an address, or dictate it, and send the destination straight to the Tesla.
 */
export function PasteLocationBar({ onResolved, origin }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (value?: string) => {
    const raw = (value ?? text).trim();
    if (!raw || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await resolvePastedLocation({
        data: {
          text: raw,
          ...(origin ? { lat: origin.lat, lng: origin.lng } : {}),
        },
      });
      onResolved({ lat: d.lat, lng: d.lng, name: d.name, address: d.address });
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that location");
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip?.trim()) {
        setText(clip.trim());
        void submit(clip.trim());
        return;
      }
      setError("Clipboard is empty");
    } catch {
      setError("Tap the box and paste the link by hand");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="Paste a Google Maps link or coordinates"
          className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <VoiceSearchButton
          onResult={(t) => {
            setText(t);
            void submit(t);
          }}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void pasteFromClipboard()}
          disabled={busy}
          className="h-11 flex-1 rounded-lg border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent disabled:opacity-60"
        >
          Paste from clipboard
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || text.trim().length === 0}
          className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Opening…" : "Send to Tesla"}
        </button>
      </div>
      {error && <div className="text-xs text-[color:var(--bad)]">{error}</div>}
    </div>
  );
}
