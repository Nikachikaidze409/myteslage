import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listRegistrations, type RegistrationRow } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin · Tesla Map Georgia" },
      { name: "description", content: "Admin panel for Tesla Map Georgia." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AdminPage() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<"loading" | "ok" | "blocked">("loading");
  const list = useServerFn(listRegistrations);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "registrations"],
    queryFn: () => list(),
    enabled: false,
  });

  // Client-side gate: must be signed in AND admin. Server function re-checks
  // the role, so this only controls UX.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!alive) return;
      if (!s.session) {
        navigate({ to: "/auth" });
        return;
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", s.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!alive) return;
      if (!role) {
        setGate("blocked");
        return;
      }
      setGate("ok");
      void refetch();
    })();
    return () => {
      alive = false;
    };
  }, [navigate, refetch]);

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return data ?? [];
    return data.filter((r) =>
      [r.email, r.fullName, r.phone, r.status, r.plan]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [data, query]);

  if (gate === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050708] text-white/60">
        Loading…
      </div>
    );
  }
  if (gate === "blocked") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050708] px-4 text-center text-white">
        <div>
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-white/60">
            This area is restricted to admins.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  const exportCsv = () => {
    const rows = filtered;
    const header = ["Name", "Phone", "Email", "Payment status", "Plan", "Expires", "Signup date"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.fullName ?? "",
        r.phone ?? "",
        r.email ?? "",
        r.status ?? "",
        r.plan,
        r.expiresAt ?? "",
        r.createdAt ?? "",
      ].map(csvCell);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tesla-map-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#050708] text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-black">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">
              ⚡
            </span>
            Tesla Map Georgia
          </Link>
          <span className="text-sm font-semibold text-white/50">Admin</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Registered users</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!filtered.length}
              className="rounded-xl bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb] disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone, status…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-[#3b82f6]"
          />
        </div>

        <p className="mt-3 text-sm text-white/50">
          {filtered.length} shown
          {data && filtered.length !== data.length ? ` of ${data.length} total` : ""}
        </p>

        {isLoading ? (
          <p className="mt-8 text-white/50">Loading…</p>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            {error.message}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-white/[0.03] text-left text-white/60">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Expires</th>
                  <th className="px-4 py-3 font-semibold">Signup</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: RegistrationRow) => (
                  <tr key={r.id} className="border-t border-white/5 align-top">
                    <td className="px-4 py-3 font-medium text-white">{r.fullName || "—"}</td>
                    <td className="px-4 py-3 text-white/80">{r.phone || "—"}</td>
                    <td className="px-4 py-3 text-white/80">{r.email || "—"}</td>
                    <td className="px-4 py-3">
                      <PaymentBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-white/80">{r.plan}</td>
                    <td className="px-4 py-3 text-white/60">{formatDate(r.expiresAt)}</td>
                    <td className="px-4 py-3 text-white/60">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function PaymentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-white/40">No payment</span>;
  const active = ["active", "trialing", "past_due"].includes(status);
  const grace = status === "canceled";
  const cls = active
    ? "bg-emerald-500/15 text-emerald-300"
    : grace
      ? "bg-amber-500/15 text-amber-300"
      : "bg-white/10 text-white/60";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
