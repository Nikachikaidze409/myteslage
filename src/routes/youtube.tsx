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

function YouTubePage() {
  const lock = useDriveLock();
  const [url, setUrl] = useState("");
  const [vid, setVid] = useState<string | null>(null);
  const parked = lock === "parked";

  return (
    <HubShell back>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 pb-10">
        {!parked ? (
          <div className="cockpit-glass flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl p-10 text-center">
            <div className="text-6xl">{lock === "moving" ? "🛑" : "📍"}</div>
            <h1 className="max-w-xl text-2xl font-bold">
              {lock === "moving" ? ht("moving") : lock === "nogps" ? ht("noGps") : ht("checking")}
            </h1>
            {lock === "moving" && <p className="text-muted-foreground">{ht("movingSub")}</p>}
          </div>
        ) : vid ? (
          <div className="aspect-video w-full overflow-hidden rounded-3xl border border-border">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${vid}?autoplay=1&playsinline=1`}
              title="YouTube"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="cockpit-glass flex flex-col items-center gap-6 rounded-3xl p-10">
            <a
              href="https://m.youtube.com"
              className="hub-tile !min-h-0 w-full max-w-md !flex-row !py-6 text-2xl font-bold"
              style={{ ["--glow" as string]: "var(--destructive)" }}
            >
              <span className="text-4xl">▶</span> {ht("openYt")}
            </a>
            <form
              className="flex w-full max-w-xl gap-2"
              onSubmit={(e) => { e.preventDefault(); setVid(parseYoutubeId(url)); }}
            >
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={ht("paste")}
                className="flex-1 rounded-xl border border-input bg-background/60 px-4 py-3 text-foreground"
              />
              <button className="rounded-xl bg-primary px-5 font-semibold text-primary-foreground">{ht("play")}</button>
            </form>
          </div>
        )}
      </div>
    </HubShell>
  );
}
