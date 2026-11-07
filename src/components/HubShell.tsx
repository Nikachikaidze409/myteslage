import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import hubBg from "@/assets/hub-bg.jpg";
import { ht } from "@/lib/hub-lang";

/** Shared premium backdrop + TMap header for the hub, arcade and YouTube screens. */
export function HubShell({ children, back = false }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="ev-cockpit relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <img src={hubBg} alt="" width={1920} height={1088} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background/90" />
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {back && (
            <Link to="/hub" className="cockpit-glass rounded-xl px-4 py-2 text-sm font-semibold text-foreground">
              ← {ht("back")}
            </Link>
          )}
          <span className="hub-logo text-2xl font-black tracking-tight">
            T<span className="text-primary">MAP</span>
          </span>
        </div>
      </header>
      <main className="relative z-10 flex flex-1 flex-col">{children}</main>
    </div>
  );
}
