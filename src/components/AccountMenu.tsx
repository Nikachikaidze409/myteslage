import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cancelBogAutoRenew, getBogSubscriptionSummary } from "@/lib/bog.functions";

interface SubscriptionSummary {
  active: boolean;
  plan?: string | null;
  validUntil?: string | null;
  autoRenew?: boolean;
  nextBillingAt?: string | null;
  canceled?: boolean;
  proratedUpgrade?: boolean;
}

function geoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("ka-GE") : "—";
}

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
  const [membership, setMembership] = useState<SubscriptionSummary | null>(null);
  const [canceling, setCanceling] = useState(false);
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

  // Membership details are loaded lazily, only for a signed-in user.
  useEffect(() => {
    if (!open || !email || membership) return;
    let cancelled = false;
    void getBogSubscriptionSummary()
      .then((data) => {
        if (!cancelled) setMembership(data as SubscriptionSummary);
      })
      .catch(() => {
        /* the menu stays usable without membership details */
      });
    return () => {
      cancelled = true;
    };
  }, [open, email, membership]);

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

          {membership?.active && (
            <div className="mt-3 space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
              <div>
                <span className="text-white/50">გეგმა: </span>
                <span className="font-semibold text-white">
                  {membership.plan === "quarterly" ? "3 თვე" : "1 თვე"}
                </span>
              </div>
              <div>
                <span className="text-white/50">სტატუსი: </span>
                <span className="font-semibold text-white">აქტიური</span>
              </div>
              <div>
                <span className="text-white/50">ძალაშია: </span>
                <span className="font-semibold text-white">{geoDate(membership.validUntil)}</span>
              </div>

              {membership.autoRenew ? (
                <>
                  <div>ავტომატური განახლება: ჩართულია</div>
                  <div>შემდეგი გადახდა: {geoDate(membership.nextBillingAt)}</div>
                  <button
                    type="button"
                    disabled={canceling}
                    onClick={() => {
                      setCanceling(true);
                      void cancelBogAutoRenew()
                        .then(() =>
                          setMembership((m) =>
                            m ? { ...m, autoRenew: false, canceled: true, nextBillingAt: null } : m,
                          ),
                        )
                        .finally(() => setCanceling(false));
                    }}
                    className="mt-2 w-full rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    {canceling ? "…" : "ავტომატური განახლების გაუქმება"}
                  </button>
                </>
              ) : membership.canceled ? (
                <>
                  <div>ავტომატური განახლება გაუქმებულია.</div>
                  <div>თქვენი გამოწერა აქტიური დარჩება {geoDate(membership.validUntil)}-მდე.</div>
                </>
              ) : membership.proratedUpgrade ? (
                <>
                  <div>ავტომატური განახლება ამ განახლებაზე არ არის ჩართული.</div>
                  <div>
                    3-თვიანი პერიოდის დასრულების შემდეგ შეგიძლიათ გამოწერა განაახლოთ სრული 3-თვიანი
                    ფასით.
                  </div>
                </>
              ) : (
                <div>ავტომატური განახლება: გამორთულია</div>
              )}
            </div>
          )}
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
