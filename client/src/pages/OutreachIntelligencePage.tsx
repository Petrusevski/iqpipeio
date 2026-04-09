import { useState, useEffect, useCallback } from "react";
import {
  Radio, Users, TrendingDown, AlertTriangle, CheckCircle2,
  RefreshCw, Inbox, Activity, BarChart3,
  ArrowDown, MessageSquare,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SequenceSummary {
  sequenceId: string;
  tool: string;
  totalLeads: number;
  totalSends: number;
  replies: number;
  meetings: number;
  replyRate: number;
  meetingRate: number;
  lastActivityAt: string | null;
}

interface OverviewData {
  totalLeads: number;
  activeSequences: number;
  sequences: SequenceSummary[];
  topConvertingSequence: string | null;
}

interface StuckLead {
  displayName: string;
  company: string | null;
  title: string | null;
  tool: string;
  sequenceId: string;
  daysSilent: number;
  touchpointCount: number;
  hasReplied: boolean;
}

interface FunnelStep {
  eventType: string;
  leadCount: number;
  conversionFromPrev: number | null;
  conversionFromEntry: number | null;
}

interface FunnelData {
  sequenceId: string;
  entryLeads: number;
  steps: FunnelStep[];
}

interface WebhookTool {
  tool: string;
  total: number;
  processed: number;
  droppedQuota: number;
  droppedNoId: number;
  droppedIgnored: number;
  errors: number;
  processRate: number;
}

interface WebhookData {
  tools: WebhookTool[];
  windowHours: number;
}

type Tab = "overview" | "stuck" | "funnel" | "webhooks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rateColor(rate: number) {
  if (rate >= 10) return "text-emerald-400";
  if (rate >= 4)  return "text-amber-400";
  return "text-rose-400";
}

function processRateColor(rate: number) {
  if (rate >= 90) return "text-emerald-400";
  if (rate >= 70) return "text-amber-400";
  return "text-rose-400";
}

function toolBadge(tool: string) {
  const colors: Record<string, string> = {
    apollo:       "bg-blue-500/15 text-blue-300 border-blue-500/20",
    clay:         "bg-purple-500/15 text-purple-300 border-purple-500/20",
    lemlist:      "bg-orange-500/15 text-orange-300 border-orange-500/20",
    instantly:    "bg-cyan-500/15 text-cyan-300 border-cyan-500/20",
    smartlead:    "bg-indigo-500/15 text-indigo-300 border-indigo-500/20",
    heyreach:     "bg-pink-500/15 text-pink-300 border-pink-500/20",
    hubspot:      "bg-orange-600/15 text-orange-300 border-orange-600/20",
    outreach:     "bg-violet-500/15 text-violet-300 border-violet-500/20",
  };
  return colors[tool.toLowerCase()] ?? "bg-slate-700/50 text-slate-400 border-slate-600/30";
}

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function OverviewPanel({ data }: { data: OverviewData }) {
  const sorted = [...data.sequences].sort((a, b) => b.replyRate - a.replyRate);
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total leads",       value: data.totalLeads.toLocaleString(),        icon: Users,    color: "text-indigo-400" },
          { label: "Active sequences",  value: data.activeSequences.toString(),          icon: Activity, color: "text-emerald-400" },
          { label: "Best sequence",     value: data.topConvertingSequence ?? "—",        icon: BarChart3, color: "text-amber-400" },
          { label: "Avg reply rate",    value: sorted.length ? `${(sorted.reduce((s, x) => s + x.replyRate, 0) / sorted.length).toFixed(1)}%` : "—", icon: MessageSquare, color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-start gap-3">
            <c.icon size={16} className={`${c.color} mt-0.5 shrink-0`} />
            <div>
              <p className="text-xs text-slate-500 mb-1">{c.label}</p>
              <p className="text-sm font-semibold text-white truncate">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sequence table */}
      {sorted.length === 0 ? (
        <EmptyState icon={Inbox} label="No sequences found" sub="Connect a sequencer and send some outreach to see data here." />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Sequence ID", "Tool", "Leads", "Sends", "Replies", "Meetings", "Reply %", "Meeting %", "Last activity"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr key={s.sequenceId} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}>
                    <td className="px-4 py-2.5 font-mono text-slate-300 max-w-[180px] truncate">{s.sequenceId}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${toolBadge(s.tool)}`}>{s.tool}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{s.totalLeads}</td>
                    <td className="px-4 py-2.5 text-slate-300">{s.totalSends}</td>
                    <td className="px-4 py-2.5 text-slate-300">{s.replies}</td>
                    <td className="px-4 py-2.5 text-slate-300">{s.meetings}</td>
                    <td className={`px-4 py-2.5 font-semibold ${rateColor(s.replyRate)}`}>{s.replyRate}%</td>
                    <td className={`px-4 py-2.5 font-semibold ${rateColor(s.meetingRate)}`}>{s.meetingRate}%</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StuckLeadsPanel({ leads }: { leads: StuckLead[] }) {
  if (leads.length === 0) return (
    <EmptyState icon={CheckCircle2} label="No stuck leads" sub="All leads are progressing normally." />
  );
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800">
              {["Lead", "Company", "Title", "Tool", "Sequence", "Days silent", "Touches", "Replied"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l, i) => (
              <tr key={i} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}>
                <td className="px-4 py-2.5 font-medium text-slate-200">{l.displayName}</td>
                <td className="px-4 py-2.5 text-slate-400">{l.company ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500 max-w-[140px] truncate">{l.title ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${toolBadge(l.tool)}`}>{l.tool}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-slate-500 max-w-[120px] truncate">{l.sequenceId}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-semibold ${l.daysSilent >= 14 ? "text-rose-400" : l.daysSilent >= 7 ? "text-amber-400" : "text-slate-300"}`}>
                    {l.daysSilent}d
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-400">{l.touchpointCount}</td>
                <td className="px-4 py-2.5">
                  {l.hasReplied
                    ? <span className="text-emerald-400 font-medium">Yes</span>
                    : <span className="text-rose-400/70 font-medium">No</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelPanel({ workspaceId, sequences }: { workspaceId: string; sequences: SequenceSummary[] }) {
  const [selected, setSelected] = useState<string>("");
  const [data, setData]         = useState<FunnelData | null>(null);
  const [loading, setLoading]   = useState(false);

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  const load = useCallback(async (seqId: string) => {
    if (!seqId || !workspaceId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/outreach/sequence-funnel/${encodeURIComponent(seqId)}?workspaceId=${workspaceId}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      if (r.ok) setData(await r.json());
    } catch {} finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => {
    if (!selected && sequences.length > 0) {
      const first = sequences[0].sequenceId;
      setSelected(first);
      load(first);
    }
  }, [sequences, selected, load]);

  const handleSelect = (id: string) => { setSelected(id); setData(null); load(id); };

  return (
    <div className="space-y-4">
      {/* Sequence selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500">Sequence:</span>
        <select
          value={selected}
          onChange={e => handleSelect(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          {sequences.map(s => (
            <option key={s.sequenceId} value={s.sequenceId}>
              {s.sequenceId} — {s.tool} ({s.totalLeads} leads)
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingSpinner />}

      {!loading && data && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-400">Entry leads:</span>
            <span className="text-sm font-semibold text-white">{data.entryLeads.toLocaleString()}</span>
          </div>
          {data.steps.map((step, i) => {
            const barWidth = data.entryLeads > 0 ? Math.max(4, (step.leadCount / data.entryLeads) * 100) : 4;
            const isBigDrop = step.conversionFromPrev !== null && step.conversionFromPrev < 30;
            return (
              <div key={i}>
                <div className="flex items-center gap-3">
                  <div className="w-36 text-[11px] text-slate-400 text-right shrink-0 truncate">{step.eventType}</div>
                  <div className="flex-1 h-8 relative bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ${isBigDrop ? "bg-amber-500/30" : "bg-indigo-500/25"}`}
                      style={{ width: `${barWidth}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3 gap-3">
                      <span className="text-xs font-semibold text-white">{step.leadCount.toLocaleString()}</span>
                      {step.conversionFromEntry !== null && (
                        <span className="text-[10px] text-slate-400">{step.conversionFromEntry}% from entry</span>
                      )}
                    </div>
                  </div>
                  {step.conversionFromPrev !== null && (
                    <div className={`w-16 text-right text-xs font-medium shrink-0 ${isBigDrop ? "text-amber-400" : "text-slate-400"}`}>
                      {isBigDrop && <ArrowDown size={10} className="inline mr-0.5" />}
                      {step.conversionFromPrev}%
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !data && selected && (
        <EmptyState icon={BarChart3} label="No funnel data" sub="No step-by-step events found for this sequence." />
      )}

      {!loading && sequences.length === 0 && (
        <EmptyState icon={Inbox} label="No sequences" sub="No sequence data available yet." />
      )}
    </div>
  );
}

function WebhooksPanel({ data }: { data: WebhookData }) {
  if (data.tools.length === 0) return (
    <EmptyState icon={Inbox} label="No webhook data" sub="No webhooks received in the selected window." />
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Last {data.windowHours}h of webhook events</p>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                {["Tool", "Total", "Processed", "No identity", "Quota dropped", "Errors", "Process rate"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.tools.map((t, i) => (
                <tr key={i} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${toolBadge(t.tool)}`}>{t.tool}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-300">{t.total}</td>
                  <td className="px-4 py-2.5 text-emerald-400">{t.processed}</td>
                  <td className="px-4 py-2.5 text-amber-400">{t.droppedNoId}</td>
                  <td className="px-4 py-2.5 text-amber-400/70">{t.droppedQuota}</td>
                  <td className="px-4 py-2.5 text-rose-400">{t.errors}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[60px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${t.processRate >= 90 ? "bg-emerald-500" : t.processRate >= 70 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${t.processRate}%` }}
                        />
                      </div>
                      <span className={`font-semibold ${processRateColor(t.processRate)}`}>{t.processRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, label, sub }: { icon: any; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={32} className="text-slate-700 mb-3" />
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="text-xs text-slate-600 mt-1 max-w-xs">{sub}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw size={20} className="text-slate-600 animate-spin" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OutreachIntelligencePage() {
  const [workspaceId,   setWorkspaceId]   = useState("");
  const [activeTab,     setActiveTab]     = useState<Tab>("overview");
  const [loading,       setLoading]       = useState(false);
  const [lastRefresh,   setLastRefresh]   = useState(new Date());

  const [overview,    setOverview]    = useState<OverviewData | null>(null);
  const [stuckLeads,  setStuckLeads]  = useState<StuckLead[]>([]);
  const [webhooks,    setWebhooks]    = useState<WebhookData | null>(null);

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  // Load workspace
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setLoading(true);
    try {
      const [ov, sl, wh] = await Promise.all([
        fetch(`${API_BASE_URL}/api/outreach/overview?workspaceId=${wsId}`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE_URL}/api/outreach/stuck-leads?workspaceId=${wsId}&daysSilent=5&limit=100`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${API_BASE_URL}/api/outreach/webhook-reliability?workspaceId=${wsId}&hours=720`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : null),
      ]);
      if (ov)  setOverview(ov);
      if (sl)  setStuckLeads(sl);
      if (wh)  setWebhooks(wh);
      setLastRefresh(new Date());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (workspaceId) loadData(workspaceId); }, [workspaceId, loadData]);

  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: "overview", label: "Sequences",     icon: BarChart3   },
    { key: "stuck",    label: "Stuck Leads",   icon: AlertTriangle, badge: stuckLeads.filter(l => !l.hasReplied).length || undefined },
    { key: "funnel",   label: "Funnel",        icon: TrendingDown },
    { key: "webhooks", label: "Webhook Log",   icon: Activity    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Radio size={16} className="text-indigo-400" />
              <h1 className="text-lg font-bold text-white">Outreach Intelligence</h1>
            </div>
            <p className="text-xs text-slate-500">
              Sequence performance, stuck leads, funnel analysis, and webhook delivery — all in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600">
              Refreshed {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={() => workspaceId && loadData(workspaceId)}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-6 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === t.key
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <t.icon size={12} />
              {t.label}
              {t.badge ? (
                <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-rose-500/20 text-rose-400 text-[9px] font-bold flex items-center justify-center">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Loading state (initial load) */}
        {loading && !overview && <LoadingSpinner />}

        {/* Tab content */}
        {!loading || overview ? (
          <>
            {activeTab === "overview" && overview && (
              <OverviewPanel data={overview} />
            )}
            {activeTab === "overview" && !overview && !loading && (
              <EmptyState icon={Inbox} label="No outreach data" sub="Connect a sequencer (Apollo, Lemlist, Instantly) and send outreach to see data here." />
            )}

            {activeTab === "stuck" && (
              <StuckLeadsPanel leads={stuckLeads} />
            )}

            {activeTab === "funnel" && overview && (
              <FunnelPanel workspaceId={workspaceId} sequences={overview.sequences} />
            )}
            {activeTab === "funnel" && !overview && !loading && (
              <EmptyState icon={TrendingDown} label="No sequences" sub="Load sequence data first." />
            )}

            {activeTab === "webhooks" && webhooks && (
              <WebhooksPanel data={webhooks} />
            )}
            {activeTab === "webhooks" && !webhooks && !loading && (
              <EmptyState icon={Activity} label="No webhook data" sub="No webhooks received yet." />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
