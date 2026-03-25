import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitBranch, RefreshCw, Copy, Check, ExternalLink,
  Zap, AlertCircle, Clock, Layers, Activity,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface N8nWorkflow {
  id: string;           // DB cuid — unique identifier
  n8nId: string;        // n8n's own workflow ID
  name: string;
  active: boolean;
  appsUsed: string[];
  nodeCount: number;
  triggerType: string;
  description: string | null;
  lastUpdatedAt: string | null;
  syncedAt: string;
  eventFilter: { enabled: boolean; apps: string[]; eventTypes: string[] } | null;
  execSyncEnabled: boolean;
}

interface MakeScenario {
  id: string;           // DB cuid — unique identifier
  makeId: string;       // Make's own scenario ID
  name: string;
  active: boolean;
  appsUsed: string[];
  moduleCount: number;
  triggerType: string;
  lastUpdatedAt: string | null;
  syncedAt: string;
  eventFilter: { enabled: boolean; apps: string[]; eventTypes: string[]; defaultEventType?: string } | null;
  execSyncEnabled: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function triggerLabel(t: string) {
  if (t === "webhook")  return "Webhook";
  if (t === "schedule") return "Schedule";
  if (t === "manual")   return "Manual";
  return t;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="ml-1 text-slate-600 hover:text-slate-300 transition-colors"
      title="Copy ID"
    >
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  );
}

// ─── Platform badge ───────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: "n8n" | "make" }) {
  return platform === "n8n"
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">n8n</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">Make.com</span>;
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return active
    ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Active</span>
    : <span className="flex items-center gap-1 text-[10px] text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />Inactive</span>;
}

// ─── Automation card ──────────────────────────────────────────────────────────

function AutomationCard({
  id, platformId, name, active, platform,
  appsUsed, nodeCount, triggerType, lastUpdatedAt, syncedAt, execSyncEnabled,
}: {
  id: string;
  platformId: string;
  name: string;
  active: boolean;
  platform: "n8n" | "make";
  appsUsed: string[];
  nodeCount: number;
  triggerType: string;
  lastUpdatedAt: string | null;
  syncedAt: string;
  execSyncEnabled: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors flex flex-col gap-4">

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <GitBranch size={16} className="text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <div className="flex items-center gap-2 mt-1">
              <PlatformBadge platform={platform} />
              <StatusDot active={active} />
            </div>
          </div>
        </div>
      </div>

      {/* Unique ID */}
      <div className="bg-slate-950 rounded-xl border border-slate-800/60 px-3 py-2">
        <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1">Automation ID</p>
        <div className="flex items-center gap-1">
          <code className="text-xs font-mono text-indigo-300 truncate">{id}</code>
          <CopyButton text={id} />
        </div>
        <div className="flex items-center gap-1 mt-1">
          <code className="text-[10px] font-mono text-slate-600 truncate">{platform === "n8n" ? `n8n:${platformId}` : `make:${platformId}`}</code>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-950 rounded-xl border border-slate-800/60 px-3 py-2 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Nodes</p>
          <p className="text-sm font-bold text-white">{nodeCount}</p>
        </div>
        <div className="bg-slate-950 rounded-xl border border-slate-800/60 px-3 py-2 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Trigger</p>
          <p className="text-[11px] font-semibold text-slate-300">{triggerLabel(triggerType)}</p>
        </div>
        <div className="bg-slate-950 rounded-xl border border-slate-800/60 px-3 py-2 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Events</p>
          <p className="text-[11px] font-semibold text-emerald-400">{execSyncEnabled ? "On" : "Off"}</p>
        </div>
      </div>

      {/* Apps used */}
      {appsUsed.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">Apps</p>
          <div className="flex flex-wrap gap-1.5">
            {appsUsed.slice(0, 6).map((app) => (
              <span key={app} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                {app}
              </span>
            ))}
            {appsUsed.length > 6 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-600">
                +{appsUsed.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/50">
        <span className="text-[10px] text-slate-600 flex items-center gap-1">
          <Clock size={10} />
          Updated {fmtDate(lastUpdatedAt ?? syncedAt)}
        </span>
        <span className="text-[10px] text-slate-700">
          Synced {fmtDate(syncedAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyWorkflowPage() {
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState("");
  const [n8nWorkflows,  setN8nWorkflows]  = useState<N8nWorkflow[]>([]);
  const [makeScenarios, setMakeScenarios] = useState<MakeScenario[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<"all" | "n8n" | "make">("all");
  const [refreshing, setRefreshing] = useState(false);

  // ── Resolve workspace ──────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  // ── Fetch automations ──────────────────────────────────────────────────────
  const load = useCallback(async (wsId: string) => {
    if (!wsId) return;
    const token = localStorage.getItem("iqpipe_token") ?? "";
    setError(null);
    try {
      const [n8nRes, makeRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setN8nWorkflows(n8nRes.ok  ? await n8nRes.json()  : []);
      setMakeScenarios(makeRes.ok ? await makeRes.json() : []);
    } catch {
      setError("Failed to load automations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (workspaceId) load(workspaceId); }, [workspaceId, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(workspaceId);
    setRefreshing(false);
  };

  // ── Combine + filter ───────────────────────────────────────────────────────
  const total = n8nWorkflows.length + makeScenarios.length;

  const n8nCards = n8nWorkflows.map(wf => (
    <AutomationCard
      key={wf.id}
      id={wf.id}
      platformId={wf.n8nId}
      name={wf.name}
      active={wf.active}
      platform="n8n"
      appsUsed={wf.appsUsed}
      nodeCount={wf.nodeCount}
      triggerType={wf.triggerType}
      lastUpdatedAt={wf.lastUpdatedAt}
      syncedAt={wf.syncedAt}
      execSyncEnabled={wf.execSyncEnabled}
    />
  ));

  const makeCards = makeScenarios.map(sc => (
    <AutomationCard
      key={sc.id}
      id={sc.id}
      platformId={sc.makeId}
      name={sc.name}
      active={sc.active}
      platform="make"
      appsUsed={sc.appsUsed}
      nodeCount={sc.moduleCount}
      triggerType={sc.triggerType}
      lastUpdatedAt={sc.lastUpdatedAt}
      syncedAt={sc.syncedAt}
      execSyncEnabled={sc.execSyncEnabled}
    />
  ));

  const visibleCards =
    filter === "n8n"  ? n8nCards  :
    filter === "make" ? makeCards :
    [...n8nCards, ...makeCards];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 min-h-0">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <GitBranch size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">My Automations</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                All cloned workflows from connected platforms — each with a unique iqpipe ID.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {total > 0 && (
              <button
                onClick={refresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            )}
            <button
              onClick={() => navigate("/automations")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
            >
              <ExternalLink size={13} />
              Manage connections
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={20} className="animate-spin text-slate-600" />
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && total === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <Layers size={22} className="text-slate-600" />
            </div>
            <p className="text-base font-semibold text-slate-300 mb-1">No automations yet</p>
            <p className="text-sm text-slate-600 max-w-xs mb-6">
              Connect your n8n or Make.com account to sync your workflows here.
            </p>
            <button
              onClick={() => navigate("/automations")}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
            >
              Connect automation platform
            </button>
          </div>
        )}

        {/* ── Filter tabs ── */}
        {!loading && !error && total > 0 && (
          <>
            <div className="flex items-center gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
              {(["all", "n8n", "make"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === f
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/25"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {f === "all"  ? `All (${total})` : ""}
                  {f === "n8n"  ? `n8n (${n8nWorkflows.length})` : ""}
                  {f === "make" ? `Make.com (${makeScenarios.length})` : ""}
                </button>
              ))}
            </div>

            {/* ── Summary bar ── */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <Activity size={16} className="text-indigo-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total automations</p>
                  <p className="text-lg font-bold text-white">{total}</p>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <Zap size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Active</p>
                  <p className="text-lg font-bold text-white">
                    {n8nWorkflows.filter(w => w.active).length + makeScenarios.filter(s => s.active).length}
                  </p>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <GitBranch size={16} className="text-fuchsia-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Platforms</p>
                  <p className="text-lg font-bold text-white">
                    {(n8nWorkflows.length > 0 ? 1 : 0) + (makeScenarios.length > 0 ? 1 : 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Cards grid ── */}
            {visibleCards.length > 0
              ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{visibleCards}</div>
              : (
                <div className="text-center py-16 text-slate-600 text-sm">
                  No {filter === "n8n" ? "n8n" : "Make.com"} automations connected.
                </div>
              )
            }
          </>
        )}
      </div>
    </div>
  );
}
