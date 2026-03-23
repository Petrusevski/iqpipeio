import { useEffect, useState } from "react";
import { adminFetch } from "./useAdmin";
import {
  Users, Building2, TrendingUp, Zap, Activity,
  DollarSign, UserCheck, Loader2, RefreshCw,
} from "lucide-react";

interface Stats {
  totalUsers:          number;
  totalWorkspaces:     number;
  totalLeads:          number;
  totalTouchpoints:    number;
  totalDeals:          number;
  totalActivities:     number;
  estimatedMrr:        number;
  activeWorkspaces30d: number;
  planBreakdown:       { plan: string; count: number }[];
  recentSignups:       { id: string; email: string; fullName: string; createdAt: string }[];
}

const PLAN_COLOR: Record<string, string> = {
  trial:   "text-amber-400",
  free:    "text-slate-400",
  starter: "text-sky-400",
  growth:  "text-indigo-400",
  agency:  "text-violet-400",
};

function StatCard({
  label, value, icon: Icon, sub, color = "text-indigo-400",
}: {
  label: string; value: string | number; icon: any; sub?: string; color?: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon size={14} className={color} />
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<Stats>("/stats");
      setStats(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-2 text-slate-500">
      <Loader2 size={18} className="animate-spin" /> Loading…
    </div>
  );

  if (error) return (
    <div className="text-rose-400 text-sm p-4">{error}</div>
  );

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Dashboard</h1>
          <p className="text-xs text-slate-500">Platform-wide KPIs</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total users"       value={stats.totalUsers}          icon={Users}      color="text-indigo-400" />
        <StatCard label="Workspaces"         value={stats.totalWorkspaces}     icon={Building2}  color="text-sky-400" />
        <StatCard label="Est. MRR"           value={`$${stats.estimatedMrr}`} icon={DollarSign} color="text-emerald-400" sub="from paid plans" />
        <StatCard label="Active (30d)"       value={stats.activeWorkspaces30d} icon={UserCheck}  color="text-violet-400" sub="workspaces" />
        <StatCard label="Leads"              value={stats.totalLeads.toLocaleString()}       icon={TrendingUp} color="text-amber-400" />
        <StatCard label="Touchpoints"        value={stats.totalTouchpoints.toLocaleString()} icon={Zap}        color="text-rose-400" />
        <StatCard label="Deals"              value={stats.totalDeals.toLocaleString()}       icon={Activity}   color="text-teal-400" />
        <StatCard label="Activities"         value={stats.totalActivities.toLocaleString()}  icon={Activity}   color="text-slate-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Plan breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Plan distribution</h2>
          <div className="space-y-2">
            {stats.planBreakdown
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <div key={row.plan} className="flex items-center justify-between text-sm">
                  <span className={`capitalize font-medium ${PLAN_COLOR[row.plan] ?? "text-slate-300"}`}>
                    {row.plan}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${Math.min(100, (row.count / stats.totalWorkspaces) * 100)}%` }}
                      />
                    </div>
                    <span className="text-slate-300 w-6 text-right">{row.count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Recent signups */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent signups</h2>
          <div className="space-y-2">
            {stats.recentSignups.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-200">{u.fullName}</div>
                  <div className="text-[11px] text-slate-500">{u.email}</div>
                </div>
                <div className="text-[11px] text-slate-600">
                  {new Date(u.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
