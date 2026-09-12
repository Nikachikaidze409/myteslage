import { supabase } from "@/integrations/supabase/client";

/**
 * Minimal WebRTC signalling over the existing Supabase realtime transport.
 *
 * This exists for the Tesla receive test (Step 1 of the Google Maps mirror
 * feasibility plan): prove the Tesla browser can play a live low-latency
 * video stream before any companion app work starts. It is deliberately
 * separate from the pair-channel used by navigation so it cannot affect it.
 */
export type MirrorSignal =
  | { kind: "ready" }
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "bye" };

export function mirrorRoomName(room: string) {
  return `mirror-${room.toLowerCase()}`;
}

export function randomRoom(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export interface MirrorLink {
  send: (msg: MirrorSignal) => void;
  close: () => void;
}

export function joinMirrorRoom(
  room: string,
  role: "sender" | "receiver",
  onMessage: (msg: MirrorSignal) => void,
  onStatus?: (s: "connecting" | "joined" | "error" | "closed") => void,
): MirrorLink {
  const channel = supabase.channel(mirrorRoomName(room), {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    const p = payload as { from: string; msg: MirrorSignal } | undefined;
    if (!p || p.from === role) return;
    onMessage(p.msg);
  });

  onStatus?.("connecting");
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onStatus?.("joined");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus?.("error");
    else if (status === "CLOSED") onStatus?.("closed");
  });

  return {
    send: (msg) => {
      void channel.send({ type: "broadcast", event: "signal", payload: { from: role, msg } });
    },
    close: () => {
      void supabase.removeChannel(channel);
    },
  };
}

/** Public STUN only — a TURN relay is a later decision, see the feasibility plan. */
export const MIRROR_ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

export interface MirrorStats {
  width: number;
  height: number;
  fps: number;
  kbps: number;
  codec: string;
  jitterMs: number;
  framesDropped: number;
}

/** Reads the numbers that decide whether the Tesla can really play this. */
export async function readInboundStats(
  pc: RTCPeerConnection,
  prev: { bytes: number; at: number } | null,
): Promise<{ stats: MirrorStats | null; marker: { bytes: number; at: number } | null }> {
  const report = await pc.getStats();
  let inbound: any = null;
  const codecs = new Map<string, any>();
  report.forEach((s: any) => {
    if (s.type === "codec") codecs.set(s.id, s);
    if (s.type === "inbound-rtp" && s.kind === "video") inbound = s;
  });
  if (!inbound) return { stats: null, marker: prev };

  const now = inbound.timestamp ?? Date.now();
  const bytes = inbound.bytesReceived ?? 0;
  let kbps = 0;
  if (prev && now > prev.at) kbps = Math.round(((bytes - prev.bytes) * 8) / (now - prev.at));

  const codec = codecs.get(inbound.codecId)?.mimeType ?? "unknown";
  return {
    stats: {
      width: inbound.frameWidth ?? 0,
      height: inbound.frameHeight ?? 0,
      fps: Math.round(inbound.framesPerSecond ?? 0),
      kbps,
      codec,
      jitterMs: Math.round((inbound.jitter ?? 0) * 1000),
      framesDropped: inbound.framesDropped ?? 0,
    },
    marker: { bytes, at: now },
  };
}
