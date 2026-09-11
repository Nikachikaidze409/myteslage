import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signupWithCode } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [kickedDevice, setKickedDevice] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const insertAt = () => {
    console.log("[insertAt] called, email=", email);
    const el = emailRef.current;
    if (!el) {
      setEmail((email ?? "") + "@");
      return;
    }
    const start = el.selectionStart ?? email.length;
    const end = el.selectionEnd ?? email.length;
    const next = email.slice(0, start) + "@" + email.slice(end);
    setEmail(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + 1;
      el.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentEmail(data.session?.user.email ?? null);
    });
    try {
      if (window.sessionStorage.getItem("tsl.kicked-device") === "1") {
        setKickedDevice(true);
        window.sessionStorage.removeItem("tsl.kicked-device");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const switchAccount = async () => {
    try {
      window.sessionStorage.removeItem("tsl.no-membership");
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setCurrentEmail(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetErr) throw new Error(resetErr.message);
        setInfo("Reset link sent! Check your email. · აღდგენის ბმული გამოგზავნილია ელფოსტაზე.");
        return;
      }
      if (mode === "signup") {
        await signupWithCode({ data: { email, password, fullName, phone } });
        setInfo("Account created. Signing you in…");
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw new Error(signErr.message);
      navigate({ to: nextDest() });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // If the user picked a plan on /pricing, send them to /checkout after auth.
  function nextDest(): "/checkout" | "/map" {
    if (typeof window === "undefined") return "/map";
    const p = window.localStorage.getItem("tsl.pending-plan");
    return p === "monthly" || p === "quarterly" ? "/checkout" : "/map";
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl">
        <div className="font-display text-[11px] font-bold uppercase tracking-widest text-primary">
          Tesla · Georgia
        </div>
        <h1 className="font-display mt-1 text-2xl font-bold">
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset password · პაროლის აღდგენა"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot"
            ? "Enter your email and we'll send you a reset link. · შეიყვანეთ ელფოსტა და გამოგიგზავნით აღდგენის ბმულს."
            : "Membership required. One account = one device. Signing in on a new device signs the old one out."}
        </p>

        {kickedDevice && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary" role="status">
            Your account was signed in on another device. This device was signed out. Sign in again to continue.
          </div>
        )}

        {currentEmail && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="text-muted-foreground">
              You are signed in as <span className="font-semibold text-foreground">{currentEmail}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: nextDest() })}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
              >
                Continue →
              </button>
              <button
                type="button"
                onClick={() => void switchAccount()}
                className="rounded-lg border border-input px-3 py-2 text-xs font-semibold"
              >
                Not you? Sign out
              </button>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Full name</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Mobile number</span>
                <input
                  type="tel"
                  required
                  minLength={5}
                  autoComplete="tel"
                  placeholder="+995 5XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                />
              </label>
            </>
          )}
          <div className="block">
            <label htmlFor="auth-email" className="text-xs font-semibold text-muted-foreground">
              Email
            </label>
            <div className="relative mt-1">
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-background px-3 pr-12 text-base"
              />
              <button
                type="button"
                onClick={insertAt}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Insert at sign"
                className="font-display absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-input bg-background px-2 py-1 text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                @
              </button>
            </div>
          </div>
          {mode !== "forgot" && (
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
              />
            </label>
          )}
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setInfo(null);
              }}
              className="text-sm font-semibold text-primary hover:brightness-110"
            >
              Forgot password? · დაგავიწყდა პაროლი?
            </button>
          )}
          {error && (
            <div className="rounded-lg border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/5 p-3 text-sm text-[color:var(--bad)]">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="font-display h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110 disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link · ბმულის გაგზავნა"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="mt-4 w-full text-base font-bold text-primary hover:brightness-110"
        >
          {mode === "signin"
            ? "New here? Create an account · დარეგისტრირებისთვის დააჭირე აქ →"
            : "← Back to sign in · დაბრუნება"}
        </button>
      </div>
    </div>
  );
}
