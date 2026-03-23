import { useEffect, useState } from "react";
import { adminFetch } from "./useAdmin";
import { Loader2, RefreshCw, Zap, TrendingUp, Briefcase } from "lucide-react";

interface Lead { id: string; email: string; company: string | null; source: string | null; createdAt: string; workspace: { name: string } | null; }
interface Deal { id: string; name: string; stage: string; amount: number | null; currency: string | null; createdAt: string; workspace: { name: string } | null; }
interface Tp   { id: string; tool: string; channel: string; eventType: string; recordedAt: string; workspaceId: string; }

interface ActivityData { recentLeads: Lead[]; recentDeals: Deal[]; recentTouchpoints: Tp[]; }

type Tab = "touchpoints" | "leads" | "deals";

export default function AdminActivityPage() {
  const [data,    setData]    = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>("touchpoints");
  const [error,   setError]   = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await adminFetch<ActivityData>("/activity?limit=100")); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: "touchpoints", label: "Touchpoints", icon: Zap,         count: data?.recentTouchpoints.length ?? 0 },
    { key: "leads",       label: "Leads",        icon: TrendingUp,  count: data?.recentLeads.length ?? 0 },
    { key: "deals",       label: "Deals",        icon: Briefcase,   count: data?.recentDeals.length ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Activity</h1>
          <p className="text-xs text-slate-500">Recent platform-wide events</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              tab === key ? "bg-indigo-600/20 text-indigo-300" : "text-slate-500 hover:text-slate-200"
            }`}
          >
            <Icon size={11} /> {label}
            <span className="text-[10px] opacity-60">({count})</span>
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-slate-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : tab === "touchpoints" ? (
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800">
              <tr>
                {["Tool", "Channel", "Event type", "Workspace", "At"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data?.recentTouchpoints.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-200 font-medium whitespace-nowrap">{t.tool}</td>
                  <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{t.channel}</td>
                  <td className="px-4 py-2 text-indigo-400 whitespace-nowrap">{t.eventType}</td>
                  <td className="px-4 py-2 text-slate-500 font-mono text-[10px] whitespace-nowrap">{t.workspaceId.slice(0, 8)}…</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{new Date(t.recordedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "leads" ? (
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800">
              <tr>
                {["Email", "Company", "Source", "Workspace", "At"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data?.recentLeads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-200 whitespace-nowrap">{l.email}</td>
                  <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{l.company ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{l.source ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{l.workspace?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800">
              <tr>
                {["Deal", "Stage", "Amount", "Workspace", "Created"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data?.recentDeals.map((d) => (
                <tr key={d.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-200 font-medium whitespace-nowrap">{d.name}</td>
                  <td className="px-4 py-2 text-slate-400 capitalize whitespace-nowrap">{d.stage.replace("_", " ")}</td>
                  <td className="px-4 py-2 text-emerald-400 whitespace-nowrap">
                    {d.amount ? `${d.currency ?? "EUR"} ${d.amount.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{d.workspace?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
