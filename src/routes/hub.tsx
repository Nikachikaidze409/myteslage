import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { HubShell } from "@/components/HubShell";
import { ht } from "@/lib/hub-lang";

export const Route = createFileRoute("/hub")({
  head: () => ({
    meta: [
      { title: "TMap Hub — ნავიგაცია, თამაშები, YouTube" },
      { name: "description", content: "TMap მთავარი მენიუ Tesla-სთვის: ნავიგაცია, თამაშები და YouTube ერთ ეკრანზე." },
      { property: "og:title", content: "TMap Hub" },
      { property: "og:description", content: "ნავიგაცია, თამაშები და YouTube Tesla-ს ეკრანზე." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <Hub />
    </AuthGate>
  ),
});

const TILES = [
  { to: "/map", icon: "🧭", title: () => ht("nav"), sub: () => ht("navSub"), glow: "var(--primary)" },
  { to: "/arcade", icon: "🎮", title: () => ht("games"), sub: () => ht("gamesSub"), glow: "var(--hub-pink)" },
  { to: "/youtube", icon: "▶", title: () => ht("yt"), sub: () => ht("ytSub"), glow: "var(--destructive)" },
] as const;

function Hub() {
  return (
    <HubShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10">
        <div className="text-center">
          <div className="text-sm uppercase tracking-[0.4em] text-muted-foreground">{ht("welcome")}</div>
          <h1 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">{ht("choose")}</h1>
        </div>
        <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3" style={{ perspective: "1200px" }}>
          {TILES.map((t) => (
            <Link key={t.to} to={t.to} className="hub-tile group" style={{ ["--glow" as string]: t.glow }}>
              <span className="hub-tile-icon">{t.icon}</span>
              <span className="text-2xl font-bold text-foreground">{t.title()}</span>
              <span className="text-sm text-muted-foreground">{t.sub()}</span>
            </Link>
          ))}
        </div>
      </div>
    </HubShell>
  );
}
