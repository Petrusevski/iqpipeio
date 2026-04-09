import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, AlertTriangle, AlertCircle, Info, RefreshCw,
  ChevronDown, ChevronRight, CheckCircle2,
  Code2, Workflow,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Issue {
  severity:    "critical" | "warning" | "info";
  category:    string;
  title:       string;
  detail:      string;
  workflowId?: string;
  metric?:     Record<string, unknown>;
}

interface Suggestion {
  priority:   number;
  impact:     "high" | "medium" | "low";
  action:     string;
  reason:     string;
  n8n_hint?:  string;
  make_hint?: string;
}

interface ReportSummary {
  issueCount:     number;
  criticalIssues: number;
  warningIssues:  number;
  stuckLeadCount: number;
  totalWorkflows: number;
}

interface ReportData {
  generatedAt: string;
  period:      string;
  workflowId:  string | null;
  sequenceId:  string | null;
  summary:     ReportSummary;
  issues:      Issue[];
  suggestions: Suggestion[];
}

type Period = "7d" | "14d" | "30d" | "60d" | "90d";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days", "14d": "14 days", "30d": "30 days", "60d": "60 days", "90d": "90 days"
};

function severityIcon(s: Issue["severity"]) {
  if (s === "critical") return <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />;
  if (s === "warning")  return <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />;
  return <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />;
}

function severityBadge(s: Issue["severity"]) {
  if (s === "critical") return "bg-rose-500/15 text-rose-400 border-rose-500/20";
  if (s === "warning")  return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-blue-500/15 text-blue-400 border-blue-500/20";
}

function impactBadge(impact: Suggestion["impact"]) {
  if (impact === "high")   return "bg-rose-500/10 text-rose-300 border-rose-500/15";
  if (impact === "medium") return "bg-amber-500/10 text-amber-300 border-amber-500/15";
  return "bg-slate-700/50 text-slate-400 border-slate-600/30";
}

function categoryLabel(cat: string) {
  const labels: Record<string, string> = {
    workflow_reliability: "Workflow",
    revenue_leakage:      "Revenue",
    webhook_reliability:  "Webhooks",
    stuck_leads:          "Leads",
    funnel_bottleneck:    "Funnel",
    sequence_performance: "Sequence",
    branch_dead:          "Branch",
  };
  return labels[cat] ?? cat;
}

// ─── Issue card ──────────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${issue.severity === "critical" ? "border-rose-500/20 bg-rose-500/3" : issue.severity === "warning" ? "border-amber-500/20 bg-amber-500/3" : "border-slate-800"}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
      >
        {severityIcon(issue.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${severityBadge(issue.severity)}`}>
              {issue.severity}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-slate-400 bg-slate-800">
              {categoryLabel(issue.category)}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-200">{issue.title}</p>
        </div>
        <ChevronRight size={14} className={`text-slate-500 shrink-0 mt-0.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800/50">
          <p className="text-xs text-slate-400 mb-3">{issue.detail}</p>
          {issue.metric && (
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 font-mono text-[10px] text-slate-500 overflow-x-auto">
              {JSON.stringify(issue.metric, null, 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Suggestion card ─────────────────────────────────────────────────────────

function SuggestionCard({ s, idx }: { s: Suggestion; idx: number }) {
  const [hintTab, setHintTab] = useState<"n8n" | "make">("n8n");
  const hasHints = !!(s.n8n_hint || s.make_hint);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="h-6 w-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[11px] font-bold text-indigo-400 shrink-0">
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${impactBadge(s.impact)}`}>
              {s.impact} impact
            </span>
          </div>
          <p className="text-sm font-semibold text-white mb-1">{s.action}</p>
          <p className="text-xs text-slate-400">{s.reason}</p>
        </div>
      </div>

      {hasHints && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-3">
          {/* Platform tabs */}
          <div className="flex gap-1 mb-3">
            {(["n8n", "make"] as const).filter(p => p === "n8n" ? !!s.n8n_hint : !!s.make_hint).map(p => (
              <button
                key={p}
                onClick={() => setHintTab(p)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  hintTab === p
                    ? "bg-slate-700 text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Workflow size={11} />
                {p === "n8n" ? "n8n hint" : "Make hint"}
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 flex gap-2">
            <Code2 size={12} className="text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-300 leading-relaxed">
              {hintTab === "n8n" ? s.n8n_hint : s.make_hint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImprovementReportPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [period,      setPeriod]      = useState<Period>("30d");
  const [showPeriod,  setShowPeriod]  = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [data,        setData]        = useState<ReportData | null>(null);
  const [activeSection, setActiveSection] = useState<"issues" | "suggestions">("issues");

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
      const days = parseInt(p, 10);
      const r = await fetch(
        `${API_BASE_URL}/api/outreach/improvement-report?workspaceId=${wsId}&days=${days}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      if (r.ok) setData(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (workspaceId) load(workspaceId, period); }, [workspaceId, period, load]);

  const criticals = data?.issues.filter(i => i.severity === "critical") ?? [];
  const warnings  = data?.issues.filter(i => i.severity === "warning")  ?? [];

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-indigo-400" />
              <h1 className="text-lg font-bold text-white">Improvement Report</h1>
            </div>
            <p className="text-xs text-slate-500">
              Ranked issues and actionable fixes for your GTM stack — ready to hand to Claude or implement in n8n / Make.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Period picker */}
            <div className="relative">
              <button
                onClick={() => setShowPeriod(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:border-slate-500 transition-all"
              >
                {PERIOD_LABELS[period]}
                <ChevronDown size={12} className={`transition-transform ${showPeriod ? "rotate-180" : ""}`} />
              </button>
              {showPeriod && (
                <div className="absolute right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden">
                  {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriod(false); }}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors hover:bg-slate-800 ${period === p ? "text-indigo-400 font-semibold" : "text-slate-300"}`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => workspaceId && load(workspaceId, period)}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && !data && (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={20} className="text-slate-600 animate-spin" />
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              {[
                { label: "Total issues",    value: data.summary.issueCount,     color: "text-white" },
                { label: "Critical",        value: data.summary.criticalIssues, color: "text-rose-400" },
                { label: "Warnings",        value: data.summary.warningIssues,  color: "text-amber-400" },
                { label: "Stuck leads",     value: data.summary.stuckLeadCount, color: "text-orange-400" },
                { label: "Workflows",       value: data.summary.totalWorkflows, color: "text-indigo-400" },
              ].map(c => (
                <div key={c.label} className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-center">
                  <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Section tabs */}
            <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-5 w-fit">
              {[
                { key: "issues" as const,      label: `Issues (${data.issues.length})`,           icon: AlertTriangle },
                { key: "suggestions" as const, label: `Suggestions (${data.suggestions.length})`, icon: Sparkles },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveSection(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeSection === t.key ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <t.icon size={12} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Issues section */}
            {activeSection === "issues" && (
              <div className="space-y-3">
                {data.issues.length === 0 && (
                  <div className="flex flex-col items-center py-16 text-center">
                    <CheckCircle2 size={32} className="text-emerald-500/50 mb-3" />
                    <p className="text-sm font-medium text-slate-300">No issues found</p>
                    <p className="text-xs text-slate-600 mt-1">Your GTM stack looks healthy for the selected period.</p>
                  </div>
                )}
                {criticals.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70 mb-2 flex items-center gap-1.5">
                      <AlertCircle size={10} /> Critical ({criticals.length})
                    </p>
                    <div className="space-y-2">
                      {criticals.map((issue, i) => <IssueCard key={i} issue={issue} />)}
                    </div>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className={criticals.length > 0 ? "mt-5" : ""}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={10} /> Warnings ({warnings.length})
                    </p>
                    <div className="space-y-2">
                      {warnings.map((issue, i) => <IssueCard key={i} issue={issue} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Suggestions section */}
            {activeSection === "suggestions" && (
              <div className="space-y-3">
                {data.suggestions.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <CheckCircle2 size={32} className="text-emerald-500/50 mb-3" />
                    <p className="text-sm font-medium text-slate-300">No suggestions</p>
                    <p className="text-xs text-slate-600 mt-1">Nothing to improve right now.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 mb-3">
                      Each suggestion includes step-by-step hints for n8n and Make.com — copy and paste directly into your workflow builder.
                    </p>
                    {data.suggestions.map((s, i) => <SuggestionCard key={i} s={s} idx={i} />)}
                  </>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
              <p className="text-[10px] text-slate-600">
                Generated {new Date(data.generatedAt).toLocaleString()} · {data.period} window
              </p>
              <p className="text-[10px] text-slate-600">
                Ask Claude: <span className="text-indigo-400 font-mono">"get_improvement_report"</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
