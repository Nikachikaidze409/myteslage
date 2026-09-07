import { supabase } from "@/integrations/supabase/client";

export interface PairedFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

/**
 * Full navigation state broadcast from the phone (brain) to the Tesla (HUD).
 * The Tesla renders it directly and never recomputes routes.
 */
export interface PairedNavState {
  destination: { lat: number; lng: number; name: string } | null;
  encodedPolyline: string | null;
  distanceMeters: number;
  durationSeconds: number;
  steps: { instruction: string; distanceMeters: number; polyline: string }[];
  isRerouting: boolean;
  updatedAt: number;
}

export function pairChannelName(code: string) {
  return `pair-${code.toLowerCase()}`;
}

export function subscribePair(
  code: string,
  onFix: (f: PairedFix) => void,
  onStatus?: (status: "connecting" | "subscribed" | "receiving" | "error" | "closed") => void,
  onNav?: (n: PairedNavState) => void,
) {
  onStatus?.("connecting");
  const channel = supabase.channel(pairChannelName(code), {
    config: { broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "fix" }, (msg) => {
    const p = msg.payload as PairedFix;
    if (p && typeof p.lat === "number" && typeof p.lng === "number") {
      onStatus?.("receiving");
      onFix(p);
    }
  });
  channel.on("broadcast", { event: "nav" }, (msg) => {
    const p = msg.payload as PairedNavState;
    if (p && onNav) onNav(p);
  });
  // "clear" tells the Tesla the phone cancelled navigation.
  channel.on("broadcast", { event: "nav_clear" }, () => {
    if (onNav) onNav({
      destination: null,
      encodedPolyline: null,
      distanceMeters: 0,
      durationSeconds: 0,
      steps: [],
      isRerouting: false,
      updatedAt: Date.now(),
    });
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onStatus?.("subscribed");
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus?.("error");
    if (status === "CLOSED") onStatus?.("closed");
  });
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