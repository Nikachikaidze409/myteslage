import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
});

export const signupWithCode = createServerFn({ method: "POST" })
  .inputValidator((d) => SignupSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Could not create account.");
    }

    return { ok: true as const };
  });

const ClaimSchema = z.object({
  deviceId: z.string().min(4).max(80),
  label: z.string().max(120).optional(),
});

export const claimDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ClaimSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        active_device_id: data.deviceId,
        active_device_label: data.label ?? null,
        active_device_updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, deviceId: data.deviceId };
  });

const VerifySchema = z.object({ deviceId: z.string().min(1).max(80) });

/**
 * Server-side check that this browser is still the account's active device.
 * Reliable fallback for the realtime kick (which only works while the tab is
 * alive and connected).
 */
export const verifyDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => VerifySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("active_device_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) return { ok: true as const }; // soft-fail: never lock people out on a transient error

    const active = profile?.active_device_id ?? null;
    if (!active || active === data.deviceId) return { ok: true as const };
    return { ok: false as const, reason: "other-device" as const };
  });
