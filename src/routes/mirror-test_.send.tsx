import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIRROR_ICE,
  joinMirrorRoom,
  type MirrorLink,
  type MirrorSignal,
} from "@/lib/mirror-signal";

export const Route = createFileRoute("/mirror-test_/send")({
  component: MirrorSender,
  head: () => ({
    meta: [
      { title: "Send Screen to Tesla — TeslaNavi Mirror Test" },
      {
        name: "description",
        content:
          "Sender side of the TeslaNavi mirror diagnostic: shares this device's screen to the paired Tesla browser over WebRTC.",
      },
      { property: "og:title", content: "Send Screen to Tesla — TeslaNavi Mirror Test" },
      {
        property: "og:description",
        content: "Share this device's screen to the paired Tesla browser over WebRTC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Phase = "idle" | "ready" | "sharing" | "connected" | "failed" | "stopped";

function MirrorSender() {
  const [room, setRoom] = useState(() => {
    if (typeof window === "undefined") return "";
    return (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase();
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [receiverReady, setReceiverReady] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const linkRef = useRef<MirrorLink | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const canCapture =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  useEffect(() => {
    if (!room) return;
    const link = joinMirrorRoom(
      room,
      "sender",
      (msg: MirrorSignal) => {
        const pc = pcRef.current;
        if (msg.kind === "ready") setReceiverReady(true);
        else if (msg.kind === "answer" && pc)
          void pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        else if (msg.kind === "ice" && pc) void pc.addIceCandidate(msg.candidate).catch(() => {});
        else if (msg.kind === "bye") setPhase("stopped");
      },
      (s) => {
        if (s === "joined") setPhase((p) => (p === "idle" ? "ready" : p));
        if (s === "error") setPhase("failed");
      },
    );
    linkRef.current = link;
    return () => {
      link.send({ kind: "bye" });
      link.close();
      linkRef.current = null;
    };
  }, [room]);

  const start = useCallback(async () => {
    setError(null);
    if (!canCapture) {
      setError(
        "This browser cannot share a screen. On iPhone, Safari has no screen-sharing support at all; on Android, Chrome can only share a browser tab.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 24, max: 30 }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        void previewRef.current.play().catch(() => {});
      }
      setPhase("sharing");

      const pc = new RTCPeerConnection(MIRROR_ICE);
      pcRef.current = pc;
      pc.onicecandidate = (ev) => {
        if (ev.candidate) linkRef.current?.send({ kind: "ice", candidate: ev.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setPhase("connected");
        else if (pc.connectionState === "failed") setPhase("failed");
      };
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
        track.onended = () => stop();
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      linkRef.current?.send({ kind: "offer", sdp: offer.sdp ?? "" });
    } catch (e: any) {
      if (e?.name === "NotAllowedError") setError("Screen sharing was not allowed.");
      else setError(e?.message ?? "Could not start screen sharing.");
      setPhase("ready");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCapture]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    linkRef.current?.send({ kind: "bye" });
    setPhase("stopped");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 bg-background p-4 text-foreground">
      <h1 className="text-xl font-semibold">Send screen to Tesla</h1>

      <label className="block text-sm">
        Room code
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value.toUpperCase())}
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-base tracking-widest"
          placeholder="ABC123"
          autoCapitalize="characters"
        />
      </label>

      <p className="text-sm text-muted-foreground">
        {phase === "connected"
          ? "Connected — the Tesla is showing this screen."
          : receiverReady
            ? "Tesla is waiting. Start sharing."
            : "Open the test page on the Tesla first."}
      </p>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>
      )}

      {phase === "sharing" || phase === "connected" ? (
        <button
          type="button"
          onClick={stop}
          className="w-full rounded-lg border border-border px-4 py-3 text-base font-medium"
        >
          Stop sharing
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={!room}
          className="w-full rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
        >
          Start screen sharing
        </button>
      )}

      <video ref={previewRef} muted playsInline className="w-full rounded-lg bg-black" />

      <p className="text-xs text-muted-foreground">
        This is a diagnostic page. A phone browser cannot capture the native Google Maps app — that
        needs a companion app. Use a laptop here to confirm the Tesla can play the stream.
      </p>
    </main>
  );
}
