/**
 * ReportStudioPage.tsx
 *
 * Report Studio — generate social-media-ready GTM performance cards.
 * 4 report types × 3 card formats. Live preview, PNG export, AI insights,
 * and a public share link.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import html2canvas from "html2canvas";
import {
  Sparkles, Download, Share2, RefreshCw, Check,
  LayoutDashboard, TrendingUp, Calendar, Zap,
  ChevronRight, Copy, ExternalLink,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType  = "snapshot" | "funnel" | "digest" | "revenue";
type CardFormat  = "linkedin" | "square" | "story";
type Period      = "7d" | "30d" | "90d" | "all";

interface DayCount  { date: string; count: number }
interface FunnelStep { label: string; count: number }

interface PerFlowStat {
  id:           string;
  nativeId:     string;
  name:         string;
  platform:     "n8n" | "make";
  active:       boolean;
  appsUsed:     string[];
  appKeys:      string[];
  eventCount:   number;
  successCount: number;
  successRate:  number;
  lastActivity: string | null;
}

interface ReportData {
  period:    string;
  workspace: { name: string };
  workflows: {
    total: number; n8n: number; make: number;
    list: { name: string; platform: string; appsUsed: string[]; healthScore: number }[];
  };
  events: {
    total: number; successful: number; failed: number;
    successRate: number; byDay: DayCount[];
  };
  correlations: {
    total: number; verified: number; mismatched: number; verifiedRate: number;
  };
  topApps:  { appKey: string; count: number }[];
  kpis: {
    contactsEngaged: number; dealsTracked: number;
    meetingsBooked:  number; emailsSent:   number; repliesReceived: number;
  };
  funnelSteps: FunnelStep[];
  avgHealthScore: number;
  perFlow?: PerFlowStat[];
}

// ── Static config ─────────────────────────────────────────────────────────────

const REPORT_TYPES: { key: ReportType; label: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { key: "snapshot", icon: LayoutDashboard, label: "GTM Snapshot",    desc: "Overall performance across all workflows" },
  { key: "funnel",   icon: TrendingUp,      label: "Campaign Funnel", desc: "Outbound journey from source to booked" },
  { key: "digest",   icon: Calendar,        label: "Weekly Digest",   desc: "7-day event timeline with trend delta" },
  { key: "revenue",  icon: Zap,             label: "Revenue Signal",  desc: "Cross-verified deal & meeting attribution" },
];

const FORMAT_LABELS: Record<CardFormat, { label: string; aspect: string; size: string }> = {
  linkedin: { label: "LinkedIn",  aspect: "aspect-[1.91/1]", size: "1200 × 627" },
  square:   { label: "Square",    aspect: "aspect-square",   size: "1080 × 1080" },
  story:    { label: "Story",     aspect: "aspect-[9/16]",   size: "1080 × 1920" },
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "all": "All time",
};

const APP_DOMAINS: Record<string, string> = {
  hubspot: "hubspot.com", salesforce: "salesforce.com", pipedrive: "pipedrive.com",
  attio: "attio.com", instantly: "instantly.ai", lemlist: "lemlist.com",
  smartlead: "smartlead.ai", heyreach: "heyreach.io", apollo: "apollo.io",
  clay: "clay.com", stripe: "stripe.com", calendly: "calendly.com", slack: "slack.com",
};

// ── Mini SVG charts ───────────────────────────────────────────────────────────

function MiniBarChart({ data, color = "#6366f1", height = 48 }: {
  data: DayCount[]; color?: string; height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barH = (d.count / max) * (height - 4);
        const x    = i * w + w * 0.1;
        const barW = w * 0.8;
        const y    = height - barH;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} rx="1.5"
              fill={color} opacity={0.7 + (d.count / max) * 0.3} />
          </g>
        );
      })}
    </svg>
  );
}

function FunnelSVG({ steps }: { steps: FunnelStep[] }) {
  const validSteps = steps.filter(s => s.count > 0);
  if (!validSteps.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-xs">
        No funnel data yet
      </div>
    );
  }
  const max = validSteps[0].count || 1;
  const COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff"];
  return (
    <div className="flex flex-col gap-1 w-full">
      {validSteps.map((s, i) => {
        const pct = Math.round((s.count / max) * 100);
        const conv = i > 0 && validSteps[i - 1].count > 0
          ? `${Math.round(s.count / validSteps[i - 1].count * 100)}%`
          : null;
        return (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-20 text-right text-[10px] text-slate-400 shrink-0">{s.label}</div>
            <div className="flex-1 bg-slate-800 rounded-full h-4 overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: COLORS[i] ?? COLORS[4] }}
              />
            </div>
            <div className="w-16 text-[10px] text-slate-300 font-mono shrink-0">
              {s.count.toLocaleString()}
              {conv && <span className="ml-1 text-slate-500">↓{conv}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutSVG({ value, max, color }: { value: number; max: number; color: string }) {
  const r   = 28;
  const circ = 2 * Math.PI * r;
  const pct  = max > 0 ? value / max : 0;
  const dash = circ * pct;
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={36} cy={36} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 36 36)" />
      <text x={36} y={40} textAnchor="middle" fontSize={13} fontWeight="bold" fill="white">
        {max > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </text>
    </svg>
  );
}

// ── Card templates ────────────────────────────────────────────────────────────

function AppFavicon({ appKey, size = 18 }: { appKey: string; size?: number }) {
  const domain = APP_DOMAINS[appKey];
  if (!domain) return null;
  return (
    <div className="rounded bg-white/10 overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size }}>
      <img
        src={`${API_BASE_URL}/api/proxy/favicon?domain=${domain}`}
        alt={appKey}
        style={{ width: size - 2, height: size - 2, objectFit: "contain" }}
        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

function IqpipeLogo({ size = 20 }: { size?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="rounded-md bg-gradient-to-br from-indigo-500/30 to-purple-500/30 ring-1 ring-indigo-500/50 flex items-center justify-center text-indigo-400 font-bold"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        iq
      </div>
      <span className="font-bold text-white" style={{ fontSize: size * 0.65 }}>iqpipe</span>
    </div>
  );
}

// GTM Snapshot — LinkedIn landscape
function SnapshotCard({ data, insight, format, activeFlows }: { data: ReportData; insight: string; format: CardFormat; activeFlows: PerFlowStat[] }) {
  const isStory = format === "story";
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 p-6 flex flex-col gap-4 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase mb-1">
            GTM Performance Report
          </div>
          <div className="text-xl font-black text-white leading-tight">{data.workspace.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">{PERIOD_LABELS[data.period as Period] ?? data.period}</div>
        </div>
        <IqpipeLogo size={22} />
      </div>

      {/* KPI row */}
      <div className={`relative grid gap-3 ${isStory ? "grid-cols-2" : "grid-cols-4"}`}>
        {[
          { label: "Workflows",     value: data.workflows.total,         unit: ""   },
          { label: "Events Tracked",value: data.events.total,            unit: ""   },
          { label: "Success Rate",  value: `${data.events.successRate}`, unit: "%"  },
          { label: "Verified",      value: data.correlations.verified,   unit: ""   },
        ].map(k => (
          <div key={k.label} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="text-2xl font-black text-white tabular-nums">
              {typeof k.value === "number" ? k.value.toLocaleString() : k.value}{k.unit}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="relative bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
        <div className="text-[10px] text-slate-500 mb-2">Events · last 14 days</div>
        <MiniBarChart data={data.events.byDay} color="#6366f1" height={44} />
      </div>

      {/* Apps row */}
      {data.topApps.length > 0 && (
        <div className="relative">
          <div className="text-[10px] text-slate-500 mb-2">Active integrations</div>
          <div className="flex flex-wrap gap-2">
            {data.topApps.slice(0, 8).map(a => (
              <div key={a.appKey} className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1 border border-slate-700/40">
                <AppFavicon appKey={a.appKey} size={14} />
                <span className="text-[10px] text-slate-300 capitalize">{a.appKey}</span>
                <span className="text-[10px] text-slate-500">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected flows */}
      {activeFlows.length > 0 && activeFlows.length < (data.perFlow?.length ?? 99) && (
        <FlowStrip flows={activeFlows} />
      )}

      {/* AI insight */}
      {insight && (
        <div className="relative bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-xs text-slate-300 leading-relaxed italic">
          {insight}
        </div>
      )}

      {/* Footer */}
      <div className="relative mt-auto flex items-center justify-between">
        <div className="flex gap-3 text-[10px] text-slate-500">
          <span>{data.kpis.contactsEngaged.toLocaleString()} contacts</span>
          {data.kpis.meetingsBooked > 0 && <span>{data.kpis.meetingsBooked} meetings</span>}
          {data.kpis.dealsTracked > 0   && <span>{data.kpis.dealsTracked} deals</span>}
        </div>
        <div className="text-[9px] text-slate-600">Verified by iqpipe.com</div>
      </div>
    </div>
  );
}

// Campaign Funnel
function FunnelCard({ data, insight, format, activeFlows }: { data: ReportData; insight: string; format: CardFormat; activeFlows: PerFlowStat[] }) {
  const isStory = format === "story";
  const top    = data.funnelSteps[0]?.count ?? 0;
  const bottom = data.funnelSteps[data.funnelSteps.length - 1]?.count ?? 0;
  const convRate = top > 0 ? ((bottom / top) * 100).toFixed(2) : "0";
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/50 p-6 flex flex-col gap-4 overflow-hidden">
      <div className="absolute top-0 right-0 w-56 h-56 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold text-violet-400 tracking-widest uppercase mb-1">
            Outbound Campaign Funnel
          </div>
          <div className="text-xl font-black text-white">{data.workspace.name}</div>
          <div className="text-xs text-slate-500">{PERIOD_LABELS[data.period as Period] ?? data.period}</div>
        </div>
        <IqpipeLogo size={22} />
      </div>

      <div className={`relative grid gap-3 ${isStory ? "grid-cols-1" : "grid-cols-3"}`}>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <div className="text-2xl font-black text-white">{top.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">Total sourced</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <div className="text-2xl font-black text-emerald-400">{data.funnelSteps.find(s => s.label === "Booked")?.count ?? 0}</div>
          <div className="text-[10px] text-slate-500">Meetings booked</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <div className="text-2xl font-black text-violet-400">{convRate}%</div>
          <div className="text-[10px] text-slate-500">Source → booked</div>
        </div>
      </div>

      <div className="relative flex-1 flex items-center">
        <FunnelSVG steps={data.funnelSteps} />
      </div>

      {activeFlows.length > 0 && activeFlows.length < (data.perFlow?.length ?? 99) && (
        <FlowStrip flows={activeFlows} />
      )}

      {insight && (
        <div className="relative bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-xs text-slate-300 leading-relaxed italic">
          {insight}
        </div>
      )}

      <div className="relative flex items-center justify-between">
        <div className="flex gap-3 text-[10px] text-slate-500">
          <span>{data.kpis.emailsSent.toLocaleString()} emails sent</span>
          <span>{data.kpis.repliesReceived} replies</span>
        </div>
        <div className="text-[9px] text-slate-600">Verified by iqpipe.com</div>
      </div>
    </div>
  );
}

// Weekly Digest
function DigestCard({ data, insight, format, activeFlows }: { data: ReportData; insight: string; format: CardFormat; activeFlows: PerFlowStat[] }) {
  const last7 = data.events.byDay.slice(-7);
  const prev7 = data.events.byDay.slice(-14, -7);
  const totalLast = last7.reduce((a, d) => a + d.count, 0);
  const totalPrev = prev7.reduce((a, d) => a + d.count, 0);
  const delta = totalPrev > 0 ? Math.round(((totalLast - totalPrev) / totalPrev) * 100) : 0;
  const bestDay = [...last7].sort((a, b) => b.count - a.count)[0];
  const isStory = format === "story";
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950/40 p-6 flex flex-col gap-4 overflow-hidden">
      <div className="absolute top-0 left-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold text-sky-400 tracking-widest uppercase mb-1">
            Weekly GTM Digest
          </div>
          <div className="text-xl font-black text-white">{data.workspace.name}</div>
          <div className="text-xs text-slate-500">{PERIOD_LABELS[data.period as Period] ?? data.period}</div>
        </div>
        <IqpipeLogo size={22} />
      </div>

      <div className={`relative grid gap-3 ${isStory ? "grid-cols-2" : "grid-cols-3"}`}>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <div className="text-2xl font-black text-white">{totalLast.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">Events this week</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <div className={`text-2xl font-black ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {delta >= 0 ? "+" : ""}{delta}%
          </div>
          <div className="text-[10px] text-slate-500">vs prev week</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <div className="text-2xl font-black text-sky-400">{data.avgHealthScore}%</div>
          <div className="text-[10px] text-slate-500">Avg health score</div>
        </div>
      </div>

      <div className="relative bg-slate-800/30 rounded-xl p-3 border border-slate-700/30 flex-1">
        <div className="text-[10px] text-slate-500 mb-2">Events · last 7 days</div>
        <MiniBarChart data={last7} color="#38bdf8" height={isStory ? 120 : 56} />
        {bestDay && (
          <div className="mt-2 text-[10px] text-slate-500">
            Best day: <span className="text-sky-400 font-semibold">
              {new Date(bestDay.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span> — {bestDay.count} events
          </div>
        )}
      </div>

      {insight && (
        <div className="relative bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 text-xs text-slate-300 leading-relaxed italic">
          {insight}
        </div>
      )}

      {activeFlows.length > 0 && activeFlows.length < (data.perFlow?.length ?? 99) && (
        <FlowStrip flows={activeFlows} />
      )}

      <div className="relative flex items-center justify-between">
        <div className="flex gap-3 text-[10px] text-slate-500">
          <span>{data.workflows.total} active workflows</span>
          <span>{data.kpis.contactsEngaged} contacts</span>
        </div>
        <div className="text-[9px] text-slate-600">Verified by iqpipe.com</div>
      </div>
    </div>
  );
}

// Revenue Signal
function RevenueCard({ data, insight, format, activeFlows }: { data: ReportData; insight: string; format: CardFormat; activeFlows: PerFlowStat[] }) {
  const isStory = format === "story";
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 p-6 flex flex-col gap-4 overflow-hidden">
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase mb-1">
            Revenue Signal
          </div>
          <div className="text-xl font-black text-white">{data.workspace.name}</div>
          <div className="text-xs text-slate-500">{PERIOD_LABELS[data.period as Period] ?? data.period}</div>
        </div>
        <IqpipeLogo size={22} />
      </div>

      <div className={`relative grid gap-3 ${isStory ? "grid-cols-2" : "grid-cols-4"}`}>
        {[
          { label: "Verified events",   value: data.correlations.verified,   color: "text-emerald-400" },
          { label: "Deals tracked",     value: data.kpis.dealsTracked,       color: "text-white"       },
          { label: "Meetings booked",   value: data.kpis.meetingsBooked,     color: "text-sky-400"     },
          { label: "Verify rate",       value: `${data.correlations.verifiedRate}%`, color: "text-violet-400" },
        ].map(k => (
          <div key={k.label} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className={`text-2xl font-black ${k.color} tabular-nums`}>
              {typeof k.value === "number" ? k.value.toLocaleString() : k.value}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className={`relative grid gap-3 ${isStory ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30 flex items-center gap-4">
          <DonutSVG
            value={data.correlations.verified}
            max={data.correlations.total}
            color="#34d399"
          />
          <div>
            <div className="text-sm font-bold text-white">Correlation rate</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {data.correlations.verified} of {data.correlations.total} app events matched to workflow executions
            </div>
          </div>
        </div>
        <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 mb-2">Top verified sources</div>
          <div className="space-y-1.5">
            {data.topApps.slice(0, 4).map(a => (
              <div key={a.appKey} className="flex items-center gap-2">
                <AppFavicon appKey={a.appKey} size={14} />
                <div className="flex-1 bg-slate-700/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/70 rounded-full"
                    style={{ width: `${Math.round(a.count / (data.topApps[0]?.count || 1) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 w-8 text-right">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeFlows.length > 0 && activeFlows.length < (data.perFlow?.length ?? 99) && (
        <FlowStrip flows={activeFlows} />
      )}

      {insight && (
        <div className="relative bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-slate-300 leading-relaxed italic">
          {insight}
        </div>
      )}

      <div className="relative mt-auto flex items-center justify-between">
        <div className="flex gap-3 text-[10px] text-slate-500">
          <span>{data.kpis.contactsEngaged} contacts</span>
          <span>{data.events.total} events</span>
        </div>
        <div className="text-[9px] text-slate-600">Verified by iqpipe.com</div>
      </div>
    </div>
  );
}

// ── Flow selector ─────────────────────────────────────────────────────────────

const PLATFORM_BADGE: Record<"n8n" | "make", { label: string; color: string }> = {
  n8n:  { label: "n8n",      color: "bg-orange-500/20 text-orange-400 border-orange-500/20" },
  make: { label: "Make.com", color: "bg-violet-500/20 text-violet-400 border-violet-500/20" },
};

function FlowSelector({
  flows, selectedIds, onToggle, onSelectAll,
}: {
  flows: PerFlowStat[];
  selectedIds: string[];
  onToggle:    (id: string) => void;
  onSelectAll: () => void;
}) {
  if (!flows.length) {
    return (
      <p className="text-xs text-slate-600 py-2">No automations connected yet.</p>
    );
  }

  const allSelected = selectedIds.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Select all toggle */}
      <button
        onClick={onSelectAll}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
          allSelected
            ? "bg-indigo-500/10 border-indigo-500/30 text-white"
            : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600"
        }`}
      >
        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
          allSelected ? "bg-indigo-500 border-indigo-500" : "border-slate-600"
        }`}>
          {allSelected && <Check size={9} className="text-white" />}
        </div>
        All flows ({flows.length})
      </button>

      {/* Individual flows */}
      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto no-scrollbar">
        {flows.map(flow => {
          const isSelected = !allSelected && selectedIds.includes(flow.id);
          const badge      = PLATFORM_BADGE[flow.platform];
          return (
            <button
              key={flow.id}
              onClick={() => onToggle(flow.id)}
              className={`flex flex-col gap-2 p-2.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? "bg-indigo-500/10 border-indigo-500/25"
                  : "bg-slate-800/30 border-slate-700/40 hover:border-slate-600"
              }`}
            >
              {/* Row 1: checkbox + name + platform */}
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  isSelected ? "bg-indigo-500 border-indigo-500" : "border-slate-600"
                }`}>
                  {isSelected && <Check size={9} className="text-white" />}
                </div>
                <span className={`flex-1 text-xs font-medium truncate ${isSelected ? "text-white" : "text-slate-300"}`}>
                  {flow.name}
                </span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${badge.color}`}>
                  {badge.label}
                </span>
                {!flow.active && (
                  <span className="text-[9px] text-slate-600 border border-slate-700 rounded px-1">inactive</span>
                )}
              </div>

              {/* Row 2: app logos */}
              {flow.appKeys.length > 0 && (
                <div className="flex items-center gap-1 ml-5 flex-wrap">
                  {flow.appKeys.slice(0, 8).map((key, i) => (
                    <div key={i} className="w-4 h-4 rounded bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      <img
                        src={`${API_BASE_URL}/api/proxy/favicon?domain=${APP_DOMAINS[key] ?? key + ".com"}`}
                        alt={key}
                        style={{ width: 12, height: 12, objectFit: "contain", display: "block" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  ))}
                  {flow.appKeys.length > 8 && (
                    <span className="text-[9px] text-slate-600">+{flow.appKeys.length - 8}</span>
                  )}
                </div>
              )}

              {/* Row 3: KPIs */}
              <div className="flex items-center gap-3 ml-5 text-[10px]">
                <span className={flow.eventCount > 0 ? "text-slate-300 font-semibold" : "text-slate-600"}>
                  {flow.eventCount.toLocaleString()} events
                </span>
                {flow.eventCount > 0 && (
                  <span className={flow.successRate >= 80 ? "text-emerald-400" : flow.successRate >= 50 ? "text-amber-400" : "text-red-400"}>
                    {flow.successRate}% success
                  </span>
                )}
                {flow.lastActivity && (
                  <span className="text-slate-600">
                    {new Date(flow.lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Selected flows strip (shared across card types) ───────────────────────────

function FlowStrip({ flows }: { flows: PerFlowStat[] }) {
  if (!flows.length) return null;
  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Included flows</div>
      <div className="flex flex-col gap-1">
        {flows.map(f => (
          <div key={f.id} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-2 py-1.5">
            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
              f.platform === "n8n"
                ? "bg-orange-500/20 text-orange-400"
                : "bg-violet-500/20 text-violet-400"
            }`}>
              {f.platform === "n8n" ? "n8n" : "Make"}
            </span>
            <span className="flex-1 text-[10px] text-slate-300 truncate font-medium">{f.name}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {f.appKeys.slice(0, 5).map((key, i) => (
                <div key={i} className="w-4 h-4 rounded bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  <img
                    src={`${API_BASE_URL}/api/proxy/favicon?domain=${APP_DOMAINS[key] ?? key + ".com"}`}
                    alt={key}
                    style={{ width: 12, height: 12, objectFit: "contain", display: "block" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ))}
            </div>
            {f.eventCount > 0 && (
              <span className="text-[9px] text-slate-500 font-mono tabular-nums">
                {f.eventCount.toLocaleString()}
              </span>
            )}
            {f.eventCount > 0 && (
              <span className={`text-[9px] font-semibold ${
                f.successRate >= 80 ? "text-emerald-400" : f.successRate >= 50 ? "text-amber-400" : "text-red-400"
              }`}>
                {f.successRate}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function ReportCard({
  reportType, cardFormat, data, insight, activeFlows,
}: {
  reportType: ReportType; cardFormat: CardFormat;
  data: ReportData; insight: string; activeFlows: PerFlowStat[];
}) {
  const props = { data, insight, format: cardFormat, activeFlows };
  switch (reportType) {
    case "snapshot": return <SnapshotCard {...props} />;
    case "funnel":   return <FunnelCard   {...props} />;
    case "digest":   return <DigestCard   {...props} />;
    case "revenue":  return <RevenueCard  {...props} />;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportStudioPage() {
  const [workspaceId,  setWorkspaceId]  = useState("");
  const [reportType,   setReportType]   = useState<ReportType>("snapshot");
  const [cardFormat,   setCardFormat]   = useState<CardFormat>("linkedin");
  const [period,       setPeriod]       = useState<Period>("30d");
  const [data,         setData]         = useState<ReportData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [selectedIds,  setSelectedIds]  = useState<string[]>([]);  // empty = all flows
  const [insight,     setInsight]       = useState("");
  const [aiLoading,   setAiLoading]     = useState(false);
  const [exporting,   setExporting]     = useState(false);
  const [shareToken,  setShareToken]    = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copied,      setCopied]        = useState(false);

  const cardRef  = useRef<HTMLDivElement>(null);
  const token    = () => localStorage.getItem("iqpipe_token") ?? "";

  // Load workspace ID
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  const handleToggleFlow = (id: string) => {
    setSelectedIds(prev => {
      // If currently "all selected" (empty), switch to selecting only this one
      if (prev.length === 0) return [id];
      const has = prev.includes(id);
      const next = has ? prev.filter(x => x !== id) : [...prev, id];
      // If all flows are now selected, collapse back to "all" (empty)
      return data && next.length === (data.perFlow?.length ?? 0) ? [] : next;
    });
  };

  const handleSelectAll = () => setSelectedIds([]);

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setInsight("");
    setShareToken("");
    setSelectedIds([]);
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/report-studio/data?workspaceId=${workspaceId}&period=${period}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      if (r.ok) setData(await r.json());
    } catch {} finally { setLoading(false); }
  }, [workspaceId, period]);

  useEffect(() => { if (workspaceId) loadData(); }, [workspaceId, loadData]);

  // Generate AI insight
  const generateInsight = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/report-studio/insights`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({ data, reportType }),
      });
      if (r.ok) {
        const j = await r.json();
        setInsight(j.insight ?? "");
      }
    } catch {} finally { setAiLoading(false); }
  };

  // Export PNG
  const exportPNG = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale:           2,
        useCORS:         true,
        backgroundColor: null,
        logging:         false,
      });
      const link      = document.createElement("a");
      link.download   = `iqpipe-${reportType}-${period}.png`;
      link.href       = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally { setExporting(false); }
  };

  // Create share link
  const createShareLink = async () => {
    if (!data || !workspaceId) return;
    setShareLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/report-studio/share`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({ workspaceId, reportType, cardFormat, period, insight, data }),
      });
      if (r.ok) {
        const j = await r.json();
        setShareToken(j.token);
      }
    } catch {} finally { setShareLoading(false); }
  };

  const copyShareLink = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/report/${shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Card preview aspect class
  const aspectClass = FORMAT_LABELS[cardFormat].aspect;

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center">
            <Sparkles size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">Report Studio</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">Generate social-ready GTM performance cards</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh data
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">

        {/* ── Left panel: controls ── */}
        <div className="flex flex-col gap-4">

          {/* Report type */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Report type</div>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_TYPES.map(rt => {
                const active = reportType === rt.key;
                return (
                  <button
                    key={rt.key}
                    onClick={() => { setReportType(rt.key); setInsight(""); setShareToken(""); }}
                    className={`flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all ${
                      active
                        ? "bg-indigo-500/10 border-indigo-500/30"
                        : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600"
                    }`}
                  >
                    <rt.icon size={14} className={active ? "text-indigo-400" : "text-slate-500"} />
                    <div className={`text-xs font-semibold leading-tight ${active ? "text-white" : "text-slate-400"}`}>
                      {rt.label}
                    </div>
                    <div className="text-[10px] text-slate-600 leading-tight">{rt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card format */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Card format</div>
            <div className="flex gap-2">
              {(Object.keys(FORMAT_LABELS) as CardFormat[]).map(f => {
                const active = cardFormat === f;
                const cfg    = FORMAT_LABELS[f];
                return (
                  <button
                    key={f}
                    onClick={() => setCardFormat(f)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-all ${
                      active
                        ? "bg-indigo-500/10 border-indigo-500/30"
                        : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600"
                    }`}
                  >
                    <span className={`text-xs font-semibold ${active ? "text-white" : "text-slate-400"}`}>{cfg.label}</span>
                    <span className="text-[9px] text-slate-600">{cfg.size}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Period */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Time period</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    period === p
                      ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                      : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Flow selector */}
          {data && (data.perFlow?.length ?? 0) > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Select flows
                </div>
                {selectedIds.length > 0 && (
                  <span className="text-[10px] text-indigo-400 font-semibold">
                    {selectedIds.length} of {data.perFlow?.length ?? 0} selected
                  </span>
                )}
              </div>
              <FlowSelector
                flows={data.perFlow ?? []}
                selectedIds={selectedIds}
                onToggle={handleToggleFlow}
                onSelectAll={handleSelectAll}
              />
            </div>
          )}

          {/* AI insights */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">AI insights</div>
            {insight ? (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-xs text-slate-300 leading-relaxed mb-3">
                {insight}
              </div>
            ) : (
              <p className="text-xs text-slate-600 mb-3">Generate a punchy AI narrative to include in your card.</p>
            )}
            <button
              onClick={generateInsight}
              disabled={aiLoading || !data}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={13} className={aiLoading ? "animate-pulse" : ""} />
              {aiLoading ? "Generating…" : insight ? "Regenerate" : "✨ Generate AI insight"}
            </button>
          </div>

          {/* Export & share */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Export & share</div>
            <button
              onClick={exportPNG}
              disabled={exporting || !data}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all disabled:opacity-40"
            >
              <Download size={13} className={exporting ? "animate-bounce" : ""} />
              {exporting ? "Exporting…" : "Export PNG"}
            </button>

            {!shareToken ? (
              <button
                onClick={createShareLink}
                disabled={shareLoading || !data}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all disabled:opacity-40"
              >
                <Share2 size={13} />
                {shareLoading ? "Creating link…" : "Create share link"}
              </button>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-800 rounded-xl px-3 py-2 text-[10px] text-slate-400 font-mono truncate">
                  /report/{shareToken.slice(0, 12)}…
                </div>
                <button
                  onClick={copyShareLink}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    copied ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <a
                  href={`/report/${shareToken}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: preview ── */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">
              Preview
              <span className="ml-2 text-[11px] text-slate-500 font-normal">{FORMAT_LABELS[cardFormat].size}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <ChevronRight size={11} />
              <span>Right-click → Save as to download the preview</span>
            </div>
          </div>

          {loading ? (
            <div className={`w-full ${aspectClass} bg-slate-900/50 border border-slate-800 rounded-2xl flex items-center justify-center`}>
              <div className="flex flex-col items-center gap-3">
                <RefreshCw size={20} className="text-indigo-400 animate-spin" />
                <span className="text-xs text-slate-500">Loading report data…</span>
              </div>
            </div>
          ) : !data ? (
            <div className={`w-full ${aspectClass} bg-slate-900/50 border border-dashed border-slate-700 rounded-2xl flex items-center justify-center`}>
              <div className="text-center">
                <Sparkles size={24} className="text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-600">Connect automations to generate your first report</p>
              </div>
            </div>
          ) : (
            <div
              className={`w-full ${aspectClass} rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl shadow-indigo-500/5`}
              ref={cardRef}
            >
              <ReportCard
                reportType={reportType}
                cardFormat={cardFormat}
                data={data}
                insight={insight}
                activeFlows={
                  selectedIds.length === 0
                    ? (data.perFlow ?? [])
                    : (data.perFlow ?? []).filter(f => selectedIds.includes(f.id))
                }
              />
            </div>
          )}

          {/* Data summary strip */}
          {data && (
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Workflows",  value: data.workflows.total           },
                { label: "Events",     value: data.events.total              },
                { label: "Success",    value: `${data.events.successRate}%`  },
                { label: "Verified",   value: data.correlations.verified     },
                { label: "Health",     value: `${data.avgHealthScore}%`      },
              ].map(s => (
                <div key={s.label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-sm font-bold text-white tabular-nums">
                    {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
