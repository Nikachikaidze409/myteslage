import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MIRROR_ICE,
  joinMirrorRoom,
  randomRoom,
  readInboundStats,
  type MirrorLink,
  type MirrorSignal,
  type MirrorStats,
} from "@/lib/mirror-signal";

export const Route = createFileRoute("/mirror-test")({
  component: MirrorReceiver,
  head: () => ({
    meta: [
      { title: "Tesla Screen Mirror Test — TeslaNavi" },
      {
        name: "description",
        content:
          "Diagnostic receiver that checks whether the Tesla browser can play a live low-latency screen stream from a phone or laptop.",
      },
      { property: "og:title", content: "Tesla Screen Mirror Test — TeslaNavi" },
      {
        property: "og:description",
        content: "Check whether the Tesla browser can play a live low-latency screen stream.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Phase = "idle" | "waiting" | "connecting" | "playing" | "failed" | "ended";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Starting…",
  waiting: "Waiting for the sender to join",
  connecting: "Connecting…",
  playing: "Receiving live video",
  failed: "Connection failed",
  ended: "Sender disconnected",
};

function MirrorReceiver() {
  const [room] = useState(() => {
    if (typeof window === "undefined") return "";
    const fromUrl = new URLSearchParams(window.location.search).get("room");
    return (fromUrl || randomRoom()).toUpperCase();
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [stats, setStats] = useState<MirrorStats | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const linkRef = useRef<MirrorLink | null>(null);

  const addLog = useCallback((line: string) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 20));
  }, []);

  const support = useMemo(() => {
    if (typeof window === "undefined") return null;
    const hasPc = typeof window.RTCPeerConnection === "function";
    let h264 = "unknown";
    try {
      const caps = (window as any).RTCRtpReceiver?.getCapabilities?.("video");
      if (caps?.codecs) {
        const list = caps.codecs.map((c: any) => c.mimeType.toLowerCase());
        h264 = list.includes("video/h264") ? "yes" : "no";
      }
    } catch {
      /* capability probe is best effort */
    }
    return { hasPc, h264, secure: window.isSecureContext };
  }, []);

  const senderUrl = useMemo(() => {
    if (typeof window === "undefined" || !room) return "";
    return `${window.location.origin}/mirror-test/send?room=${room}`;
  }, [room]);

  const qrUrl = senderUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(senderUrl)}`
    : "";

  useEffect(() => {
    if (!room || !support?.hasPc) return;

    let disposed = false;
    const pc = new RTCPeerConnection(MIRROR_ICE);
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      const el = videoRef.current;
      if (!el) return;
      el.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
      el.play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    };
    pc.onconnectionstatechange = () => {
      addLog(`peer: ${pc.connectionState}`);
      if (pc.connectionState === "connected") setPhase("playing");
      else if (pc.connectionState === "connecting") setPhase("connecting");
      else if (pc.connectionState === "failed") setPhase("failed");
      else if (pc.connectionState === "disconnected" || pc.connectionState === "closed")
        setPhase((p) => (p === "playing" ? "ended" : p));
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) linkRef.current?.send({ kind: "ice", candidate: ev.candidate.toJSON() });
    };

    const handle = async (msg: MirrorSignal) => {
      if (disposed) return;
      if (msg.kind === "offer") {
        addLog("offer received");
        setPhase("connecting");
        await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        linkRef.current?.send({ kind: "answer", sdp: answer.sdp ?? "" });
      } else if (msg.kind === "ice") {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch {
          /* candidates can arrive before the remote description */
        }
      } else if (msg.kind === "bye") {
        addLog("sender left");
        setPhase("ended");
      }
    };

    const link = joinMirrorRoom(room, "receiver", (m) => void handle(m), (s) => {
      addLog(`signalling: ${s}`);
      if (s === "joined") {
        setPhase((p) => (p === "idle" ? "waiting" : p));
        link.send({ kind: "ready" });
      }
      if (s === "error") setPhase("failed");
    });
    linkRef.current = link;

    return () => {
      disposed = true;
      link.send({ kind: "bye" });
      link.close();
      pc.close();
      pcRef.current = null;
      linkRef.current = null;
    };
  }, [room, support?.hasPc, addLog]);

  // Live quality numbers — the whole point of this test page.
  useEffect(() => {
    if (phase !== "playing") return;
    let marker: { bytes: number; at: number } | null = null;
    const id = window.setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      const res = await readInboundStats(pc, marker);
      marker = res.marker;
      if (res.stats) setStats(res.stats);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Screen mirror receive test</h1>
        <Link to="/map" className="rounded-lg border border-border px-3 py-2 text-sm">
          Back to navigation
        </Link>
      </header>

      {!support?.hasPc && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          This browser does not support live video calling (WebRTC). Mirroring is not possible here.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="relative overflow-hidden rounded-xl border border-border bg-black">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="aspect-video w-full bg-black object-contain"
          />
          {phase !== "playing" && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 text-center text-sm text-white">
              {PHASE_LABEL[phase]}
            </div>
          )}
          {autoplayBlocked && (
            <button
              type="button"
              onClick={() => void videoRef.current?.play().then(() => setAutoplayBlocked(false))}
              className="absolute inset-x-0 bottom-0 bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              Tap to start playback
            </button>
          )}
        </section>

        <aside className="space-y-4 text-sm">
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 font-medium">Send from a phone or laptop</p>
            {qrUrl && (
              <img src={qrUrl} alt="QR code linking to the sender page" className="mb-2 h-40 w-40 rounded bg-white" />
            )}
            <p className="break-all text-xs text-muted-foreground">{senderUrl}</p>
            <p className="mt-2 text-xs text-muted-foreground">Room code: {room}</p>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 font-medium">Status: {PHASE_LABEL[phase]}</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>WebRTC: {support?.hasPc ? "supported" : "missing"}</li>
              <li>Secure context: {support?.secure ? "yes" : "no"}</li>
              <li>H.264 decode advertised: {support?.h264 ?? "unknown"}</li>
              <li>Resolution: {stats ? `${stats.width}×${stats.height}` : "—"}</li>
              <li>Frame rate: {stats ? `${stats.fps} fps` : "—"}</li>
              <li>Bitrate: {stats ? `${stats.kbps} kbps` : "—"}</li>
              <li>Codec in use: {stats?.codec ?? "—"}</li>
              <li>Jitter: {stats ? `${stats.jitterMs} ms` : "—"}</li>
              <li>Frames dropped: {stats?.framesDropped ?? "—"}</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 font-medium">Log</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
