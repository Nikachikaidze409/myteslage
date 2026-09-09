import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled automatic-renewal worker for Bank of Georgia memberships.
 *
 * Placed under /api/public so an external scheduler can reach it, but it is NOT
 * public: every request must carry a secret that only the server side knows.
 * The caller is authenticated either by the BOG_RENEWAL_CRON_SECRET environment
 * secret or by the private database token used by the hourly database schedule.
 *
 * Safe to run repeatedly: due work is claimed with a database lock and a unique
 * index prevents two charges for the same membership and billing period.
 */
export const Route = createFileRoute("/api/public/payments/bog/process-renewals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const presented =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

        if (!presented) return new Response("Unauthorized", { status: 401 });

        const envSecret = (process.env["BOG_RENEWAL_CRON_SECRET"] ?? "").trim();
        let authorized = envSecret.length > 0 && presented === envSecret;

        if (!authorized) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("cron_tokens")
            .select("token")
            .eq("name", "bog_renewals")
            .maybeSingle();
          authorized = !!data?.token && data.token === presented;
        }

        if (!authorized) return new Response("Unauthorized", { status: 401 });

        const { processDueBogRenewals } = await import("@/lib/bog-renewals.server");
        const summary = await processDueBogRenewals();
        return Response.json(summary);
      },
    },
  },
});
