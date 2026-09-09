import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Name shown when profiles.full_name is missing: the email local part. */
export function displayNameFrom(fullName: string | null | undefined, email: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  if (name) return name;
  const local = (email ?? "").split("@")[0]?.trim();
  return local || "Account";
}

/**
 * Compact signed-in account control for the public header: shows the user's
 * name and a lightweight dropdown with the email and a sign-out action.
 * Renders nothing when signed out.
 */
export function AccountMenu({ signOutLabel = "Sign out" }: { signOutLabel?: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (userEmail: string | null, userId: string | null) => {
      if (cancelled) return;
      setEmail(userEmail);
      if (!userId) {
        setFullName(null);
        return;
      }
      const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      if (!cancelled) setFullName(data?.full_name ?? null);
    };

    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      void load(user?.email ?? null, user?.id ?? null);
    });

    // React immediately to sign-in / sign-out; no polling.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        setEmail(null);
        setFullName(null);
        setOpen(false);
        return;
      }
      void load(user.email ?? null, user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!email) return null;

  const name = displayNameFrom(fullName, email);

  const signOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    window.location.assign("/");
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[180px] items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
      >
        <span className="truncate">{name}</span>
        <span aria-hidden="true" className="text-white/50">▼</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-white/10 bg-[#0b0f11] p-3 shadow-2xl"
        >
          <div className="truncate text-sm font-semibold text-white">{name}</div>
          <div className="mt-0.5 truncate text-xs text-white/50">{email}</div>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void signOut()}
            className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          >
            {busy ? "…" : signOutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
