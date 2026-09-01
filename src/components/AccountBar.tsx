import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shows the currently signed-in account with a way to sign out and use a
 * different email. Without this, a user who signed up with a typo'd email is
 * trapped on the paywall with no way back to the sign-in screen.
 */
export function AccountBar({ note }: { note?: string | null }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  if (!email) return null;

  const signOut = async () => {
    setBusy(true);
    try {
      window.sessionStorage.removeItem("tsl.no-membership");
      window.localStorage.removeItem("tsl.pending-plan");
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-white/70">
          Signed in as <span className="font-semibold text-white">{email}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
        >
          {busy ? "Signing out…" : "Sign out / use another email"}
        </button>
      </div>
      {note && <p className="mt-2 text-white/50">{note}</p>}
    </div>
  );
}
