import { supabase } from "@/integrations/supabase/client";

export interface PairedFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export function pairChannelName(code: string) {
  return `pair-${code.toLowerCase()}`;
}

export function generatePairCode(): string {
  // 6-char base32-ish easy code, no confusing chars
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function subscribePair(code: string, onFix: (f: PairedFix) => void) {
  const channel = supabase.channel(pairChannelName(code), {
    config: { broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "fix" }, (msg) => {
    const p = msg.payload as PairedFix;
    if (p && typeof p.lat === "number" && typeof p.lng === "number") onFix(p);
  });
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function sendPairFix(code: string, fix: PairedFix) {
  const channel = supabase.channel(pairChannelName(code));
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  await channel.send({ type: "broadcast", event: "fix", payload: fix });
  return channel;
}