import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { HubShell } from "@/components/HubShell";
import { GAMES } from "@/games/games";
import { ht } from "@/lib/hub-lang";

export const Route = createFileRoute("/arcade")({
  head: () => ({
    meta: [
      { title: "TMap Arcade — თამაშები Tesla-ს ეკრანზე" },
      { name: "description", content: "7 სენსორული თამაში Tesla-ს ეკრანისთვის: Drift, 2048, Pac-Man, Snake და სხვა." },
      { property: "og:title", content: "TMap Arcade" },
      { property: "og:description", content: "სენსორული თამაშები Tesla-ს ეკრანზე." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <Arcade />
    </AuthGate>
  ),
});

function Arcade() {
  const [active, setActive] = useState<string | null>(null);
  const game = GAMES.find((g) => g.id === active);

  if (game) {
    const G = game.C;
    return (
      <div className="ev-cockpit fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setActive(null)} className="cockpit-glass rounded-xl px-4 py-2 text-sm font-semibold text-foreground">
            ✕ {ht("games")}
          </button>
          <span className="font-semibold text-foreground">{game.emoji} {game.name}</span>
          <span className="w-24" />
        </div>
        <div className="relative flex-1 select-none overflow-hidden">
          <G />
        </div>
      </div>
    );
  }

  return (
    <HubShell back>
      <div className="mx-auto w-full max-w-6xl px-6 pb-10">
        <h1 className="mb-6 text-3xl font-semibold">🎮 TMap Arcade</h1>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4" style={{ perspective: "1200px" }}>
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setActive(g.id)}
              className={`hub-tile !min-h-[180px] bg-gradient-to-br ${g.tone}`}
              style={{ ["--glow" as string]: "var(--primary)" }}
            >
              <span className="text-5xl">{g.emoji}</span>
              <span className="text-lg font-bold text-foreground">{g.name}</span>
              <span className="text-xs text-muted-foreground">{g.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </HubShell>
  );
}
