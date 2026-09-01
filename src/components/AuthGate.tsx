import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { claimDevice } from "@/lib/auth.functions";
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

      channel = supabase
        .channel(`profile-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
          (payload: any) => {
            const next = payload?.new?.active_device_id as string | undefined;
            if (next && next !== deviceId) {
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
