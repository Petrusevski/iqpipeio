import { useEffect, useState } from "react";
import { adminFetch } from "./useAdmin";
import { DollarSign, TrendingUp, XCircle, Loader2, RefreshCw } from "lucide-react";

interface BillingSub {
  id:       string;
  name:     string;
  plan:     string;
  email:    string | undefined;
  renewsAt: string | null;
}

interface BillingData {
  mrr:                 number;
  arr:                 number;
  planBreakdown:       { plan: string; count: number }[];
  activeSubscriptions: BillingSub[];
  cancelledTotal:      number;
}

const PLAN_COLOR: Record<string, string> = {
  starter: "text-sky-400", growth: "text-indigo-400", agency: "text-violet-400",
};

const PLAN_MRR: Record<string, number> = { starter: 29, growth: 99, agency: 299 };

export default function AdminBillingPage() {
  const [data,    setData]    = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await adminFetch<BillingData>("/billing")); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Loading…
    </div>
  );
  if (error) return <p className="text-rose-400 text-sm p-4">{error}</p>;
  if (!data) return null;

  const paidPlans = data.planBreakdown.filter((r) => PLAN_MRR[r.plan]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Billing</h1>
          <p className="text-xs text-slate-500">Revenue and subscription overview</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={13} className="text-emerald-400" />
            <span className="text-xs text-slate-500">Est. MRR</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">${data.mrr.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">from paid plans only</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={13} className="text-indigo-400" />
            <span className="text-xs text-slate-500">Est. ARR</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">${data.arr.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">MRR × 12</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={13} className="text-rose-400" />
            <span className="text-xs text-slate-500">Churned</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{data.cancelledTotal}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">workspaces on free after paying</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Plan breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Paid plan breakdown</h2>
          {paidPlans.length === 0 ? (
            <p className="text-xs text-slate-600">No paid subscriptions yet.</p>
          ) : (
            <div className="space-y-3">
              {paidPlans.map((row) => (
                <div key={row.plan}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={`capitalize font-medium ${PLAN_COLOR[row.plan] ?? "text-slate-300"}`}>
                      {row.plan}
                    </span>
                    <span className="text-slate-400">{row.count} × ${PLAN_MRR[row.plan]}/mo = <span className="text-emerald-400 font-semibold">${row.count * PLAN_MRR[row.plan]}/mo</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active subscriptions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active subscriptions</h2>
          <div className="space-y-2.5 overflow-y-auto max-h-72">
            {data.activeSubscriptions.length === 0 ? (
              <p className="text-xs text-slate-600">None yet.</p>
            ) : (
              data.activeSubscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-200">{sub.name}</div>
                    <div className="text-[11px] text-slate-500">{sub.email ?? "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[11px] font-semibold capitalize ${PLAN_COLOR[sub.plan] ?? "text-slate-400"}`}>
                      {sub.plan}
                    </div>
                    <div className="text-[10px] text-slate-600">
                      {sub.renewsAt ? `Renews ${new Date(sub.renewsAt).toLocaleDateString()}` : "—"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
