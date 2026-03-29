import { useState, useEffect } from "react";
import { BarChart3, Loader2, Users, Zap, Database, Clock } from "lucide-react";
import { API_BASE_URL } from "../../config";

interface Usage {
  plan: string;
  events: { count: number; limit: number; pct: number; resetAt: string | null };
  contacts: number;
  activeAutomations: number;
  estimatedStorageMB: number;
  retentionMonths: number;
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial", free: "Free", starter: "Starter", growth: "Growth", agency: "Agency",
};

export default function UsageDashboardPanel() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const tok = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings/usage`, {
      headers: { Authorization: `Bearer ${tok()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUsage(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const resetLabel = (resetAt: string | null) => {
    if (!resetAt) return "this month";
    const d = new Date(resetAt);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const barColor = (pct: number) => {
    if (pct >= 100) return "bg-rose-500";
    if (pct >= 80)  return "bg-amber-400";
    return "bg-emerald-500";
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 size={14} className="text-sky-400" />
        <h2 className="text-sm font-semibold text-slate-100">Usage</h2>
        {usage && (
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5 ml-auto">
            {PLAN_LABELS[usage.plan] ?? usage.plan}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Your workspace usage this billing period.
      </p>

      {loading ? (
        <div className="text-xs text-slate-600 flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" /> Loading…
        </div>
      ) : !usage ? (
        <p className="text-xs text-slate-600">Could not load usage data.</p>
      ) : (
        <div className="space-y-4">
          {/* Events this month */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Zap size={11} className="text-sky-400" />
                <span className="text-xs text-slate-300 font-medium">Events</span>
                <span className="text-[10px] text-slate-500">— {resetLabel(usage.events.resetAt)}</span>
              </div>
              <span className={`text-[11px] font-semibold tabular-nums ${
                usage.events.pct >= 100 ? "text-rose-400" :
                usage.events.pct >= 80  ? "text-amber-400" : "text-slate-300"
              }`}>
                {usage.events.count.toLocaleString()} / {usage.events.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor(usage.events.pct)}`}
                style={{ width: `${Math.min(usage.events.pct, 100)}%` }}
              />
            </div>
            {usage.events.pct >= 80 && (
              <p className={`text-[10px] mt-1 ${usage.events.pct >= 100 ? "text-rose-400" : "text-amber-400"}`}>
                {usage.events.pct >= 100
                  ? "Quota reached — new events are being soft-blocked. Upgrade to resume."
                  : `${usage.events.pct}% used — consider upgrading to avoid disruption.`}
              </p>
            )}
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-center">
              <Users size={13} className="text-indigo-400 mx-auto mb-1" />
              <p className="text-base font-bold text-slate-100 tabular-nums">{usage.contacts.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">Contacts</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-center">
              <Zap size={13} className="text-emerald-400 mx-auto mb-1" />
              <p className="text-base font-bold text-slate-100 tabular-nums">{usage.activeAutomations}</p>
              <p className="text-[10px] text-slate-500">Automations</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-center">
              <Database size={13} className="text-purple-400 mx-auto mb-1" />
              <p className="text-base font-bold text-slate-100 tabular-nums">
                {usage.estimatedStorageMB < 1 ? "<1" : usage.estimatedStorageMB}
              </p>
              <p className="text-[10px] text-slate-500">MB stored</p>
            </div>
          </div>

          {/* Retention window */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-950/40 rounded-lg px-3 py-2 border border-slate-800">
            <Clock size={11} />
            <span>Data retained for <span className="text-slate-300 font-medium">{usage.retentionMonths} months</span> on your plan</span>
          </div>
        </div>
      )}
    </section>
  );
}
