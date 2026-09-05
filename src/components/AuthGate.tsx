import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { claimDevice, verifyDevice } from "@/lib/auth.functions";
import { getOrCreateDeviceId, getDeviceLabel } from "@/lib/device";
import { getPaddleEnvironment } from "@/lib/paddle";

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

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
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
        const { data: subscription, error: subscriptionError } = await supabase
          .from("subscriptions")
          .select("status, current_period_end")
          .eq("user_id", userId)
          .eq("environment", getPaddleEnvironment())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const periodIsOpen = !subscription?.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now();
        const hasAccess = !subscriptionError && !!subscription && periodIsOpen &&
          ["active", "trialing", "past_due", "canceled"].includes(subscription.status);
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
      try {
        await claimDevice({ data: { deviceId, label: getDeviceLabel() } });
      } catch {
        /* soft-fail; realtime kick still works */
      }
      if (!alive) return;
      setStatus("authed");

      // Reliable fallback for the realtime kick: ask the server every 30s (and
      // whenever the tab wakes up) whether this is still the active device.
      const kickOut = async () => {
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
            if (next && next !== deviceId) {
              try {
                window.sessionStorage.setItem("tsl.kicked-device", "1");
              } catch {
                /* ignore */
              }
              void supabase.auth.signOut().then(() => navigate({ to: "/auth" }));
            }
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
