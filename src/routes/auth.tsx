import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signupWithCode, claimDevice } from "@/lib/auth.functions";
import { getOrCreateDeviceId, getDeviceLabel } from "@/lib/device";

import { LegalFooter } from "@/components/LegalFooter";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in or create an account | TMap Georgia" },
      { name: "description", content: "Sign in to TMap Georgia or create your navigation membership account." },
      { property: "og:title", content: "Sign in | TMap Georgia" },
      { property: "og:description", content: "Access your TMap Georgia navigation membership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://tmap.ge/auth" }],
  }),
});

type AuthLang = "base" | "hy" | "ru";

/**
 * Auth page copy. "base" is the original bilingual Georgian/English text and
 * stays the default; Armenian and Russian visitors can switch with the chips
 * in the top-right corner.
 */
const AUTH_T: Record<AuthLang, Record<string, string>> = {
  base: {
    signIn: "Sign in",
    createAccount: "Create your account",
    resetTitle: "Reset password · პაროლის აღდგენა",
    resetLead:
      "Enter your email and we'll send you a reset link. · შეიყვანეთ ელფოსტა და გამოგიგზავნით აღდგენის ბმულს.",
    lead: "Membership required. One account = one device. Signing in on a new device signs the old one out.",
    kicked:
      "Your account was signed in on another device. This device was signed out. Sign in again to continue.",
    signedInAs: "You are signed in as",
    continue: "Continue →",
    notYou: "Not you? Sign out",
    fullName: "Full name",
    mobile: "Mobile number",
    email: "Email",
    password: "Password",
    forgot: "Forgot password? · დაგავიწყდა პაროლი?",
    wait: "Please wait…",
    sendReset: "Send reset link · ბმულის გაგზავნა",
    createBtn: "Create account",
    toSignup: "New here? Create an account · დარეგისტრირებისთვის დააჭირე აქ →",
    toSignin: "← Back to sign in · დაბრუნება",
    resetSent: "Reset link sent! Check your email. · აღდგენის ბმული გამოგზავნილია ელფოსტაზე.",
    created: "Account created. Signing you in…",
    failed: "Something went wrong",
  },
  hy: {
    signIn: "Մուտք",
    createAccount: "Ստեղծել հաշիվ",
    resetTitle: "Վերականգնել գաղտնաբառը",
    resetLead: "Մուտքագրեք ձեր էլ. փոստը և մենք կուղարկենք վերականգնման հղում։",
    lead: "Պահանջվում է բաժանորդագրություն։ Մեկ հաշիվ = մեկ սարք։ Նոր սարքից մուտք գործելիս նախորդը դուրս է գալիս։",
    kicked:
      "Ձեր հաշվով մուտք են գործել այլ սարքից։ Այս սարքը դուրս է եկել։ Շարունակելու համար մուտք գործեք կրկին։",
    signedInAs: "Դուք մուտք եք գործել որպես",
    continue: "Շարունակել →",
    notYou: "Դուք չե՞ք։ Դուրս գալ",
    fullName: "Անուն Ազգանուն",
    mobile: "Բջջային համար",
    email: "Էլ. փոստ",
    password: "Գաղտնաբառ",
    forgot: "Մոռացե՞լ եք գաղտնաբառը",
    wait: "Խնդրում ենք սպասել…",
    sendReset: "Ուղարկել հղումը",
    createBtn: "Ստեղծել հաշիվ",
    toSignup: "Նո՞ր եք այստեղ։ Ստեղծեք հաշիվ →",
    toSignin: "← Վերադառնալ մուտքին",
    resetSent: "Վերականգնման հղումն ուղարկված է։ Ստուգեք ձեր էլ. փոստը։",
    created: "Հաշիվը ստեղծված է։ Մուտք ենք գործում…",
    failed: "Սխալ տեղի ունեցավ",
  },
  ru: {
    signIn: "Вход",
    createAccount: "Создать аккаунт",
    resetTitle: "Восстановление пароля",
    resetLead: "Введите вашу почту — мы пришлём ссылку для восстановления.",
    lead: "Требуется подписка. Один аккаунт = одно устройство. Вход с нового устройства отключает предыдущее.",
    kicked:
      "В ваш аккаунт вошли с другого устройства. Это устройство отключено. Войдите снова, чтобы продолжить.",
    signedInAs: "Вы вошли как",
    continue: "Продолжить →",
    notYou: "Это не вы? Выйти",
    fullName: "Имя и фамилия",
    mobile: "Номер телефона",
    email: "Эл. почта",
    password: "Пароль",
    forgot: "Забыли пароль?",
    wait: "Пожалуйста, подождите…",
    sendReset: "Отправить ссылку",
    createBtn: "Создать аккаунт",
    toSignup: "Впервые здесь? Создайте аккаунт →",
    toSignin: "← Назад ко входу",
    resetSent: "Ссылка для восстановления отправлена. Проверьте почту.",
    created: "Аккаунт создан. Выполняем вход…",
    failed: "Что-то пошло не так",
  },
};

const AUTH_LANG_KEY = "tsl.auth-lang";
const AUTH_LANG_CHIPS: { id: AuthLang; label: string }[] = [
  { id: "base", label: "GE/EN" },
  { id: "hy", label: "ՀԱՅ" },
  { id: "ru", label: "РУС" },
];

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
  const [lang, setLang] = useState<AuthLang>("base");
  const t = AUTH_T[lang];

  // Remember the visitor's choice, but always start from the bilingual default
  // on a fresh browser so nothing changes for existing Georgian users.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUTH_LANG_KEY);
      if (saved === "hy" || saved === "ru" || saved === "base") setLang(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const chooseLang = (next: AuthLang) => {
    setLang(next);
    try {
      window.localStorage.setItem(AUTH_LANG_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const insertAt = () => {
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
        setInfo(t.resetSent!);
        return;
      }
      if (mode === "signup") {
        await signupWithCode({ data: { email, password, fullName, phone } });
        setInfo(t.created!);
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw new Error(signErr.message);
      // An explicit email+password sign-in is the only event that takes over the
      // active device slot (subscription-sharing protection).
      try {
        await claimDevice({ data: { deviceId: getOrCreateDeviceId(), label: getDeviceLabel() } });
      } catch {
        /* soft-fail: sign-in still succeeds */
      }
      navigate({ to: nextDest() });

    } catch (e: any) {
      setError(e?.message ?? t.failed!);
    } finally {
      setBusy(false);
    }
  };

  // If the user picked a plan on /pricing, send them to /checkout after auth.
  function nextDest(): "/checkout" | "/map" {
    if (typeof window === "undefined") return "/map";
    const p = window.localStorage.getItem("tsl.pending-plan");
    return p === "monthly" || p === "quarterly" || p === "annual" ? "/checkout" : "/map";
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="grid flex-1 place-items-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="font-display text-[11px] font-bold uppercase tracking-widest text-primary">
            TMap Georgia
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-input bg-muted/40 p-0.5 text-[11px] font-bold">
            {AUTH_LANG_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => chooseLang(chip.id)}
                aria-pressed={lang === chip.id}
                className={`rounded-md px-2 py-1 transition ${
                  lang === chip.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        <h1 className="font-display mt-1 text-2xl font-bold">
          {mode === "signin" ? t.signIn : mode === "signup" ? t.createAccount : t.resetTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot" ? t.resetLead : t.lead}
        </p>

        {kickedDevice && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary" role="status">
            {t.kicked}
          </div>
        )}

        {currentEmail && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="text-muted-foreground">
              {t.signedInAs} <span className="font-semibold text-foreground">{currentEmail}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: nextDest() })}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
              >
                {t.continue}
              </button>
              <button
                type="button"
                onClick={() => void switchAccount()}
                className="rounded-lg border border-input px-3 py-2 text-xs font-semibold"
              >
                {t.notYou}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">{t.fullName}</span>
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
                <span className="text-xs font-semibold text-muted-foreground">{t.mobile}</span>
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
              {t.email}
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
              <span className="text-xs font-semibold text-muted-foreground">{t.password}</span>
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
              {t.forgot}
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
              ? t.wait
              : mode === "signin"
                ? t.signIn
                : mode === "signup"
                  ? t.createBtn
                  : t.sendReset}
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
          {mode === "signin" ? t.toSignup : t.toSignin}
        </button>
      </div>
      </main>
      <LegalFooter />
    </div>
  );
}
