import { useState, useEffect, useCallback } from "react";
import {
  Activity, RefreshCw, Calendar, ChevronDown,
  AlertTriangle, CheckCircle2, TrendingDown, Clock,
  Users, Layers, GitBranch, Database, Zap, ArrowRight,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface LatencyBucket  { label: string; min: number; max: number; count: number; color: string; }
interface FreqBucket     { label: string; range: string; min: number; max: number; count: number; color: string; }
interface EnrichBucket   { label: string; days: string; min: number; max: number; count: number; color: string; }
interface FunnelStep     { label: string; count: number; pct: number; dropPct: number | null; }
interface PathEntry      { path: string[]; count: number; outcomes: number; convRate: number; }
interface OverTouchedLead { displayName: string; company: string; title: string; count: number; }

interface HealthData {
  period: string;
  healthScore: number;
  latency: {
    buckets: LatencyBucket[];
    avgFormatted: string | null;
    medianFormatted: string | null;
    fastPct: number;
    totalMeasured: number;
    insight: string;
  };
  frequency: {
    buckets: FreqBucket[];
    overTouchedCount: number;
    overTouchedLeads: OverTouchedLead[];
    insight: string;
  };
  coverage: {
    totalImported: number;
    withOutreach: number;
    gaps: number;
    gapPct: number;
    insight: string;
  };
  funnel: { steps: FunnelStep[]; biggestDrop: string; };
  paths: { top: PathEntry[]; totalWithOutcome: number; };
  enrichment: {
    buckets: EnrichBucket[];
    activeWithStale: number;
    neverEnriched: number;
    freshEnrichPct: number;
    activeTotal: number;
    insight: string;
  };
}

type Period = "7d" | "30d" | "90d" | "all";
const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "all": "All time",
};

// ─────────────────────────────────────────────────────────────────────────────
// COLOUR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  emerald: { bar: "bg-emerald-500",  text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  blue:    { bar: "bg-blue-500",     text: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30"    },
  amber:   { bar: "bg-amber-500",    text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30"   },
  orange:  { bar: "bg-orange-500",   text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30"  },
  rose:    { bar: "bg-rose-500",     text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30"    },
  slate:   { bar: "bg-slate-600",    text: "text-slate-500",   bg: "bg-slate-800/50",   border: "border-slate-700"      },
};

function scoreColor(s: number) {
  if (s >= 75) return { text: "text-emerald-400", ring: "border-emerald-500/40", label: "Healthy" };
  if (s >= 50) return { text: "text-amber-400",   ring: "border-amber-500/40",   label: "At Risk" };
  return              { text: "text-rose-400",     ring: "border-rose-500/40",    label: "Critical" };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, insight, insightOk, children }: {
  title: string; icon: typeof Activity; insight?: string; insightOk?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-indigo-400 shrink-0"/>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {insight && (
          <div className={`flex items-center gap-1.5 text-[11px] ${insightOk ? "text-emerald-400" : "text-amber-400"}`}>
            {insightOk ? <CheckCircle2 size={11}/> : <AlertTriangle size={11}/>}
            <span className="hidden sm:inline leading-tight max-w-xs text-right">{insight}</span>
          </div>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function BucketBars({ buckets, total }: { buckets: { label: string; count: number; color: string }[]; total: number }) {
  return (
    <div className="space-y-2.5">
      {buckets.map(b => {
        const pct = total > 0 ? (b.count / total) * 100 : 0;
        const c   = COLOR_MAP[b.color] ?? COLOR_MAP.slate;
        return (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-24 shrink-0 text-right">{b.label}</span>
            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full ${c.bar} transition-all`} style={{ width: `${pct}%` }}/>
            </div>
            <span className={`text-xs font-semibold tabular-nums w-8 ${c.text}`}>{b.count}</span>
            <span className="text-[10px] text-slate-700 tabular-nums w-8">{Math.round(pct)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.slate;
  return (
    <div className={`flex flex-col items-center px-4 py-3 rounded-xl border ${c.bg} ${c.border}`}>
      <span className={`text-xl font-bold tabular-nums ${c.text}`}>{value}</span>
      <span className="text-[10px] text-slate-500 mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LABEL MAP
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  lead_imported: "Import",
  lead_enriched: "Enrich",
  email_sent: "Email",
  sequence_started: "Sequence",
  message_sent: "Message",
  connection_sent: "Li Connect",
  connection_request_sent: "Li Request",
  email_opened: "Opened",
  email_clicked: "Clicked",
  link_clicked: "Link Click",
  reply_received: "Reply",
  meeting_booked: "Meeting",
  deal_won: "Won",
  deal_created: "Deal",
};
const EVENT_COLOR: Record<string, string> = {
  lead_imported: "slate", lead_enriched: "blue",
  email_sent: "indigo", sequence_started: "indigo", message_sent: "sky",
  connection_sent: "sky", connection_request_sent: "sky",
  email_opened: "amber", email_clicked: "amber", link_clicked: "amber",
  reply_received: "emerald", meeting_booked: "emerald",
  deal_won: "emerald", deal_created: "green",
};

function PathBadge({ event }: { event: string }) {
  const c = COLOR_MAP[EVENT_COLOR[event] ?? "slate"] ?? COLOR_MAP.slate;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${c.bg} ${c.border} ${c.text} whitespace-nowrap`}>
      {EVENT_LABEL[event] ?? event.replace(/_/g, " ")}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkflowHealthPage() {
  const [data,        setData]        = useState<HealthData | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading,     setLoading]     = useState(true);
  const [period,      setPeriod]      = useState<Period>("30d");
  const [showPeriod,  setShowPeriod]  = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); else setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const load = useCallback(async (wsId: string, p: Period) => {
    if (!wsId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/workflow-health?workspaceId=${wsId}&period=${p}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      if (r.ok) { setData(await r.json()); setLastRefresh(new Date()); }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (workspaceId) load(workspaceId, period); }, [workspaceId, period, load]);

  const sc = data ? scoreColor(data.healthScore) : scoreColor(0);

  // Dimension sub-scores (0-25 each)
  const dimScores = data ? [
    { label: "Latency",   score: Math.min(25, data.latency.fastPct  * 0.25),              icon: Clock,     ok: data.latency.fastPct >= 50    },
    { label: "Frequency", score: Math.min(25, (1 - data.frequency.overTouchedCount / Math.max(1, data.frequency.buckets.reduce((s,b)=>s+b.count,0))) * 25), icon: Users,     ok: data.frequency.overTouchedCount === 0 },
    { label: "Coverage",  score: Math.min(25, (1 - data.coverage.gapPct / 100) * 25),     icon: Layers,    ok: data.coverage.gapPct < 10      },
    { label: "Freshness", score: Math.min(25, data.enrichment.freshEnrichPct * 0.25),     icon: Database,  ok: data.enrichment.freshEnrichPct >= 70 },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-6 space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-indigo-400"/>
          <div>
            <h1 className="text-base font-bold text-white leading-none">Workflow Health</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Cross-tool process quality — what your automation tools don't show you
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button onClick={() => setShowPeriod(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-colors">
              <Calendar size={11} className="text-slate-600"/>
              {PERIOD_LABELS[period]}
              <ChevronDown size={11} className={`text-slate-600 transition-transform ${showPeriod ? "rotate-180" : ""}`}/>
            </button>
            {showPeriod && (
              <div className="absolute top-full right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden z-20 shadow-xl w-40">
                {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => { setPeriod(k); setShowPeriod(false); }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors ${period === k ? "text-indigo-400 font-medium" : "text-slate-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-[10px] text-slate-700 tabular-nums">
            {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button onClick={() => load(workspaceId, period)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-colors">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""}/>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin"/> Analysing workflow health…
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center h-48 text-slate-700 text-sm">No data available</div>
      ) : (
        <>
          {/* ── Health Score Banner ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-6 flex-wrap">
              {/* Score circle */}
              <div className={`flex flex-col items-center justify-center w-24 h-24 rounded-full border-4 ${sc.ring} shrink-0`}>
                <span className={`text-3xl font-black tabular-nums ${sc.text}`}>{data.healthScore}</span>
                <span className={`text-[10px] font-semibold ${sc.text}`}>{sc.label}</span>
              </div>

              {/* Dimension scores */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                {dimScores.map(d => {
                  const pct = Math.round((d.score / 25) * 100);
                  return (
                    <div key={d.label} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <d.icon size={11} className={d.ok ? "text-emerald-400" : "text-amber-400"}/>
                          <span className="text-[10px] text-slate-500 font-medium">{d.label}</span>
                        </div>
                        <span className={`text-[10px] font-bold ${d.ok ? "text-emerald-400" : "text-amber-400"}`}>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${d.ok ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block text-right">
                <p className="text-[10px] text-slate-600 leading-relaxed max-w-xs">
                  Score reflects signal latency, contact frequency discipline, pipeline coverage, and enrichment freshness — none of which your CRM or automation tool surfaces.
                </p>
              </div>
            </div>
          </div>

          {/* ── 1. SIGNAL LATENCY ── */}
          <SectionCard
            title="Signal-to-Action Latency"
            icon={Clock}
            insight={data.latency.insight}
            insightOk={data.latency.fastPct >= 50}
          >
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <BucketBars
                  buckets={data.latency.buckets}
                  total={data.latency.totalMeasured}
                />
                <p className="text-[10px] text-slate-700 mt-3">
                  Time between lead import and first outreach touchpoint. High-intent leads contacted after 24h convert at 3× lower rates.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <StatPill label="Avg response time"    value={data.latency.avgFormatted    ?? "—"} color="blue"/>
                <StatPill label="Median response time" value={data.latency.medianFormatted ?? "—"} color="slate"/>
                <StatPill label="< 4 hour response"    value={`${data.latency.fastPct}%`}           color={data.latency.fastPct >= 50 ? "emerald" : "rose"}/>
                <StatPill label="Leads measured"       value={data.latency.totalMeasured}           color="slate"/>
              </div>
            </div>
          </SectionCard>

          {/* ── 2. CONTACT FREQUENCY ── */}
          <SectionCard
            title="Cross-Tool Contact Frequency"
            icon={Users}
            insight={data.frequency.insight}
            insightOk={data.frequency.overTouchedCount === 0}
          >
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] text-slate-600 mb-3 uppercase tracking-wider font-semibold">Touches per lead / 7 days (all tools combined)</p>
                <BucketBars
                  buckets={data.frequency.buckets}
                  total={data.frequency.buckets.reduce((s, b) => s + b.count, 0)}
                />
              </div>

              <div>
                <p className="text-[10px] text-slate-600 mb-3 uppercase tracking-wider font-semibold">Highest frequency leads</p>
                {data.frequency.overTouchedLeads.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs">
                    <CheckCircle2 size={13}/> No over-touched leads
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.frequency.overTouchedLeads.map((l, i) => (
                      <div key={i} className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{l.displayName}</p>
                          <p className="text-[10px] text-slate-500 truncate">{l.company}{l.title ? ` · ${l.title}` : ""}</p>
                        </div>
                        <span className={`text-xs font-bold tabular-nums shrink-0 ${l.count >= 10 ? "text-rose-400" : "text-amber-400"}`}>
                          {l.count}×
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* ── 3. COVERAGE GAPS ── */}
          <SectionCard
            title="Pipeline Coverage Gaps"
            icon={Layers}
            insight={data.coverage.insight}
            insightOk={data.coverage.gapPct < 10}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <StatPill label="Total imported"    value={data.coverage.totalImported.toLocaleString()} color="slate"/>
              <StatPill label="Received outreach" value={data.coverage.withOutreach.toLocaleString()}  color="emerald"/>
              <StatPill label="Never contacted"   value={data.coverage.gaps.toLocaleString()}           color={data.coverage.gaps === 0 ? "emerald" : "rose"}/>
            </div>

            {data.coverage.gaps > 0 && (
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <TrendingDown size={13} className="text-rose-400"/>
                  <span className="text-xs font-semibold text-rose-400">Silent pipeline loss</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {data.coverage.gaps} leads were imported more than 7 days ago and have never received any outreach touchpoint across any connected tool. These are invisible in your CRM because no activity was ever logged against them.
                </p>
                <p className="text-[11px] text-slate-600">
                  Common causes: import without sequence enrollment, tool filter mismatch, ICP filter too strict after import.
                </p>
              </div>
            )}

            {data.coverage.gaps === 0 && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 size={14}/> Full coverage — every imported lead has received at least one outreach touchpoint
              </div>
            )}
          </SectionCard>

          {/* ── 4. STEP FUNNEL ── */}
          <SectionCard
            title="Multi-Step Pipeline Funnel"
            icon={GitBranch}
            insight={data.funnel.biggestDrop ? `Biggest drop: ${data.funnel.biggestDrop}` : undefined}
            insightOk={false}
          >
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 min-w-max pb-2">
                {data.funnel.steps.map((step, i) => {
                  const maxCount = data.funnel.steps[0].count || 1;
                  const barH = Math.max(8, Math.round((step.count / maxCount) * 120));
                  const isBigDrop = step.dropPct !== null && step.dropPct > 60;
                  return (
                    <div key={step.label} className="flex items-end gap-1">
                      <div className="flex flex-col items-center gap-1 w-20">
                        <span className="text-xs font-bold tabular-nums text-white">{step.count.toLocaleString()}</span>
                        {step.dropPct !== null && (
                          <span className={`text-[10px] font-semibold ${isBigDrop ? "text-rose-400" : step.dropPct > 30 ? "text-amber-400" : "text-emerald-400"}`}>
                            -{step.dropPct}%
                          </span>
                        )}
                        <div className="w-full rounded-t-lg transition-all"
                          style={{ height: `${barH}px`, background: step.dropPct !== null && isBigDrop ? "#f43f5e33" : step.dropPct !== null && step.dropPct > 30 ? "#f59e0b33" : "#6366f133" }}>
                          <div className="w-full h-full rounded-t-lg"
                            style={{ background: step.dropPct !== null && isBigDrop ? "#f43f5e" : step.dropPct !== null && step.dropPct > 30 ? "#f59e0b" : "#6366f1", opacity: 0.7 }}/>
                        </div>
                        <span className="text-[10px] text-slate-500 text-center leading-tight">{step.label}</span>
                      </div>
                      {i < data.funnel.steps.length - 1 && (
                        <ArrowRight size={12} className="text-slate-700 mb-6 shrink-0"/>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] text-slate-700 mt-2">
              All-time cumulative counts. Each bar represents unique leads that reached that event — not execution counts from your automation tool.
            </p>
          </SectionCard>

          {/* ── 5. PATH ATTRIBUTION ── */}
          <SectionCard
            title="Top Converting Touchpoint Paths"
            icon={Zap}
            insight={data.paths.totalWithOutcome > 0 ? `${data.paths.totalWithOutcome} leads produced outcomes` : "No outcomes yet"}
            insightOk={data.paths.totalWithOutcome > 0}
          >
            {data.paths.top.length === 0 ? (
              <div className="text-slate-700 text-sm text-center py-4">
                Not enough data yet — paths appear once leads complete multi-step journeys
              </div>
            ) : (
              <div className="space-y-3 overflow-x-auto">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-2 pb-1 border-b border-slate-800 min-w-[320px]">
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider">Path</span>
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider text-right">Leads</span>
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider text-right">Outcomes</span>
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider text-right">Conv.</span>
                </div>
                {data.paths.top.map((p, i) => (
                  <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-2 py-1.5 rounded-lg min-w-[320px] ${i === 0 && p.outcomes > 0 ? "bg-emerald-500/5 border border-emerald-500/10" : ""}`}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {p.path.map((ev, j) => (
                        <div key={j} className="flex items-center gap-1">
                          <PathBadge event={ev}/>
                          {j < p.path.length - 1 && <ArrowRight size={9} className="text-slate-700 shrink-0"/>}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs tabular-nums text-slate-400 text-right">{p.count}</span>
                    <span className="text-xs tabular-nums text-emerald-400 font-semibold text-right">{p.outcomes}</span>
                    <span className={`text-xs tabular-nums font-bold text-right ${p.convRate >= 20 ? "text-emerald-400" : p.convRate >= 5 ? "text-amber-400" : "text-slate-500"}`}>
                      {p.convRate}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-700 mt-4">
              Paths reconstructed from touchpoint sequences per lead. Only paths with 2+ leads shown. No CRM or automation tool surfaces this cross-tool view.
            </p>
          </SectionCard>

          {/* ── 6. ENRICHMENT HEALTH ── */}
          <SectionCard
            title="Enrichment Freshness"
            icon={Database}
            insight={data.enrichment.insight}
            insightOk={data.enrichment.freshEnrichPct >= 70 && data.enrichment.neverEnriched === 0}
          >
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] text-slate-600 mb-3 uppercase tracking-wider font-semibold">Active leads by enrichment age</p>
                <BucketBars
                  buckets={data.enrichment.buckets}
                  total={data.enrichment.activeTotal}
                />
                <p className="text-[10px] text-slate-700 mt-3">
                  Only leads with recent outreach (last 30 days). Sequences running on stale titles and companies produce lower reply rates — the personalisation is wrong.
                </p>
              </div>

              <div className="space-y-3">
                <StatPill label="Active leads"            value={data.enrichment.activeTotal}                         color="slate"/>
                <StatPill label="Freshly enriched"        value={`${data.enrichment.freshEnrichPct}%`}                color={data.enrichment.freshEnrichPct >= 70 ? "emerald" : "rose"}/>
                <StatPill label="Stale enrichment (90d+)" value={data.enrichment.activeWithStale}                     color={data.enrichment.activeWithStale === 0 ? "emerald" : "amber"}/>
                <StatPill label="Never enriched"          value={data.enrichment.neverEnriched}                      color={data.enrichment.neverEnriched === 0 ? "emerald" : "rose"}/>

                {data.enrichment.neverEnriched > 0 && (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-3 py-2.5">
                    <p className="text-[11px] text-rose-400 font-semibold mb-1">No enrichment detected</p>
                    <p className="text-[10px] text-slate-500">
                      {data.enrichment.neverEnriched} active lead{data.enrichment.neverEnriched !== 1 ? "s" : ""} in outreach sequences with no enrichment data on record. Email personalisation will fall back to raw import fields — expect significantly lower reply rates.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <p className="text-[10px] text-slate-700 pb-4">
            All metrics derived from cross-tool Touchpoint events. None of these dimensions are visible in isolation within your CRM, automation tool, or sending platform.
          </p>
        </>
      )}
    </div>
  );
}
