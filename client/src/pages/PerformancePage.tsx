import { useState, useEffect } from "react";
import { useIntegrations } from "../context/IntegrationsContext";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../../config";
import {
  Search, Sparkles, Send, Database, CreditCard,
  TrendingUp, TrendingDown, Minus, ArrowUpRight, Loader2,
} from "lucide-react";

type ToolCategory = "prospecting" | "enrichment" | "outreach" | "crm" | "billing";

type ToolMetric = {
  id: string;
  displayName: string;
  category: ToolCategory;
  status: "active" | "idle" | "error";
  eventsTotal: number;
  eventsToday: number;
  eventsThisWeek: number;
  replyRate: number;
  openRate: number;
  meetingRate: number;
  trend: "up" | "down" | "flat";
  trendPct: number;
};

const CATEGORY_MAP: Record<string, ToolCategory> = {
  prospecting: "prospecting",
  enrichment: "enrichment",
  outbound: "outreach",
  outreach: "outreach",
  crm: "crm",
  billing: "billing",
};

const CATEGORY_CONFIG: Record<ToolCategory, { icon: any; color: string; bg: string; label: string; hex: string }> = {
  prospecting: { icon: Search,     color: "text-cyan-400",    bg: "bg-cyan-500/10",    label: "Prospecting", hex: "#22d3ee" },
  enrichment:  { icon: Sparkles,   color: "text-purple-400",  bg: "bg-purple-500/10",  label: "Enrichment",  hex: "#a855f7" },
  outreach:    { icon: Send,       color: "text-orange-400",  bg: "bg-orange-500/10",  label: "Outreach",    hex: "#f97316" },
  crm:         { icon: Database,   color: "text-indigo-400",  bg: "bg-indigo-500/10",  label: "CRM",         hex: "#6366f1" },
  billing:     { icon: CreditCard, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Billing",     hex: "#10b981" },
};

function TrendChip({ trend, pct }: { trend: ToolMetric["trend"]; pct: number }) {
  if (trend === "up") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
      <TrendingUp size={11} />+{pct}%
    </span>
  );
  if (trend === "down") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400">
      <TrendingDown size={11} />-{pct}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
      <Minus size={11} />Flat
    </span>
  );
}

type SortKey = "eventsToday" | "replyRate" | "meetingRate";

export default function PerformancePage() {
  const { connectedTools } = useIntegrations();
  const [sortBy, setSortBy] = useState<SortKey>("eventsToday");
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | "all">("all");
  const [toolMetrics, setToolMetrics] = useState<ToolMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const wsRes = await fetch(`${API_BASE_URL}/api/workspaces/primary`);
        if (!wsRes.ok) return;
        const { id: workspaceId } = await wsRes.json();
        const res = await fetch(`${API_BASE_URL}/api/performance?workspaceId=${workspaceId}`);
        if (!res.ok) return;
        const data = await res.json();
        const mapped: ToolMetric[] = (data.tools || []).map((t: any) => ({
          id: t.id,
          displayName: t.displayName || t.name,
          category: CATEGORY_MAP[(t.category || "").toLowerCase()] ?? "prospecting",
          status: t.status,
          eventsTotal: t.eventsTotal ?? 0,
          eventsToday: t.eventsToday ?? 0,
          eventsThisWeek: t.eventsThisWeek ?? 0,
          replyRate: t.replyRate ?? 0,
          openRate: t.openRate ?? 0,
          meetingRate: t.meetingRate ?? 0,
          trend: t.trend ?? "flat",
          trendPct: t.trendPct ?? 0,
        }));
        setToolMetrics(mapped);
      } catch (err) {
        console.error("Performance load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const visibleMetrics = toolMetrics.filter(t => connectedTools.has(t.id));
  const noToolsConnected = connectedTools.size === 0;

  const sorted = [...visibleMetrics]
    .filter(t => categoryFilter === "all" || t.category === categoryFilter)
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const totalEvents = visibleMetrics.reduce((s, t) => s + t.eventsTotal, 0);
  const activeTools = visibleMetrics.filter(t => t.status === "active").length;

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "eventsToday", label: "Events today" },
    { key: "replyRate",   label: "Reply rate" },
    { key: "meetingRate", label: "Meeting rate" },
  ];

  const categories: { id: ToolCategory | "all"; label: string }[] = [
    { id: "all",          label: "All" },
    { id: "prospecting",  label: "Prospecting" },
    { id: "enrichment",   label: "Enrichment" },
    { id: "outreach",     label: "Outreach" },
    { id: "crm",          label: "CRM" },
    { id: "billing",      label: "Billing" },
  ];

  if (loading) {
    return (
      <div className="pb-10">
        <PageHeader title="Tool Performance" subtitle="Efficiency, event volume, and signal scores broken down per connected GTM tool." />
        <div className="flex items-center justify-center py-24 gap-3 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading performance data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Tool Performance"
        subtitle="Event volume and engagement rates broken down per connected GTM tool."
      />

      {/* ── Summary KPIs ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 mb-6">
        {[
          { label: "Total events recorded", value: totalEvents.toLocaleString(), sub: "all time" },
          { label: "Active tools", value: `${activeTools}/${visibleMetrics.length}`, sub: "firing today" },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xl font-bold text-white">{k.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
            <div className="text-[10px] text-slate-600">{k.sub}</div>
          </div>
        ))}
      </section>

      {/* ── Filters + Sort ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                categoryFilter === c.id
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                  : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span>Sort by</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            {sortOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Tool Cards ── */}
      <section className="space-y-3">
        {noToolsConnected && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 py-16 flex flex-col items-center gap-3">
            <ArrowUpRight size={28} className="text-slate-700" />
            <p className="text-sm text-slate-400 font-medium">No tools connected</p>
            <p className="text-xs text-slate-600 max-w-xs text-center">Connect your GTM tools to see performance metrics, efficiency scores, and signal data.</p>
            <a href="/integrations" className="mt-1 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-xs text-indigo-300 hover:bg-indigo-600/30 transition-all">Go to Integrations →</a>
          </div>
        )}
        {sorted.map((tool, idx) => {
          const catCfg = CATEGORY_CONFIG[tool.category];
          const CatIcon = catCfg.icon;
          const isError = tool.status === "error";

          return (
            <div
              key={tool.id}
              className={`rounded-2xl border bg-slate-900/60 p-5 transition-colors ${
                isError ? "border-rose-900/50" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                {/* Rank + Identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-none sm:min-w-[180px]">
                  <span className="text-xs font-mono text-slate-600 w-5 text-right">#{idx + 1}</span>
                  <div className={`p-2 rounded-lg shrink-0 ${catCfg.bg}`}>
                    <CatIcon size={15} className={catCfg.color} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{tool.displayName}</div>
                    <div className={`text-[10px] ${catCfg.color}`}>{catCfg.label}</div>
                  </div>
                </div>

                {isError ? (
                  <div className="flex-1 text-xs text-rose-400">
                    Connection error — this tool is not sending events.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5 min-w-[70px] sm:min-w-[90px]">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Events today</div>
                      <div className="text-lg font-bold text-slate-100">{tool.eventsToday.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-500">{tool.eventsThisWeek.toLocaleString()} this week</div>
                    </div>

                    {(tool.replyRate > 0 || tool.openRate > 0) && (
                      <div className="flex gap-5 min-w-[120px] sm:min-w-[160px]">
                        {tool.openRate > 0 && (
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Open</div>
                            <div className="text-sm font-semibold text-slate-200">{tool.openRate}%</div>
                          </div>
                        )}
                        {tool.replyRate > 0 && (
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Reply</div>
                            <div className="text-sm font-semibold text-amber-300">{tool.replyRate}%</div>
                          </div>
                        )}
                        {tool.meetingRate > 0 && (
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Meeting</div>
                            <div className="text-sm font-semibold text-emerald-300">{tool.meetingRate}%</div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-0.5 min-w-[70px] items-end ml-auto">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">vs last week</div>
                      <TrendChip trend={tool.trend} pct={tool.trendPct} />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Event Volume Bar Chart ── */}
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Events Today by Tool</h2>
            <p className="text-[11px] text-slate-400">Relative event volume across active integrations.</p>
          </div>
          <a href="/events" className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300">
            View feed <ArrowUpRight size={11} />
          </a>
        </div>
        <div className="space-y-3">
          {[...visibleMetrics]
            .filter(t => t.eventsToday > 0)
            .sort((a, b) => b.eventsToday - a.eventsToday)
            .map(tool => {
              const max = Math.max(...visibleMetrics.map(t => t.eventsToday), 1);
              const pct = Math.round((tool.eventsToday / max) * 100);
              const catCfg = CATEGORY_CONFIG[tool.category];
              return (
                <div key={tool.id}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className={`font-medium ${catCfg.color}`}>{tool.displayName}</span>
                    <span className="text-slate-400 font-mono">{tool.eventsToday}</span>
                  </div>
                  <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full rounded-full opacity-70 transition-all"
                      style={{ width: `${pct}%`, backgroundColor: catCfg.hex }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
