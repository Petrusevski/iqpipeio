import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  TrendingUp,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  GitBranch,
  Layers,
  Bot,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkflowRow {
  workflowId: string;
  totalEvents: number;
  done: number;
  pending: number;
  failed: number;
  successRate: number;
  outcomeEvents: number;
  processEvents: number;
  sourceApps: string[];
  lastEventAt: string | null;
  lastEventType: string | null;
  recentErrors: {
    id: string;
    errorCode: string;
    errorDetail: string;
    retryCount: number;
    createdAt: string;
  }[];
}

interface WorkflowMeta {
  id: string;
  n8nId: string;
  name: string;
  active: boolean;
  appsUsed: string[];
  nodeCount: number;
  triggerType: string;
  execSyncEnabled: boolean;
}

interface ScenarioMeta {
  id: string;
  makeId: string;
  name: string;
  active: boolean;
  appsUsed: string[];
  moduleCount: number;
  triggerType: string;
  execSyncEnabled: boolean;
}

interface ComparableWorkflow {
  id: string;
  platform: "n8n" | "make";
  name: string;
  active: boolean;
  appsUsed: string[];
  nodeCount: number;
  triggerType: string;
  execSyncEnabled: boolean;
  totalEvents: number;
  successRate: number;
  outcomeEvents: number;
  processEvents: number;
  failed: number;
  sourceApps: string[];
  lastEventAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const token = () => localStorage.getItem("iqpipe_token") ?? "";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All time",
};

function gradeScore(score: number): { grade: string; color: string; bg: string; border: string } {
  if (score >= 85) return { grade: "A", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" };
  if (score >= 70) return { grade: "B", color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30"  };
  if (score >= 55) return { grade: "C", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30"   };
  if (score >= 40) return { grade: "D", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30"  };
  return            { grade: "F", color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30"    };
}

function computeScores(workflows: ComparableWorkflow[]): Record<string, number> {
  if (workflows.length === 0) return {};

  const maxTotalEvents = Math.max(...workflows.map((w) => w.totalEvents), 1);
  const maxApps        = Math.max(...workflows.map((w) => w.appsUsed.length), 1);

  const scores: Record<string, number> = {};
  for (const w of workflows) {
    const outcomeRate = w.outcomeEvents / Math.max(1, w.totalEvents);
    const errorRate   = w.failed       / Math.max(1, w.totalEvents);

    const maxOutcomeRate = Math.max(
      ...workflows.map((x) => x.outcomeEvents / Math.max(1, x.totalEvents)),
      0.001,
    );
    const maxErrorRate = Math.max(
      ...workflows.map((x) => x.failed / Math.max(1, x.totalEvents)),
      0.001,
    );

    const score =
      (w.successRate / 100)                        * 0.30 * 100 +
      (outcomeRate / maxOutcomeRate)               * 0.25 * 100 +
      (w.totalEvents / maxTotalEvents)             * 0.15 * 100 +
      (1 - errorRate / maxErrorRate)               * 0.20 * 100 +
      (w.appsUsed.length / maxApps)                * 0.10 * 100;

    scores[w.id] = Math.round(Math.min(100, Math.max(0, score)));
  }
  return scores;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: "n8n" | "make" }) {
  return platform === "n8n" ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
      <Bot size={9} /> n8n
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
      <Zap size={9} /> Make
    </span>
  );
}

function GradeBadge({ score }: { score: number }) {
  const { grade, color, bg, border } = gradeScore(score);
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${color} ${bg} border ${border}`}>
      {grade}
    </span>
  );
}

function ScoreBar({ value, max = 100, colorClass = "bg-indigo-500" }: { value: number; max?: number; colorClass?: string }) {
  const pct = Math.round((value / Math.max(1, max)) * 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkflowComparePage() {
  const navigate = useNavigate();

  const [period, setPeriod]                 = useState<Period>("30d");
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [activePlatform, setActivePlatform] = useState<"n8n" | "make">("n8n");

  const [wsId, setWsId]                         = useState<string | null>(null);
  const [loadingWs, setLoadingWs]               = useState(true);
  const [loadingHealth, setLoadingHealth]       = useState(false);
  const [loadingN8n, setLoadingN8n]             = useState(false);
  const [loadingMake, setLoadingMake]           = useState(false);

  const [n8nWorkflows,  setN8nWorkflows]   = useState<WorkflowMeta[]>([]);
  const [makeScenarios, setMakeScenarios]  = useState<ScenarioMeta[]>([]);
  const [healthRows,    setHealthRows]     = useState<WorkflowRow[]>([]);

  const [n8nError,  setN8nError]  = useState(false);
  const [makeError, setMakeError] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Fetch workspace ──
  useEffect(() => {
    setLoadingWs(true);
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.id) setWsId(d.id); })
      .catch(() => {})
      .finally(() => setLoadingWs(false));
  }, []);

  // ── Fetch health data ──
  const fetchHealth = useCallback(() => {
    if (!wsId) return;
    setLoadingHealth(true);
    fetch(`${API_BASE_URL}/api/automation-health?workspaceId=${wsId}&period=${period}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows: WorkflowRow[] = [
          ...(d?.n8n?.workflows ?? []),
          ...(d?.make?.workflows ?? []),
        ];
        setHealthRows(rows);
      })
      .catch(() => {})
      .finally(() => setLoadingHealth(false));
  }, [wsId, period]);

  // ── Fetch n8n workflows ──
  const fetchN8n = useCallback(() => {
    if (!wsId) return;
    setLoadingN8n(true);
    setN8nError(false);
    fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) setN8nWorkflows(d);
        else setN8nError(true);
      })
      .catch(() => setN8nError(true))
      .finally(() => setLoadingN8n(false));
  }, [wsId]);

  // ── Fetch Make scenarios ──
  const fetchMake = useCallback(() => {
    if (!wsId) return;
    setLoadingMake(true);
    setMakeError(false);
    fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) setMakeScenarios(d);
        else setMakeError(true);
      })
      .catch(() => setMakeError(true))
      .finally(() => setLoadingMake(false));
  }, [wsId]);

  useEffect(() => {
    if (wsId) {
      fetchHealth();
      fetchN8n();
      fetchMake();
    }
  }, [wsId, fetchHealth, fetchN8n, fetchMake]);

  // ── Build comparable list ──
  const allComparables: ComparableWorkflow[] = [
    ...n8nWorkflows.map((m): ComparableWorkflow => {
      const row = healthRows.find((r) => r.workflowId === m.n8nId);
      return {
        id:              m.id,
        platform:        "n8n",
        name:            m.name,
        active:          m.active,
        appsUsed:        m.appsUsed ?? [],
        nodeCount:       m.nodeCount,
        triggerType:     m.triggerType,
        execSyncEnabled: m.execSyncEnabled,
        totalEvents:     row?.totalEvents   ?? 0,
        successRate:     row?.successRate   ?? 0,
        outcomeEvents:   row?.outcomeEvents ?? 0,
        processEvents:   row?.processEvents ?? 0,
        failed:          row?.failed        ?? 0,
        sourceApps:      row?.sourceApps    ?? [],
        lastEventAt:     row?.lastEventAt   ?? null,
      };
    }),
    ...makeScenarios.map((s): ComparableWorkflow => ({
      id:              s.id,
      platform:        "make",
      name:            s.name,
      active:          s.active,
      appsUsed:        s.appsUsed ?? [],
      nodeCount:       s.moduleCount,
      triggerType:     s.triggerType,
      execSyncEnabled: s.execSyncEnabled,
      totalEvents:     0,
      successRate:     0,
      outcomeEvents:   0,
      processEvents:   0,
      failed:          0,
      sourceApps:      [],
      lastEventAt:     null,
    })),
  ];

  const platformItems = allComparables.filter((w) => w.platform === activePlatform);

  const selectedItems = allComparables.filter((w) => selected.has(w.id));
  const scores        = computeScores(selectedItems);

  const winnerId = selectedItems.length >= 2
    ? selectedItems.reduce((best, w) => (scores[w.id] > scores[best.id] ? w : best), selectedItems[0]).id
    : null;

  // ── Toggle selection ──
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    const ids = platformItems.slice(0, 4).map((w) => w.id);
    setSelected(new Set(ids));
  }

  function clearAll() {
    setSelected(new Set());
  }

  // ── Loading / no-workspace state ──
  const isLoading = loadingWs || loadingHealth || loadingN8n || loadingMake;
  const noConnection = !loadingWs && !loadingN8n && !loadingMake && n8nWorkflows.length === 0 && makeScenarios.length === 0;

  // ── Metric helpers for table ──
  function bestId(getter: (w: ComparableWorkflow) => number, higherIsBetter = true): string | null {
    if (selectedItems.length < 2) return null;
    return selectedItems.reduce((best, w) => {
      const bv = getter(best);
      const wv = getter(w);
      return higherIsBetter ? (wv > bv ? w : best) : (wv < bv ? w : best);
    }, selectedItems[0]).id;
  }
  function worstId(getter: (w: ComparableWorkflow) => number, higherIsBetter = true): string | null {
    if (selectedItems.length < 2) return null;
    return selectedItems.reduce((worst, w) => {
      const bv = getter(worst);
      const wv = getter(w);
      return higherIsBetter ? (wv < bv ? w : worst) : (wv > bv ? w : worst);
    }, selectedItems[0]).id;
  }

  function cellClass(id: string, bId: string | null, wId: string | null): string {
    if (id === bId) return "text-emerald-400 font-semibold";
    if (id === wId) return "text-rose-400";
    return "text-slate-300";
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Workflow Comparison</h1>
            <p className="text-sm text-slate-500 mt-1">Grade and compare GTM workflows head-to-head</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Period dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodMenu((p) => !p)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
              >
                <TrendingUp size={13} className="text-indigo-400" />
                {PERIOD_LABELS[period]}
                <ChevronDown size={13} className="text-slate-500" />
              </button>
              {showPeriodMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 rounded-lg bg-slate-900 border border-slate-800 shadow-xl z-20 py-1 overflow-hidden">
                  {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        period === p
                          ? "bg-indigo-500/10 text-indigo-400"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={() => { fetchHealth(); fetchN8n(); fetchMake(); }}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ── No connection state ── */}
        {!isLoading && noConnection && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
              <GitBranch size={24} className="text-slate-500" />
            </div>
            <div>
              <p className="text-white font-semibold">No workflows connected</p>
              <p className="text-sm text-slate-500 mt-1">Connect n8n or Make.com to start comparing workflows.</p>
            </div>
            <button
              onClick={() => navigate("/automations")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              <Zap size={14} />
              Go to Automations
            </button>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-900/60 animate-pulse border border-slate-800" />
            ))}
          </div>
        )}

        {!isLoading && !noConnection && (
          <>
            {/* ── Platform tabs + selector ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
                  {(["n8n", "make"] as const).map((pl) => (
                    <button
                      key={pl}
                      onClick={() => setActivePlatform(pl)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        activePlatform === pl
                          ? "bg-slate-800 text-white"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {pl === "n8n" ? "n8n" : "Make.com"}
                      <span className="ml-1.5 text-[10px] text-slate-600">
                        ({pl === "n8n" ? n8nWorkflows.length : makeScenarios.length})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Shortcuts */}
                <div className="flex gap-2">
                  {selected.size > 0 && (
                    <button
                      onClick={clearAll}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      Clear ({selected.size})
                    </button>
                  )}
                  {platformItems.length >= 2 && (
                    <button
                      onClick={selectAll}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 transition-colors"
                    >
                      Compare All
                    </button>
                  )}
                </div>
              </div>

              {/* Connection error notice */}
              {activePlatform === "n8n" && n8nError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-400 text-sm">
                  <AlertTriangle size={13} />
                  Could not load n8n workflows. Check your connection in Automations.
                </div>
              )}
              {activePlatform === "make" && makeError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-400 text-sm">
                  <AlertTriangle size={13} />
                  Could not load Make.com scenarios. Check your connection in Automations.
                </div>
              )}

              {/* Selection limit hint */}
              {selected.size >= 4 && (
                <div className="text-xs text-slate-500 px-1">
                  Maximum 4 workflows selected. Deselect one to add another.
                </div>
              )}

              {/* Workflow cards */}
              {platformItems.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center">
                  <p className="text-slate-500 text-sm">
                    No {activePlatform === "n8n" ? "n8n workflows" : "Make.com scenarios"} found.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {platformItems.map((w) => {
                    const isSelected = selected.has(w.id);
                    const disabled   = !isSelected && selected.size >= 4;
                    return (
                      <button
                        key={w.id}
                        onClick={() => !disabled && toggleSelect(w.id)}
                        disabled={disabled}
                        className={`relative text-left rounded-xl border p-3.5 transition-all duration-150 ${
                          isSelected
                            ? "border-indigo-500/50 bg-indigo-500/8 ring-1 ring-indigo-500/20"
                            : disabled
                            ? "border-slate-800 bg-slate-900/20 opacity-40 cursor-not-allowed"
                            : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                            <CheckCircle2 size={10} className="text-white" />
                          </div>
                        )}

                        <div className="flex items-start gap-2 mb-2">
                          <PlatformBadge platform={w.platform} />
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            w.active
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : "text-slate-500 bg-slate-800/50 border-slate-700"
                          }`}>
                            {w.active ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <p className="text-sm font-medium text-white truncate pr-5">{w.name}</p>

                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Layers size={10} />
                            {w.nodeCount} {w.platform === "n8n" ? "nodes" : "modules"}
                          </span>
                          {w.triggerType && (
                            <span className="flex items-center gap-1">
                              <Zap size={10} />
                              {w.triggerType}
                            </span>
                          )}
                        </div>

                        {w.appsUsed.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {w.appsUsed.slice(0, 3).map((app) => (
                              <span key={app} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                {app}
                              </span>
                            ))}
                            {w.appsUsed.length > 3 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                                +{w.appsUsed.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Comparison Matrix ── */}
            {selectedItems.length >= 2 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
                  <Activity size={15} className="text-indigo-400" />
                  <h2 className="text-sm font-semibold text-white">GTM Performance Matrix</h2>
                  <span className="ml-1 text-[11px] text-slate-600">
                    {selectedItems.length} workflows
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm border-collapse">

                    {/* Column headers */}
                    <thead>
                      <tr>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-40 bg-slate-900/40 border-b border-slate-800">
                          Metric
                        </th>
                        {selectedItems.map((w) => {
                          const isWinner = w.id === winnerId;
                          return (
                            <th
                              key={w.id}
                              className={`px-4 py-3 text-center border-b border-slate-800 min-w-[150px] ${
                                isWinner
                                  ? "border-l border-r border-indigo-500/40 bg-indigo-500/5"
                                  : "bg-slate-900/40"
                              }`}
                            >
                              <div className="flex flex-col items-center gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <PlatformBadge platform={w.platform} />
                                  {isWinner && (
                                    <span className="text-[10px] font-semibold text-indigo-400">
                                      ★ Best
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-semibold text-white truncate max-w-[130px]">{w.name}</span>
                                <GradeBadge score={scores[w.id] ?? 0} />
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {/* Row 1: GTM Score */}
                      {(() => {
                        const bId = bestId((w) => scores[w.id] ?? 0);
                        const wId = worstId((w) => scores[w.id] ?? 0);
                        return (
                          <tr className="border-b border-slate-800/50">
                            <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                              <div className="flex items-center gap-2">
                                <Trophy size={13} className="text-amber-400 shrink-0" />
                                GTM Score
                              </div>
                            </td>
                            {selectedItems.map((w) => {
                              const sc = scores[w.id] ?? 0;
                              const { grade, color } = gradeScore(sc);
                              return (
                                <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                                  <div className={`flex items-center justify-center gap-1.5 ${cellClass(w.id, bId, wId)}`}>
                                    <span className="text-base font-bold">{sc}</span>
                                    <span className={`text-xs font-bold ${color}`}>{grade}</span>
                                  </div>
                                  <div className="mt-1.5 px-3">
                                    <ScoreBar value={sc} colorClass={sc >= 85 ? "bg-emerald-500" : sc >= 70 ? "bg-indigo-500" : sc >= 55 ? "bg-amber-500" : sc >= 40 ? "bg-orange-500" : "bg-rose-500"} />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })()}

                      {/* Row 2: Total Events */}
                      {(() => {
                        const bId = bestId((w) => w.totalEvents);
                        const wId = worstId((w) => w.totalEvents);
                        return (
                          <tr className="bg-slate-900/30 border-b border-slate-800/50">
                            <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                              <div className="flex items-center gap-2">
                                <Activity size={13} className="text-slate-500 shrink-0" />
                                Total Events
                              </div>
                            </td>
                            {selectedItems.map((w) => (
                              <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                                <span className={cellClass(w.id, bId, wId)}>
                                  {w.totalEvents.toLocaleString()}
                                </span>
                              </td>
                            ))}
                          </tr>
                        );
                      })()}

                      {/* Row 3: Success Rate */}
                      {(() => {
                        const bId = bestId((w) => w.successRate);
                        const wId = worstId((w) => w.successRate);
                        return (
                          <tr className="border-b border-slate-800/50">
                            <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                Success Rate
                              </div>
                            </td>
                            {selectedItems.map((w) => (
                              <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                                <span className={cellClass(w.id, bId, wId)}>
                                  {w.successRate.toFixed(1)}%
                                </span>
                                <div className="mt-1.5 px-3">
                                  <ScoreBar
                                    value={w.successRate}
                                    max={100}
                                    colorClass={w.id === bId ? "bg-emerald-500" : w.id === wId ? "bg-rose-500" : "bg-slate-600"}
                                  />
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })()}

                      {/* Row 4: Outcome Events */}
                      {(() => {
                        const bId = bestId((w) => w.outcomeEvents);
                        const wId = worstId((w) => w.outcomeEvents);
                        return (
                          <tr className="bg-slate-900/30 border-b border-slate-800/50">
                            <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                              <div className="flex items-center gap-2">
                                <TrendingUp size={13} className="text-indigo-400 shrink-0" />
                                Outcome Events
                              </div>
                            </td>
                            {selectedItems.map((w) => (
                              <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                                <div className={cellClass(w.id, bId, wId)}>
                                  {w.outcomeEvents.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-slate-600 mt-0.5">
                                  {w.totalEvents > 0
                                    ? `${((w.outcomeEvents / w.totalEvents) * 100).toFixed(1)}% of total`
                                    : "—"}
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })()}

                      {/* Row 5: Error Rate */}
                      {(() => {
                        const getRate = (w: ComparableWorkflow) => w.failed / Math.max(1, w.totalEvents) * 100;
                        const bId = bestId(getRate, false); // lower is better
                        const wId = worstId(getRate, false);
                        return (
                          <tr className="border-b border-slate-800/50">
                            <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                              <div className="flex items-center gap-2">
                                <XCircle size={13} className="text-rose-500 shrink-0" />
                                Error Rate
                              </div>
                            </td>
                            {selectedItems.map((w) => {
                              const rate = getRate(w);
                              return (
                                <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                                  <span className={
                                    w.id === bId ? "text-emerald-400 font-semibold" :
                                    w.id === wId ? "text-rose-400" :
                                    "text-slate-300"
                                  }>
                                    {rate.toFixed(1)}%
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })()}

                      {/* Row 6: App Coverage */}
                      <tr className="bg-slate-900/30 border-b border-slate-800/50">
                        <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                          <div className="flex items-center gap-2">
                            <Layers size={13} className="text-slate-500 shrink-0" />
                            App Coverage
                          </div>
                        </td>
                        {selectedItems.map((w) => (
                          <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                            {w.appsUsed.length === 0 ? (
                              <span className="text-slate-600 text-xs">—</span>
                            ) : (
                              <div className="flex flex-wrap justify-center gap-1">
                                {w.appsUsed.slice(0, 4).map((app) => (
                                  <span key={app} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    {app}
                                  </span>
                                ))}
                                {w.appsUsed.length > 4 && (
                                  <span className="text-[10px] text-slate-500">+{w.appsUsed.length - 4}</span>
                                )}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>

                      {/* Row 7: Trigger Type */}
                      <tr className="border-b border-slate-800/50">
                        <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                          <div className="flex items-center gap-2">
                            <Zap size={13} className="text-slate-500 shrink-0" />
                            Trigger Type
                          </div>
                        </td>
                        {selectedItems.map((w) => (
                          <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                            <div className="flex items-center justify-center gap-1.5 text-slate-400">
                              <Zap size={11} className="text-indigo-400 shrink-0" />
                              <span className="text-xs">{w.triggerType || "—"}</span>
                            </div>
                          </td>
                        ))}
                      </tr>

                      {/* Row 8: Last Active */}
                      <tr className="bg-slate-900/30 border-b border-slate-800/50">
                        <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                          <div className="flex items-center gap-2">
                            <Activity size={13} className="text-slate-500 shrink-0" />
                            Last Active
                          </div>
                        </td>
                        {selectedItems.map((w) => (
                          <td key={w.id} className={`px-4 py-3 text-center text-xs text-slate-400 ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                            {relativeTime(w.lastEventAt)}
                          </td>
                        ))}
                      </tr>

                      {/* Row 9: Exec Capture */}
                      <tr className="border-b border-slate-800/50">
                        <td className="px-4 py-3 text-slate-500 text-xs font-medium bg-slate-900/20">
                          <div className="flex items-center gap-2">
                            <GitBranch size={13} className="text-slate-500 shrink-0" />
                            Exec Capture
                          </div>
                        </td>
                        {selectedItems.map((w) => (
                          <td key={w.id} className={`px-4 py-3 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                              w.execSyncEnabled
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : "text-slate-500 bg-slate-800/50 border-slate-700"
                            }`}>
                              {w.execSyncEnabled ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                              {w.execSyncEnabled ? "On" : "Off"}
                            </span>
                          </td>
                        ))}
                      </tr>

                      {/* Winner row */}
                      <tr className="bg-slate-900/50">
                        <td className="px-4 py-4 text-slate-500 text-xs font-medium bg-slate-900/20">
                          <div className="flex items-center gap-2">
                            <Trophy size={13} className="text-amber-400 shrink-0" />
                            Winner
                          </div>
                        </td>
                        {selectedItems.map((w) => (
                          <td key={w.id} className={`px-4 py-4 text-center ${w.id === winnerId ? "bg-indigo-500/5" : ""}`}>
                            {w.id === winnerId ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xl">🏆</span>
                                <span className="text-xs font-semibold text-indigo-400">Best GTM Stack</span>
                              </div>
                            ) : (
                              <span className="text-slate-700 text-xs">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* ── Empty state: < 2 selected ── */
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <Bot size={24} className="text-slate-600" />
                </div>
                <p className="text-slate-400 font-medium">Select 2 or more workflows to compare</p>
                <p className="text-sm text-slate-600 max-w-sm mx-auto">
                  Pick workflows from the selector above to see the GTM performance matrix and grade comparison.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
