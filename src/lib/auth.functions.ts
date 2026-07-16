import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  code: z.string().min(3).max(64),
});

export const signupWithCode = createServerFn({ method: "POST" })
  .inputValidator((d) => SignupSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codeUpper = data.code.trim().toUpperCase();

    const { data: codeRow, error: codeErr } = await supabaseAdmin
      .from("access_codes")
      .select("code, redeemed_by")
      .eq("code", codeUpper)
      .maybeSingle();
    if (codeErr) throw new Error(codeErr.message);
    if (!codeRow) throw new Error("Invalid access code.");
    if (codeRow.redeemed_by) throw new Error("This access code has already been used.");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Could not create account.");
    }

    const { error: redeemErr } = await supabaseAdmin
      .from("access_codes")
      .update({ redeemed_by: created.user.id, redeemed_at: new Date().toISOString() })
      .eq("code", codeUpper)
      .is("redeemed_by", null);

    if (redeemErr) {
      // Roll back the created auth user so the code stays free.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Could not redeem access code — please try again.");
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
