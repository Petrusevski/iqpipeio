import { useState, useEffect, useCallback } from "react";
import { GitMerge, RefreshCw, ChevronDown, TrendingDown } from "lucide-react";
import { API_BASE_URL } from "../../config";
import SeedBanner from "../components/SeedBanner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  convRate: number;   // % from previous stage
  dropOff: number;    // absolute leads lost vs previous stage
  pctOfTop: number;   // % of top-of-funnel (bar width)
  tools: { tool: string; label: string; count: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function convColor(rate: number): string {
  if (rate >= 70) return "text-emerald-400";
  if (rate >= 40) return "text-amber-400";
  return "text-rose-400";
}

function barColor(rate: number): string {
  if (rate >= 70) return "bg-emerald-500/30 border-emerald-500/20";
  if (rate >= 40) return "bg-amber-500/30 border-amber-500/20";
  return "bg-rose-500/20 border-rose-500/20";
}

const PERIOD_LABELS: Record<string, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All time",
};

// ── Stage row ─────────────────────────────────────────────────────────────────

function StageRow({
  stage,
  isFirst,
  maxCount,
}: {
  stage: FunnelStage;
  isFirst: boolean;
  maxCount: number;
}) {
  const [open, setOpen] = useState(false);
  const barWidth = maxCount > 0 ? Math.max(4, Math.round((stage.count / maxCount) * 100)) : 4;

  return (
    <div>
      {/* Connector arrow between stages */}
      {!isFirst && (
        <div className="flex items-center gap-4 py-1 pl-4">
          <div className="flex flex-col items-center w-8">
            <ChevronDown size={14} className="text-slate-700" />
          </div>
          <div className={`text-xs font-semibold tabular-nums ${convColor(stage.convRate)}`}>
            {stage.convRate}% converted
          </div>
          {stage.dropOff > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <TrendingDown size={11} />
              {stage.dropOff.toLocaleString()} dropped
            </div>
          )}
        </div>
      )}

      {/* Stage card */}
      <div
        className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden cursor-pointer hover:border-slate-700 transition-colors"
        onClick={() => stage.tools.length > 0 && setOpen((o) => !o)}
      >
        <div className="px-4 py-3">
          {/* Bar — full width */}
          <div className="h-7 rounded-lg bg-slate-800/60 overflow-hidden relative mb-3">
            <div
              className={`h-full rounded-lg border transition-all duration-500 ${isFirst ? "bg-indigo-500/30 border-indigo-500/20" : barColor(stage.convRate)}`}
              style={{ width: `${barWidth}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2.5 text-[11px] font-mono text-slate-300">
              {stage.pctOfTop}%
            </span>
          </div>

          {/* Label + tools left · count right */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-white">{stage.label}</span>
              {stage.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {stage.tools.slice(0, 3).map((t) => (
                    <span
                      key={t.tool}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400"
                    >
                      {t.label}
                    </span>
                  ))}
                  {stage.tools.length > 3 && (
                    <span className="text-[10px] text-slate-600">+{stage.tools.length - 3}</span>
                  )}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl font-bold text-white tabular-nums">
                {stage.count.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 ml-1">leads</span>
            </div>
          </div>
        </div>

        {/* Expanded tool breakdown */}
        {open && stage.tools.length > 0 && (
          <div className="border-t border-slate-800 px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            {stage.tools.map((t) => (
              <div key={t.tool} className="bg-slate-800/50 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-slate-300">{t.label}</p>
                <p className="text-lg font-bold text-white tabular-nums mt-0.5">
                  {t.count.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-600">events</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const [stages, setStages]       = useState<FunnelStage[]>([]);
  const [period, setPeriod]       = useState("30d");
  const [loading, setLoading]     = useState(true);
  const [workspaceId, setWorkspaceId] = useState("");

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (wsId: string, p: string) => {
    if (!wsId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/signal-health/funnel?workspaceId=${wsId}&period=${p}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      if (r.ok) {
        const d = await r.json();
        setStages(d.stages);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspaceId) load(workspaceId, period);
  }, [workspaceId, period, load]);

  const maxCount = stages[0]?.count ?? 1;

  // Summary stats
  const sourced = stages[0]?.count ?? 0;
  const won     = stages.find((s) => s.key === "won")?.count ?? 0;
  const replied = stages.find((s) => s.key === "replied")?.count ?? 0;
  const meeting = stages.find((s) => s.key === "meeting")?.count ?? 0;
  const overallConv = sourced > 0 ? ((won / sourced) * 100).toFixed(2) : "0.00";

  // Find the biggest drop (worst bottleneck)
  let bottleneck: FunnelStage | null = null;
  for (const s of stages.slice(1)) {
    if (!bottleneck || s.dropOff > (bottleneck.dropOff ?? 0)) bottleneck = s;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-6 space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GitMerge size={18} className="text-indigo-400 shrink-0" />
          <div>
            <h1 className="text-base font-bold text-white leading-none">Pipeline Funnel</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Cross-tool conversion from first touch to closed deal · click any stage to see which tools drove it
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Period selector */}
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {Object.entries(PERIOD_LABELS).map(([key]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  period === key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {key === "all" ? "All" : key}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(workspaceId, period)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && stages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Sourced",          value: sourced.toLocaleString(),  sub: PERIOD_LABELS[period] },
            { label: "Replied",          value: replied.toLocaleString(),  sub: sourced > 0 ? `${Math.round((replied/sourced)*100)}% of sourced` : "—" },
            { label: "Meetings",         value: meeting.toLocaleString(),  sub: replied > 0 ? `${Math.round((meeting/replied)*100)}% of replies` : "—" },
            { label: "Source → Won",     value: `${overallConv}%`,         sub: `${won} deals closed` },
          ].map((card) => (
            <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
              <p className="text-xs font-medium text-slate-400 mt-1">{card.label}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bottleneck callout */}
      {!loading && bottleneck && bottleneck.dropOff > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/6 border border-rose-500/20">
          <TrendingDown size={15} className="text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-300">Biggest bottleneck: {bottleneck.label}</p>
            <p className="text-xs text-rose-400/70 mt-0.5">
              {bottleneck.dropOff.toLocaleString()} leads ({100 - bottleneck.convRate}%) dropped between the previous stage and {bottleneck.label.toLowerCase()}.
              {bottleneck.key === "engaged" && " Check if emails are landing in spam or sequences are hitting bounces."}
              {bottleneck.key === "replied" && " Low reply rate — review copy, ICP fit, or sending volume vs. list quality."}
              {bottleneck.key === "meeting" && " Replies aren't converting to meetings — check your CTA and response handling."}
              {bottleneck.key === "contacted" && " Contacts aren't entering sequences — check your enrollment triggers or sequence setup."}
            </p>
          </div>
        </div>
      )}

      {/* Funnel */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Computing funnel…
        </div>
      ) : stages.every((s) => s.count === 0) ? (
          <SeedBanner onSeeded={() => load(workspaceId, period)} />
      ) : (
        <div className="space-y-0">
          {stages.map((stage, i) => (
            <StageRow
              key={stage.key}
              stage={stage}
              isFirst={i === 0}
              maxCount={maxCount}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!loading && stages.length > 0 && (
        <p className="text-[11px] text-slate-700 pt-2">
          Each stage counts unique contacts — a contact touching multiple tools in the same stage is counted once.
          Click any stage row to see which tools drove it.
        </p>
      )}
    </div>
  );
}
