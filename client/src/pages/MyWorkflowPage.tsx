import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitBranch, RefreshCw, ExternalLink, AlertCircle, Zap,
  Activity, Layers, ChevronRight, CheckCircle2, Circle, AlertTriangle,
} from "lucide-react";
import { API_BASE_URL } from "../../config";
import DemoModeBanner from "../components/DemoModeBanner";
import { useDemoMode } from "../hooks/useDemoMode";

// ─── Types ────────────────────────────────────────────────────────────────────

interface N8nWorkflow {
  id: string; n8nId: string; name: string; active: boolean;
  appsUsed: string[]; nodeCount: number; triggerType: string;
  lastUpdatedAt: string | null; syncedAt: string; execSyncEnabled: boolean;
}

interface MakeScenario {
  id: string; makeId: string; name: string; active: boolean;
  appsUsed: string[]; moduleCount: number; triggerType: string;
  lastUpdatedAt: string | null; syncedAt: string; execSyncEnabled: boolean;
}

interface MirrorSummary {
  id: string;
  correlationKey: string | null;
  appConnections: { appKey: string; status: string }[];
}

// ─── Mirror status badge ──────────────────────────────────────────────────────

function MirrorStatus({ mirror, appsUsed }: { mirror: MirrorSummary | null; appsUsed: string[] }) {
  if (!mirror) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-slate-600">
        <Circle size={10} />
        Not configured
      </span>
    );
  }
  const connected = mirror.appConnections.filter(c => c.status === "connected").length;
  const total     = appsUsed.length;
  const hasKey    = !!mirror.correlationKey;

  if (connected === total && hasKey) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
        <CheckCircle2 size={10} />
        Mirror active
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-amber-400">
      <AlertTriangle size={10} />
      {connected}/{total} apps · {hasKey ? "key set" : "no key"}
    </span>
  );
}

// ─── Automation card ──────────────────────────────────────────────────────────

function AutomationCard({
  id, name, active, platform, appsUsed, nodeCount, mirror,
}: {
  id: string; name: string; active: boolean;
  platform: "n8n" | "make"; appsUsed: string[];
  nodeCount: number; mirror: MirrorSummary | null;
}) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/my-workflow/${id}?platform=${platform}`)}
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/30 hover:bg-slate-900/80 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 group-hover:border-indigo-500/30 transition-colors">
            <GitBranch size={16} className="text-slate-400 group-hover:text-indigo-400 transition-colors" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                platform === "n8n"
                  ? "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20"
                  : "bg-orange-500/10 text-orange-400 border-orange-500/20"
              }`}>{platform === "n8n" ? "n8n" : "Make.com"}</span>
              {active
                ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Active</span>
                : <span className="text-[10px] text-slate-600">Inactive</span>
              }
            </div>
          </div>
        </div>
        <ChevronRight size={15} className="text-slate-700 group-hover:text-indigo-400 transition-colors shrink-0 mt-1" />
      </div>

      {/* App chips */}
      {appsUsed.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {appsUsed.slice(0, 5).map(app => {
            const conn = mirror?.appConnections.find(c => {
              // Fuzzy match: "HubSpot" ↔ "hubspot"
              return c.appKey.toLowerCase() === app.toLowerCase().replace(/[^a-z0-9]/g, "");
            });
            const isConnected = conn?.status === "connected";
            return (
              <span
                key={app}
                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-slate-800 text-slate-500 border-slate-700"
                }`}
              >
                {app}
              </span>
            );
          })}
          {appsUsed.length > 5 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-600">
              +{appsUsed.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Mirror status + node count */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
        <MirrorStatus mirror={mirror} appsUsed={appsUsed} />
        <span className="text-[10px] text-slate-700">{nodeCount} nodes</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyWorkflowPage() {
  const navigate    = useNavigate();
  const isDemo      = useDemoMode();
  const [workspaceId,   setWorkspaceId]   = useState("");
  const [n8nWorkflows,  setN8nWorkflows]  = useState<N8nWorkflow[]>([]);
  const [makeScenarios, setMakeScenarios] = useState<MakeScenario[]>([]);
  const [mirrors,       setMirrors]       = useState<Record<string, MirrorSummary>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState<"all" | "n8n" | "make">("all");

  // ── Workspace ──────────────────────────────────────────────────────────────
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

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const load = useCallback(async (wsId: string) => {
    const token = localStorage.getItem("iqpipe_token") ?? "";
    setError(null);
    try {
      const [n8nRes, makeRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`,
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const n8n:  N8nWorkflow[]  = n8nRes.ok  ? await n8nRes.json()  : [];
      const make: MakeScenario[] = makeRes.ok ? await makeRes.json() : [];
      setN8nWorkflows(n8n);
      setMakeScenarios(make);

      // Fetch mirror summaries for all automations
      const allIds = [...n8n.map(w => w.id), ...make.map(s => s.id)];
      const mirrorMap: Record<string, MirrorSummary> = {};
      await Promise.all(allIds.map(async (wfId) => {
        const r = await fetch(
          `${API_BASE_URL}/api/workflow-mirror?workspaceId=${wsId}&workflowId=${wfId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (r.ok) {
          const m = await r.json();
          if (m) mirrorMap[wfId] = m;
        }
      }));
      setMirrors(mirrorMap);
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

  // ── Metrics ────────────────────────────────────────────────────────────────
  const total        = n8nWorkflows.length + makeScenarios.length;
  const activeCount  = n8nWorkflows.filter(w => w.active).length + makeScenarios.filter(s => s.active).length;
  const mirroredCount = Object.values(mirrors).filter(m =>
    m.correlationKey && m.appConnections.some(c => c.status === "connected")
  ).length;

  // ── Cards ──────────────────────────────────────────────────────────────────
  const n8nCards = n8nWorkflows.map(wf => (
    <AutomationCard key={wf.id} id={wf.id} name={wf.name} active={wf.active}
      platform="n8n" appsUsed={wf.appsUsed} nodeCount={wf.nodeCount}
      mirror={mirrors[wf.id] ?? null} />
  ));
  const makeCards = makeScenarios.map(sc => (
    <AutomationCard key={sc.id} id={sc.id} name={sc.name} active={sc.active}
      platform="make" appsUsed={sc.appsUsed} nodeCount={sc.moduleCount}
      mirror={mirrors[sc.id] ?? null} />
  ));
  const visible = filter === "n8n" ? n8nCards : filter === "make" ? makeCards : [...n8nCards, ...makeCards];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 min-h-0">
      {isDemo && <DemoModeBanner />}
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <GitBranch size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Workflow Mirrors</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Connect apps to each automation and track real outcomes — not just execution signals.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <button onClick={refresh} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50">
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            )}
            <button
              onClick={() => !isDemo && navigate("/automations")}
              disabled={isDemo}
              title={isDemo ? "Disabled in demo mode" : undefined}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors">
              <ExternalLink size={13} />
              Manage connections
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={20} className="animate-spin text-slate-600" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={14} />{error}
          </div>
        )}

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
              onClick={() => !isDemo && navigate("/automations")}
              disabled={isDemo}
              title={isDemo ? "Disabled in demo mode" : undefined}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors">
              Connect automation platform
            </button>
          </div>
        )}

        {!loading && !error && total > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { icon: <Activity size={16} className="text-indigo-400" />, label: "Total", value: total },
                { icon: <Zap size={16} className="text-emerald-400" />,     label: "Active", value: activeCount },
                { icon: <GitBranch size={16} className="text-fuchsia-400"/>,label: "Mirrored", value: mirroredCount },
              ].map(s => (
                <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  {s.icon}
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider">{s.label}</p>
                    <p className="text-lg font-bold text-white">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
              {(["all", "n8n", "make"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === f
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/25"
                      : "text-slate-500 hover:text-slate-300"
                  }`}>
                  {f === "all"  ? `All (${total})` : f === "n8n" ? `n8n (${n8nWorkflows.length})` : `Make.com (${makeScenarios.length})`}
                </button>
              ))}
            </div>

            {/* Cards */}
            {visible.length > 0
              ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{visible}</div>
              : <div className="text-center py-16 text-slate-600 text-sm">No {filter} automations connected.</div>
            }
          </>
        )}
      </div>
    </div>
  );
}
