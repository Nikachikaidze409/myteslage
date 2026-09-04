import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password · Tesla Map Georgia" },
      { name: "description", content: "Set a new password for your Tesla Map Georgia account." },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Recovery links arrive with type=recovery in the URL hash; Supabase
    // exchanges it for a session automatically.
    const hash = window.location.hash;
    if (!hash.includes("type=recovery")) {
      setInvalid(true);
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match. · პაროლები არ ემთხვევა.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw new Error(err.message);
      setDone(true);
      setTimeout(() => navigate({ to: "/map" }), 1500);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl">
        <div className="font-display text-[11px] font-bold uppercase tracking-widest text-primary">
          Tesla · Georgia
        </div>
        <h1 className="font-display mt-1 text-2xl font-bold">
          Set a new password · ახალი პაროლი
        </h1>

        {invalid && (
          <div className="mt-4 rounded-xl border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/5 p-3 text-sm text-[color:var(--bad)]">
            This reset link is invalid or has expired. Request a new one from the{" "}
            <Link to="/auth" className="font-semibold underline">
              sign in page
            </Link>
            .
          </div>
        )}

        {done ? (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
            Password updated! Taking you to the map… · პაროლი შეიცვალა!
          </div>
        ) : ready ? (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">New password · ახალი პაროლი</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Repeat password · გაიმეორეთ პაროლი</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
              />
            </label>
            {error && (
              <div className="rounded-lg border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/5 p-3 text-sm text-[color:var(--bad)]">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="font-display h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Please wait…" : "Save new password · შენახვა"}
            </button>
          </form>
        ) : (
          !invalid && <p className="mt-4 text-sm text-muted-foreground">Checking your reset link…</p>
        )}
      </div>
    </div>
  );
}
