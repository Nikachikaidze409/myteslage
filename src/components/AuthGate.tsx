import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { claimDevice, verifyDevice } from "@/lib/auth.functions";
import { getDeviceLabel, getOrCreateDeviceId } from "@/lib/device";

import { getPaddleEnvironment } from "@/lib/paddle";
import { anyMembershipValid } from "@/lib/membership";

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const [status, setStatus] = useState<"loading" | "authed" | "anon">("loading");
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let heartbeatTimer: number | null = null;
    let onWake: (() => void) | null = null;
    const deviceId = getOrCreateDeviceId();

    const isTesla = typeof navigator !== "undefined" && /Tesla/i.test(navigator.userAgent);

    // A car that just woke up needs 10-30 s for LTE: keep retrying the
    // session (and its token refresh) before ever sending the driver to /auth.
    const getSessionWithGrace = async () => {
      const deadline = Date.now() + 30_000;
      for (;;) {
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session) return data.session;
          // Stored token exists but refresh failed (offline): try refreshing.
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session) return refreshed.session;
        } catch {
          /* network not ready yet */
        }
        if (!alive || Date.now() > deadline) return null;
        const hasStored = Object.keys(window.localStorage).some((k) => k.includes("auth-token"));
        if (!hasStored && navigator.onLine) return null;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    };

    const bootstrap = async () => {
      const session = await getSessionWithGrace();
      if (!alive) return;
      const data = { session };
      if (!data.session) {
        setStatus("anon");
        navigate({ to: "/auth" });
        return;
      }
      const userId = data.session.user.id;
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      const isAdmin = !!adminRole;
      if (!isAdmin) {
        const { data: subscriptions, error: subscriptionError } = await supabase
          .from("subscriptions")
          .select("status, current_period_end, provider, environment")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        const hasAccess =
          !subscriptionError &&
          anyMembershipValid(subscriptions, { paddleEnvironment: getPaddleEnvironment() });
        if (!hasAccess) {
          try {
            window.sessionStorage.setItem("tsl.no-membership", data.session.user.email ?? "1");
          } catch {
            /* ignore */
          }
          navigate({ to: "/pricing" });
          return;
        }
      }
      // Do NOT claim the device here: merely opening /map (e.g. on the phone
      // after scanning the QR) must never steal the active device and kick the
      // car out. Claiming happens only on an explicit email+password sign-in.
      if (!alive) return;
      setStatus("authed");


      // Reliable fallback for the realtime kick: ask the server every 30s (and
      // whenever the tab wakes up) whether this is still the active device.
      // The Tesla browser has priority: instead of signing it out it silently
      // re-claims the account (also covers a wiped localStorage device id).
      let reclaiming = false;
      const reclaim = async () => {
        if (reclaiming) return;
        reclaiming = true;
        try {
          await claimDevice({ data: { deviceId, label: getDeviceLabel() } });
        } catch {
          /* retry on next tick */
        } finally {
          reclaiming = false;
        }
      };
      const kickOut = async () => {
        if (isTesla) return reclaim();
        try {
          window.sessionStorage.setItem("tsl.kicked-device", "1");
        } catch {
          /* ignore */
        }
        await supabase.auth.signOut();
        window.location.replace("/auth");
      };
      const heartbeat = async () => {
        if (!alive || document.visibilityState === "hidden") return;
        // Never call the server without a live session: after a sign-out or an
        // expired token the request has no bearer header and throws.
        const { data: current } = await supabase.auth.getSession();
        if (!current.session) return;
        try {
          const res = await verifyDevice({ data: { deviceId } });
          if (alive && !res.ok) await kickOut();
        } catch {
          /* network hiccup: ignore, try again next tick */
        }
      };

      heartbeatTimer = window.setInterval(() => void heartbeat(), 30_000);
      onWake = () => void heartbeat();
      document.addEventListener("visibilitychange", onWake);
      window.addEventListener("online", onWake);
      window.addEventListener("focus", onWake);
      void heartbeat();


      channel = supabase
        .channel(`profile-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
          (payload: any) => {
            const next = payload?.new?.active_device_id as string | undefined;
            if (next && next !== deviceId) void kickOut();
          },
        )
        .subscribe();
    };

    void bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setStatus("anon");
        navigate({ to: "/auth" });
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      if (onWake) {
        document.removeEventListener("visibilitychange", onWake);
        window.removeEventListener("online", onWake);
        window.removeEventListener("focus", onWake);
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [navigate]);

  if (status === "loading") {
    return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading…</div>;
  }
  if (status === "anon") return null;
  return <>{children}</>;
}

export async function signOutAndReturn() {
  await supabase.auth.signOut();
  window.location.href = "/auth";
}
