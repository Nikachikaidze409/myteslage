import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { HubShell } from "@/components/HubShell";
import { ht } from "@/lib/hub-lang";
import { isParked, parseYoutubeId } from "@/lib/drive-lock";

export const Route = createFileRoute("/youtube")({
  head: () => ({
    meta: [
      { title: "TMap YouTube — მხოლოდ გაჩერებულ მანქანაში" },
      { name: "description", content: "YouTube Tesla-ს ეკრანზე, რომელიც მოძრაობისას ავტომატურად იბლოკება." },
      { property: "og:title", content: "TMap YouTube" },
      { property: "og:description", content: "YouTube მხოლოდ გაჩერებულ მანქანაში." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <YouTubePage />
    </AuthGate>
  ),
});

type Lock = "checking" | "parked" | "moving" | "nogps";

/** Watches GPS speed; anything above walking speed counts as driving. */
function useDriveLock(): Lock {
  const [lock, setLock] = useState<Lock>("checking");
  const prev = useRef<GeolocationPosition | null>(null);
  useEffect(() => {
    if (!("geolocation" in navigator)) { setLock("nogps"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setLock(isParked(p, prev.current) ? "parked" : "moving");
        prev.current = p;
      },
      () => setLock("nogps"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return lock;
}

const CHIPS = ["🎵 music hits", "🎙 podcast", "🚗 Tesla", "👶 kids songs", "📰 news live", "🎬 movie trailers"];

function YouTubePage() {
  const lock = useDriveLock();
  const [q, setQ] = useState("");
  const [src, setSrc] = useState(
    "https://www.youtube.com/embed?listType=search&list=music%20hits&playsinline=1",
  );
  const parked = lock === "parked";

  const play = (input: string) => {
    const text = input.trim();
    if (!text) return;
    const id = parseYoutubeId(text);
    setSrc(
      id
        ? `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`
        : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(text.replace(/^\S+\s/, (m) => (/^[\p{Emoji}]/u.test(m) ? "" : m)))}&autoplay=1&playsinline=1`,
    );
  };

  return (
    <HubShell back>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-6 pb-8">
        {!parked ? (
          <div className="cockpit-glass flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl p-10 text-center">
            <div className="text-6xl">{lock === "moving" ? "🛑" : "📍"}</div>
            <h1 className="max-w-xl text-2xl font-bold">
              {lock === "moving" ? ht("moving") : lock === "nogps" ? ht("noGps") : ht("checking")}
            </h1>
            {lock === "moving" && <p className="text-muted-foreground">{ht("movingSub")}</p>}
          </div>
        ) : (
          <>
            <form
              className="cockpit-glass flex w-full gap-2 rounded-2xl p-2"
              onSubmit={(e) => { e.preventDefault(); play(q); }}
            >
              <span className="flex items-center px-2 text-2xl text-destructive">▶</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ht("paste")}
                className="flex-1 rounded-xl border border-input bg-background/60 px-4 py-3 text-foreground"
              />
              <button className="rounded-xl bg-primary px-6 font-semibold text-primary-foreground">{ht("play")}</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => play(c.slice(c.indexOf(" ") + 1))}
                  className="cockpit-glass rounded-full px-4 py-2 text-sm font-medium"
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-3xl border border-border bg-background">
              <iframe
                key={src}
                className="h-full w-full"
                src={src}
                title="YouTube"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </>
        )}
      </div>
    </HubShell>
  );
}
