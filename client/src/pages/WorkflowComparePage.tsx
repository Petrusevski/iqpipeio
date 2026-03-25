/**
 * WorkflowComparePage — GTM Alpha Score head-to-head comparison
 *
 * Scoring is fully backend-driven via GET /api/workflow-score.
 * The backend implements the 4-pillar weighted GTM Alpha Score:
 *   Reliability (30%) · Throughput (25%) · Connectivity (20%) · Criticality (25%)
 * plus Leakage Value (estimated revenue lost from failed events).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy, TrendingUp, RefreshCw, ChevronDown,
  Bot, Layers, AlertTriangle, CheckCircle2,
  BarChart3, DollarSign, Zap, ShieldCheck,
  Network, Star, ArrowUpRight, Info,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days",
  "90d": "Last 90 days", "all": "All time",
};

interface WorkflowMeta {
  id: string; n8nId: string; name: string; active: boolean;
  appsUsed: string[]; nodeCount: number; triggerType: string; execSyncEnabled: boolean;
}
interface ScenarioMeta {
  id: string; makeId: string; name: string; active: boolean;
  appsUsed: string[]; moduleCount: number; triggerType: string; execSyncEnabled: boolean;
}

// Selectable item in the card grid
interface SelectableWorkflow {
  internalId: string;   // cuid from DB — used for UI selection state
  platformId: string;   // n8nId or makeId — passed to backend
  platform:   "n8n" | "make";
  name:       string;
  active:     boolean;
  appsUsed:   string[];
  nodeCount:  number;
  triggerType: string;
  execSyncEnabled: boolean;
}

// Backend /api/workflow-score response types
interface PillarScores {
  reliability:  number;
  throughput:   number;
  connectivity: number;
  criticality:  number;
}
interface LeakageBreakdown {
  eventType:     string;
  failedCount:   number;
  conversionProb: number;
  estimatedLoss: number;
}
interface ScoredWorkflow {
  id:          string;   // platformId (n8nId or makeId)
  name:        string;
  platform:    "n8n" | "make";
  active:      boolean;
  triggerType: string;
  appsUsed:    string[];
  nodeCount:   number;
  metrics: {
    reliability:  { done: number; failed: number; total: number; rawScore: number };
    throughput:   { outcomeEvents: number; processEvents: number; outcomeRate: number; rawScore: number };
    connectivity: { appCount: number; highValueApps: string[]; rawScore: number };
    criticality:  { eventBreakdown: Record<string, number>; rawScore: number };
  };
  pillars:    PillarScores;
  alphaScore: number;
  grade:      string;
  leakage: {
    totalLoss: number;
    currency:  string;
    breakdown: LeakageBreakdown[];
  };
  lastEventAt: string | null;
}
interface ScoreResponse {
  scoring_model: {
    weights: Record<string, number>;
    leakage_config: { acv: number; currency: string };
  };
  workflows: ScoredWorkflow[];
  winner:    { id: string; name: string; alphaScore: number; grade: string } | null;
  comparison: Record<string, string> | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const token = () => localStorage.getItem("iqpipe_token") ?? "";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtCurrency(val: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(val);
}

const GRADE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  A: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  B: { color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30"  },
  C: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30"   },
  D: { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30"  },
  F: { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30"    },
};

const PILLAR_META = [
  { key: "reliability",  label: "Reliability",           icon: ShieldCheck,  weight: "30%", desc: "Success rate of processed events"      },
  { key: "throughput",   label: "Throughput",             icon: TrendingUp,   weight: "25%", desc: "Outcome event ratio + relative volume" },
  { key: "connectivity", label: "Connectivity Depth",     icon: Network,      weight: "20%", desc: "App diversity + high-value app bonus"  },
  { key: "criticality",  label: "Business Criticality",   icon: Star,         weight: "25%", desc: "Event-type weighted GTM importance"    },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const s = GRADE_STYLE[grade] ?? GRADE_STYLE.F;
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${s.color} ${s.bg} border ${s.border}`}>
      {grade}
    </span>
  );
}

function PillarBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" :
    value >= 60 ? "bg-indigo-500"  :
    value >= 40 ? "bg-amber-500"   : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-400">{value}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowComparePage() {
  const navigate = useNavigate();

  const [period,         setPeriod]         = useState<Period>("30d");
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [activePlatform, setActivePlatform] = useState<"n8n" | "make">("n8n");
  const [acv,            setAcv]            = useState<number>(5000);
  const [acvInput,       setAcvInput]       = useState("5000");

  const [wsId,         setWsId]         = useState<string | null>(null);
  const [loadingWs,    setLoadingWs]    = useState(true);
  const [loadingN8n,   setLoadingN8n]   = useState(false);
  const [loadingMake,  setLoadingMake]  = useState(false);
  const [loadingScore, setLoadingScore] = useState(false);

  const [n8nWorkflows,  setN8nWorkflows]  = useState<WorkflowMeta[]>([]);
  const [makeScenarios, setMakeScenarios] = useState<ScenarioMeta[]>([]);
  const [scoreData,     setScoreData]     = useState<ScoreResponse | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set()); // internalIds

  const scoreAbortRef = useRef<AbortController | null>(null);

  // ── Workspace ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingWs(true);
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWsId(d.id); })
      .catch(() => {})
      .finally(() => setLoadingWs(false));
  }, []);

  // ── Fetch workflow lists ──────────────────────────────────────────────────────
  const fetchN8n = useCallback(() => {
    if (!wsId) return;
    setLoadingN8n(true);
    fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setN8nWorkflows(d); })
      .catch(() => {})
      .finally(() => setLoadingN8n(false));
  }, [wsId]);

  const fetchMake = useCallback(() => {
    if (!wsId) return;
    setLoadingMake(true);
    fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setMakeScenarios(d); })
      .catch(() => {})
      .finally(() => setLoadingMake(false));
  }, [wsId]);

  useEffect(() => {
    if (wsId) { fetchN8n(); fetchMake(); }
  }, [wsId, fetchN8n, fetchMake]);

  // ── Build unified selectable list ────────────────────────────────────────────
  const allSelectables: SelectableWorkflow[] = [
    ...n8nWorkflows.map(m => ({
      internalId:      m.id,
      platformId:      m.n8nId,
      platform:        "n8n" as const,
      name:            m.name,
      active:          m.active,
      appsUsed:        m.appsUsed ?? [],
      nodeCount:       m.nodeCount,
      triggerType:     m.triggerType,
      execSyncEnabled: m.execSyncEnabled,
    })),
    ...makeScenarios.map(s => ({
      internalId:      s.id,
      platformId:      s.makeId,
      platform:        "make" as const,
      name:            s.name,
      active:          s.active,
      appsUsed:        s.appsUsed ?? [],
      nodeCount:       s.moduleCount,
      triggerType:     s.triggerType,
      execSyncEnabled: s.execSyncEnabled,
    })),
  ];

  const platformItems = allSelectables.filter(w => w.platform === activePlatform);

  // Map internalId → platformId for backend calls
  const selInternal  = allSelectables.filter(w => selected.has(w.internalId));
  const selPlatformIds = selInternal.map(w => w.platformId);

  // ── Fetch backend scores when ≥2 selected ─────────────────────────────────
  useEffect(() => {
    if (!wsId || selPlatformIds.length < 2) {
      setScoreData(null);
      return;
    }

    // Cancel any in-flight request
    scoreAbortRef.current?.abort();
    scoreAbortRef.current = new AbortController();

    setLoadingScore(true);
    const params = new URLSearchParams({
      workspaceId: wsId,
      period,
      acv:         String(acv),
      platform:    activePlatform,
    });
    selPlatformIds.forEach(id => params.append("ids[]", id));

    fetch(`${API_BASE_URL}/api/workflow-score?${params}`, {
      headers: { Authorization: `Bearer ${token()}` },
      signal: scoreAbortRef.current.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setScoreData(d as ScoreResponse); })
      .catch(e => { if (e.name !== "AbortError") console.error("[workflow-score]", e); })
      .finally(() => setLoadingScore(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, selected, period, acv, activePlatform]);

  // ── Selection handlers ───────────────────────────────────────────────────────
  function toggleSelect(internalId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(internalId)) { next.delete(internalId); }
      else if (next.size < 4)   { next.add(internalId); }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(platformItems.slice(0, 4).map(w => w.internalId)));
  }

  // ── Score data helpers ───────────────────────────────────────────────────────
  // Map platformId → ScoredWorkflow for quick lookup
  const scoredMap: Record<string, ScoredWorkflow> = {};
  (scoreData?.workflows ?? []).forEach(w => { scoredMap[w.id] = w; });

  const scoredItems: ScoredWorkflow[] = selPlatformIds
    .map(id => scoredMap[id])
    .filter(Boolean);

  const winnerPlatformId = scoreData?.winner?.id ?? null;

  function bestPlatformId(key: keyof PillarScores): string | null {
    return scoreData?.comparison?.[`best_${key}`] ?? null;
  }

  function pillarCellClass(wfPlatformId: string, pillarKey: keyof PillarScores): string {
    const best = bestPlatformId(pillarKey);
    if (wfPlatformId === best) return "text-emerald-400 font-semibold";
    return "text-slate-300";
  }

  // ── States ───────────────────────────────────────────────────────────────────
  const isLoadingLists  = loadingWs || loadingN8n || loadingMake;
  const noConnection    = !isLoadingLists && allSelectables.length === 0;
  const showEmptySelect = selected.size < 2;
  const showMatrix      = selected.size >= 2;

  const currency = scoreData?.scoring_model?.leakage_config?.currency ?? "USD";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={18} className="text-indigo-400" />
              <h1 className="text-xl font-bold text-white tracking-tight">Workflow Comparison</h1>
            </div>
            <p className="text-sm text-slate-500">
              GTM Alpha Score — weighted performance grading across 4 pillars
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* ACV input */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
              <DollarSign size={12} className="text-emerald-400 shrink-0" />
              <span className="text-[11px] text-slate-500">ACV</span>
              <input
                type="number" min="1" step="500"
                value={acvInput}
                onChange={e => setAcvInput(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(acvInput);
                  if (!isNaN(v) && v > 0) setAcv(v);
                  else setAcvInput(String(acv));
                }}
                className="w-20 bg-transparent text-sm text-white text-right focus:outline-none"
              />
            </div>

            {/* Period picker */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodMenu(p => !p)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
              >
                <TrendingUp size={13} className="text-indigo-400" />
                {PERIOD_LABELS[period]}
                <ChevronDown size={13} className={`transition-transform ${showPeriodMenu ? "rotate-180" : ""}`} />
              </button>
              {showPeriodMenu && (
                <div className="absolute right-0 top-10 z-20 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        p === period ? "text-white bg-indigo-500/20" : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Scoring model pills ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PILLAR_META.map(p => (
            <div key={p.key} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <p.icon size={14} className="text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{p.label}</p>
                <p className="text-[10px] text-slate-600">{p.weight} weight</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── No connection empty state ── */}
        {noConnection && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 size={40} className="text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">No workflows connected yet</p>
            <p className="text-slate-600 text-sm mt-1 mb-6">Connect n8n or Make.com to start comparing GTM performance</p>
            <button
              onClick={() => navigate("/automations")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
            >
              <ArrowUpRight size={14} /> Connect Automations
            </button>
          </div>
        )}

        {!noConnection && (
          <>
            {/* ── Platform tabs + workflow selector ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
                  {(["n8n", "make"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => { setActivePlatform(p); setSelected(new Set()); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        activePlatform === p
                          ? "bg-indigo-500/20 text-white border border-indigo-500/30"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {p === "n8n" ? <Bot size={13} /> : <Layers size={13} />}
                      {p === "n8n" ? "n8n" : "Make.com"}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500">
                        {p === "n8n" ? n8nWorkflows.length : makeScenarios.length}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={selected.size > 0 ? "text-indigo-400" : ""}>
                    {selected.size} / 4 selected
                  </span>
                  {platformItems.length >= 2 && (
                    <button
                      onClick={selectAll}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 hover:text-slate-300 transition-colors"
                    >
                      Compare All
                    </button>
                  )}
                  {selected.size > 0 && (
                    <button
                      onClick={() => setSelected(new Set())}
                      className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Workflow cards */}
              {isLoadingLists ? (
                <div className="flex items-center gap-2 text-slate-600 text-sm py-6">
                  <RefreshCw size={13} className="animate-spin" /> Loading workflows…
                </div>
              ) : platformItems.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">
                  No {activePlatform === "n8n" ? "n8n workflows" : "Make.com scenarios"} connected.{" "}
                  <button onClick={() => navigate("/automations")} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                    Connect now →
                  </button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {platformItems.map(wf => {
                    const isSelected = selected.has(wf.internalId);
                    const scored     = scoredMap[wf.platformId];
                    return (
                      <button
                        key={wf.internalId}
                        onClick={() => toggleSelect(wf.internalId)}
                        disabled={!isSelected && selected.size >= 4}
                        className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
                          isSelected
                            ? "border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/20"
                            : selected.size >= 4
                            ? "border-slate-800 bg-slate-900/30 opacity-40 cursor-not-allowed"
                            : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wf.active ? "bg-emerald-500" : "bg-slate-600"}`} />
                            <span className="text-sm font-medium text-white truncate">{wf.name}</span>
                          </div>
                          {isSelected && scored && (
                            <GradeBadge grade={scored.grade} />
                          )}
                          {isSelected && !scored && (
                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                              <RefreshCw size={10} className="text-slate-500 animate-spin" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {wf.appsUsed.slice(0, 4).map(app => (
                            <span key={app} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700/80 text-slate-500">
                              {app}
                            </span>
                          ))}
                          {wf.appsUsed.length > 4 && (
                            <span className="text-[10px] text-slate-600">+{wf.appsUsed.length - 4}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-600">
                          <span>{wf.nodeCount} nodes</span>
                          <span className="capitalize">{wf.triggerType}</span>
                          {wf.execSyncEnabled && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 size={9} /> Capture on
                            </span>
                          )}
                        </div>
                        {isSelected && scored && (
                          <div className="mt-2 pt-2 border-t border-slate-800">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-600">Alpha Score</span>
                              <span className={`text-sm font-bold ${GRADE_STYLE[scored.grade]?.color}`}>
                                {scored.alphaScore}
                              </span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Placeholder when < 2 selected ── */}
            {showEmptySelect && !isLoadingLists && platformItems.length >= 2 && (
              <div className="flex flex-col items-center justify-center py-14 rounded-2xl border border-dashed border-slate-800 text-center">
                <BarChart3 size={32} className="text-slate-700 mb-3" />
                <p className="text-slate-500 font-medium">Select 2 or more workflows to compare</p>
                <p className="text-slate-700 text-xs mt-1">Up to 4 workflows can be compared at once</p>
              </div>
            )}

            {/* ── GTM Alpha Score Matrix ── */}
            {showMatrix && (
              <div className="space-y-4">

                {/* Loading overlay */}
                {loadingScore && (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <RefreshCw size={13} className="animate-spin text-indigo-400" />
                    Calculating GTM Alpha Scores…
                  </div>
                )}

                {!loadingScore && scoredItems.length >= 2 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">

                    {/* Matrix header row */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="px-5 py-4 text-left text-[10px] text-slate-600 uppercase tracking-wider font-semibold w-44 shrink-0">
                              GTM Metric
                            </th>
                            {scoredItems.map(wf => {
                              const isWinner = wf.id === winnerPlatformId;
                              return (
                                <th key={wf.id} className={`px-5 py-4 text-left min-w-[200px] ${isWinner ? "bg-indigo-500/5" : ""}`}>
                                  <div className={`rounded-xl border px-3 py-2.5 ${isWinner ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/50"}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      {wf.platform === "n8n"
                                        ? <Bot size={12} className="text-orange-400 shrink-0" />
                                        : <Layers size={12} className="text-purple-400 shrink-0" />
                                      }
                                      <span className="text-sm font-semibold text-white truncate">{wf.name}</span>
                                      {isWinner && <Trophy size={12} className="text-amber-400 shrink-0 ml-auto" />}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <GradeBadge grade={wf.grade} />
                                      <div>
                                        <span className={`text-2xl font-black tabular-nums ${GRADE_STYLE[wf.grade]?.color}`}>
                                          {wf.alphaScore}
                                        </span>
                                        <span className="text-[10px] text-slate-600 ml-1">/ 100</span>
                                      </div>
                                      {isWinner && (
                                        <span className="ml-auto text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                          Best Stack
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/40">

                          {/* ── Pillar rows ── */}
                          {PILLAR_META.map((pillar, rowIdx) => (
                            <tr key={pillar.key} className={rowIdx % 2 === 0 ? "bg-slate-900/20" : ""}>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <pillar.icon size={13} className="text-slate-500 shrink-0" />
                                  <div>
                                    <p className="text-xs font-medium text-slate-300">{pillar.label}</p>
                                    <p className="text-[10px] text-slate-600">{pillar.weight}</p>
                                  </div>
                                </div>
                              </td>
                              {scoredItems.map(wf => {
                                const val  = wf.pillars[pillar.key as keyof PillarScores];
                                const best = scoreData?.comparison?.[`best_${pillar.key}`] === wf.id;
                                return (
                                  <td key={wf.id} className={`px-5 py-3.5 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                    <div className="space-y-1.5">
                                      <PillarBar value={val} />
                                      {best && (
                                        <span className="text-[10px] text-emerald-400 font-medium">▲ Best</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}

                          {/* ── Reliability detail ── */}
                          <tr className="bg-slate-900/30">
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">Success / Failed / Total</p>
                            </td>
                            {scoredItems.map(wf => {
                              const m  = wf.metrics.reliability;
                              const best = m.total > 0 && scoreData?.comparison?.best_reliability === wf.id;
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  <span className={`text-xs tabular-nums ${best ? pillarCellClass(wf.id, "reliability") : "text-slate-500"}`}>
                                    {m.total > 0 ? <>{m.done} <span className="text-slate-700">/</span> <span className="text-rose-400">{m.failed}</span> <span className="text-slate-700">/</span> {m.total}</> : "—"}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Throughput detail ── */}
                          <tr>
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">Outcome / Process events</p>
                            </td>
                            {scoredItems.map(wf => {
                              const m = wf.metrics.throughput;
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  <span className="text-xs text-slate-500 tabular-nums">
                                    {(m.outcomeEvents + m.processEvents) === 0 ? "—" : <><span className="text-emerald-400">{m.outcomeEvents}</span> / {m.processEvents}</>}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Connectivity detail ── */}
                          <tr className="bg-slate-900/30">
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">High-value apps</p>
                            </td>
                            {scoredItems.map(wf => {
                              const hvApps = wf.metrics.connectivity.highValueApps;
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  {hvApps.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {hvApps.slice(0, 4).map(a => (
                                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                          {a}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-700">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Top event types (criticality) ── */}
                          <tr>
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">Top event types</p>
                            </td>
                            {scoredItems.map(wf => {
                              const breakdown = wf.metrics.criticality.eventBreakdown;
                              const top = Object.entries(breakdown)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3);
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  {top.length > 0 ? (
                                    <div className="flex flex-col gap-0.5">
                                      {top.map(([type, count]) => (
                                        <span key={type} className="text-[10px] text-slate-500">
                                          <span className="text-slate-400">{type.replace(/_/g, " ")}</span>
                                          <span className="text-slate-700 ml-1">×{count}</span>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-700">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Last active ── */}
                          <tr className="bg-slate-900/30">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <Zap size={13} className="text-slate-500 shrink-0" />
                                <p className="text-xs font-medium text-slate-300">Last Active</p>
                              </div>
                            </td>
                            {scoredItems.map(wf => (
                              <td key={wf.id} className={`px-5 py-3.5 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                <span className="text-xs text-slate-500">{relativeTime(wf.lastEventAt)}</span>
                              </td>
                            ))}
                          </tr>

                          {/* ── Leakage Value ── */}
                          <tr>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-white">Leakage Value</p>
                                  <p className="text-[10px] text-slate-600">Est. revenue lost from failures</p>
                                </div>
                              </div>
                            </td>
                            {scoredItems.map(wf => {
                              const loss    = wf.leakage.totalLoss;
                              const hasLoss = loss > 0;
                              const isLeast = scoredItems.every(x => x.leakage.totalLoss >= loss);
                              return (
                                <td key={wf.id} className={`px-5 py-4 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  <div>
                                    <p className={`text-base font-bold tabular-nums ${hasLoss ? (isLeast ? "text-emerald-400" : "text-rose-400") : "text-slate-600"}`}>
                                      {hasLoss ? fmtCurrency(loss, currency) : "—"}
                                    </p>
                                    {hasLoss && (
                                      <div className="mt-1 space-y-0.5">
                                        {wf.leakage.breakdown.slice(0, 2).map(b => (
                                          <p key={b.eventType} className="text-[10px] text-slate-600">
                                            {b.eventType.replace(/_/g, " ")} × {b.failedCount}
                                            {" → "}
                                            <span className="text-rose-500">{fmtCurrency(b.estimatedLoss, currency)}</span>
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                    {isLeast && hasLoss && (
                                      <span className="text-[10px] text-emerald-400">▲ Least leakage</span>
                                    )}
                                    {!hasLoss && <span className="text-[10px] text-slate-700">No failed events</span>}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Winner row ── */}
                          <tr className="border-t-2 border-indigo-500/20 bg-indigo-500/5">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <Trophy size={14} className="text-amber-400" />
                                <p className="text-xs font-bold text-white">GTM Alpha Winner</p>
                              </div>
                            </td>
                            {scoredItems.map(wf => {
                              const isWinner = wf.id === winnerPlatformId;
                              return (
                                <td key={wf.id} className={`px-5 py-4 ${isWinner ? "bg-indigo-500/5" : ""}`}>
                                  {isWinner ? (
                                    <div className="flex items-center gap-2">
                                      <Trophy size={18} className="text-amber-400" />
                                      <div>
                                        <p className="text-sm font-bold text-white">Best GTM Stack</p>
                                        <p className="text-[10px] text-indigo-400">Alpha Score {wf.alphaScore} / 100</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-600">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Footer — model info */}
                    <div className="px-5 py-3 border-t border-slate-800 flex items-center gap-2 text-[10px] text-slate-700">
                      <Info size={10} />
                      Leakage = failed events × ACV (${acv.toLocaleString()}) × conversion probability per event type.
                      All pillar scores are normalized within the selected set.
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
