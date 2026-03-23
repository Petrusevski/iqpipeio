import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "./useAdmin";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface WsRow {
  id:             string;
  name:           string;
  plan:           string;
  trialEndsAt:    string | null;
  createdAt:      string;
  billingEmail:   string | null;
  stripeCustomerId:     string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd:     string | null;
  owner:  { email: string; fullName: string } | null;
  counts: { leads: number; deals: number; integrations: number };
}

const PLAN_BADGE: Record<string, string> = {
  trial:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  free:    "bg-slate-700/50 text-slate-400 border-slate-600",
  starter: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  growth:  "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  agency:  "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

const PLANS = ["", "trial", "free", "starter", "growth", "agency"];

export default function AdminWorkspacesPage() {
  const [rows,    setRows]    = useState<WsRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [plan,    setPlan]    = useState("");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (plan) params.set("plan", plan);
      const data = await adminFetch<{ workspaces: WsRow[]; total: number }>(`/workspaces?${params}`);
      setRows(data.workspaces);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, plan]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Workspaces</h1>
          <p className="text-xs text-slate-500">{total} total</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={plan}
            onChange={(e) => { setPlan(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {PLANS.map((p) => <option key={p} value={p}>{p || "All plans"}</option>)}
          </select>
          <button onClick={load} className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-slate-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800">
              <tr>
                {["Workspace", "Owner", "Plan", "Integrations", "Leads", "Deals", "Renews", "Created"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((ws) => (
                <tr key={ws.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-slate-200 font-medium whitespace-nowrap">{ws.name}</td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{ws.owner?.email ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium capitalize ${PLAN_BADGE[ws.plan] ?? PLAN_BADGE.free}`}>
                      {ws.plan}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-center">{ws.counts.integrations}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-center">{ws.counts.leads}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-center">{ws.counts.deals}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {ws.currentPeriodEnd ? new Date(ws.currentPeriodEnd).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {new Date(ws.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page} of {pages}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={13} />
            </button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
              className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
