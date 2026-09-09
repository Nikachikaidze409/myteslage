import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  fullName: z.string().trim().min(2, "Please enter your full name").max(120),
  phone: z.string().trim().min(5, "Please enter a valid mobile number").max(30),
});

export const signupWithCode = createServerFn({ method: "POST" })
  .inputValidator((d) => SignupSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { createClient } = await import("@supabase/supabase-js");

    // Account creation goes through the ordinary public sign-up endpoint, so
    // the platform's own abuse protection and password rules apply. The
    // service-role key is never used to mint accounts from an open endpoint.
    const publicClient = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false } },
    );
    const { data: signed, error: signErr } = await publicClient.auth.signUp({
      email,
      password: data.password,
    });
    if (signErr || !signed.user) {
      console.error("[signup] auth sign-up failed", signErr?.message);
      throw new Error(signErr?.message ?? "Could not create account.");
    }

    // When the email is already registered, Supabase returns a decoy user with
    // a random id that does NOT exist in auth.users (user-enumeration
    // protection). Writing that id into profiles violates profiles_id_fkey.
    if ((signed.user.identities?.length ?? 0) === 0) {
      console.warn("[signup] email already registered; no profile written");
      throw new Error("An account with this email already exists. Please sign in instead.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Authoritative confirmation that the auth.users row really exists before
    // any profile / payment record is created for this id.
    const { data: verified, error: verifyErr } = await supabaseAdmin.auth.admin.getUserById(
      signed.user.id,
    );
    if (verifyErr || !verified?.user) {
      console.error("[signup] could not verify created auth user", verifyErr?.message);
      throw new Error("Could not create account. Please try again.");
    }
    const userId = verified.user.id;

    // Keep the existing experience: the driver is signed in straight away.
    if (!verified.user.email_confirmed_at) {
      const { error: confirmErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });
      if (confirmErr) console.error("[signup] email confirm failed", confirmErr.message);
    }

    // The AFTER INSERT trigger on auth.users already created the profile row.
    // This only fills in the details, and stays idempotent on retries.
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, email, full_name: data.fullName, phone: data.phone },
        { onConflict: "id" },
      );
    if (profileErr) {
      console.error("[signup] profile details save failed", profileErr.message);
      throw new Error("Account created, but we could not save your details. Please sign in and retry.");
    }

    return { ok: true as const };
  });


const ProfileDetailsSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(120),
  phone: z.string().trim().min(5, "Please enter a valid mobile number").max(30),
});

/** Signed-in user updates their own name/phone (used on checkout before paying). */
export const saveProfileDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProfileDetailsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
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
