import { useState, useEffect, useCallback } from "react";
import {
  Bot, Zap, RefreshCw, Calendar, ChevronDown, CheckCircle2,
  AlertTriangle, XCircle, Activity, GitBranch, Layers,
  ChevronRight, Workflow, Settings2, X, Play,
} from "lucide-react";
import MakeSetupGuide from "../components/MakeSetupGuide";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueStats { pending: number; processing: number; done: number; failed: number; total: number; }
interface WorkflowError { id: string; errorCode: string; errorDetail: string; retryCount: number; createdAt: string; }
interface WorkflowRow {
  workflowId: string; totalEvents: number; done: number; pending: number; failed: number;
  successRate: number; outcomeEvents: number; processEvents: number;
  sourceApps: string[]; lastEventAt: string | null; lastEventType: string | null;
  recentErrors: WorkflowError[];
}
interface GlobalError { id: string; source: string; errorCode: string; errorDetail: string; retryCount: number; resolvedAt: string | null; createdAt: string; }
interface MakeError { id: string; errorCode: string; errorDetail: string; retryCount: number; createdAt: string; }
interface EventFilter {
  enabled: boolean;
  apps: string[];
  eventTypes: string[];
}

interface WorkflowMeta {
  id: string;
  n8nId: string;
  name: string;
  active: boolean;
  tags: string[];
  appsUsed: string[];
  nodeCount: number;
  triggerType: string;
  description: string | null;
  lastUpdatedAt: string | null;
  syncedAt: string;
  execSyncEnabled: boolean;
  eventFilter: EventFilter | null;
  lastExecCursor: string | null;
}

const ALL_EVENT_TYPES = [
  { value: "email_sent",             label: "Email sent" },
  { value: "linkedin_message_sent",  label: "LinkedIn message sent" },
  { value: "reply_received",         label: "Reply received" },
  { value: "meeting_booked",         label: "Meeting booked" },
  { value: "enriched",               label: "Contact enriched" },
  { value: "crm_updated",            label: "CRM updated" },
  { value: "deal_created",           label: "Deal created" },
  { value: "deal_won",               label: "Deal won" },
  { value: "contacted",              label: "Contacted (generic)" },
];

interface ScenarioMeta {
  id: string;
  makeId: string;
  name: string;
  active: boolean;
  appsUsed: string[];
  moduleCount: number;
  triggerType: string;
  lastUpdatedAt: string | null;
  syncedAt: string;
  execSyncEnabled: boolean;
  eventFilter: EventFilter | null;
}

interface AutomationData {
  n8n: {
    totalWorkflows: number; totalEvents: number; outcomeEvents: number; processEvents: number;
    successRate: number; queueStats: QueueStats; workflows: WorkflowRow[]; errors: GlobalError[];
  };
  make: { totalEvents: number; errors: MakeError[]; isConnected: boolean; };
}

type Period = "7d" | "30d" | "90d" | "all";
const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "all": "All time",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function triggerIcon(type: string) {
  const icons: Record<string, string> = {
    webhook: "⚡", schedule: "⏱", email: "📧", event: "🔔", manual: "▶",
  };
  return icons[type] ?? "▶";
}

function triggerLabel(type: string) {
  const labels: Record<string, string> = {
    webhook: "Webhook", schedule: "Schedule", email: "Email", event: "Event", manual: "Manual",
  };
  return labels[type] ?? type;
}

function SuccessBar({ rate }: { rate: number }) {
  const color = rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-rose-500";
  const text  = rate >= 90 ? "text-emerald-400" : rate >= 70 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>{rate}%</span>
    </div>
  );
}

function StatCard({ label, value, sub, color = "slate" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    slate:   "text-white border-slate-800 bg-slate-900",
    emerald: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
    amber:   "text-amber-400 border-amber-500/30 bg-amber-500/5",
    rose:    "text-rose-400 border-rose-500/30 bg-rose-500/5",
    indigo:  "text-indigo-400 border-indigo-500/30 bg-indigo-500/5",
    blue:    "text-blue-400 border-blue-500/30 bg-blue-500/5",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.slate}`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${colors[color]?.split(" ")[0] ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function QueueBar({ stats }: { stats: QueueStats }) {
  const total = Math.max(1, stats.total);
  const bars = [
    { label: "Done",       count: stats.done,       color: "bg-emerald-500", text: "text-emerald-400" },
    { label: "Pending",    count: stats.pending,     color: "bg-indigo-500",  text: "text-indigo-400"  },
    { label: "Processing", count: stats.processing,  color: "bg-amber-500",   text: "text-amber-400"   },
    { label: "Failed",     count: stats.failed,      color: "bg-rose-500",    text: "text-rose-400"    },
  ].filter(b => b.count > 0);

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden gap-px bg-slate-800">
        {bars.map(b => (
          <div key={b.label} className={`${b.color} transition-all`} style={{ width: `${(b.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { label: "Done",       count: stats.done,       color: "text-emerald-400" },
          { label: "Pending",    count: stats.pending,     color: "text-indigo-400"  },
          { label: "Processing", count: stats.processing,  color: "text-amber-400"   },
          { label: "Failed",     count: stats.failed,      color: "text-rose-400"    },
        ].map(b => (
          <div key={b.label} className="flex items-center gap-1.5">
            <span className={`text-sm font-bold tabular-nums ${b.color}`}>{b.count.toLocaleString()}</span>
            <span className="text-[10px] text-slate-600">{b.label}</span>
          </div>
        ))}
        <span className="text-[10px] text-slate-700 ml-auto">{stats.total.toLocaleString()} total</span>
      </div>
    </div>
  );
}

// ─── Workflow Row ─────────────────────────────────────────────────────────────

function WorkflowRowItem({ wf }: { wf: WorkflowRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = wf.recentErrors.length > 0;

  return (
    <>
      <tr
        className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
        onClick={() => hasErrors && setExpanded(v => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <GitBranch size={12} className="text-indigo-400 shrink-0" />
            <span className="text-xs font-mono text-white truncate max-w-[180px]">{wf.workflowId}</span>
            {hasErrors && (
              <ChevronRight size={12} className={`text-slate-600 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} />
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-xs tabular-nums text-slate-300 font-semibold">{wf.totalEvents.toLocaleString()}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-xs tabular-nums text-emerald-400 font-semibold">{wf.outcomeEvents}</span>
            <span className="text-[10px] text-slate-700">outcome</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <SuccessBar rate={wf.successRate} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 flex-wrap">
            {wf.sourceApps.slice(0, 3).map(app => (
              <span key={app} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-400 font-mono">
                {app}
              </span>
            ))}
            {wf.sourceApps.length > 3 && (
              <span className="text-[10px] text-slate-600">+{wf.sourceApps.length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {wf.lastEventAt ? (
            <span className="text-[10px] text-slate-500 tabular-nums">{relativeTime(wf.lastEventAt)}</span>
          ) : (
            <span className="text-[10px] text-slate-700">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {wf.failed > 0 ? (
            <span className="text-xs font-semibold text-rose-400 tabular-nums">{wf.failed}</span>
          ) : (
            <CheckCircle2 size={13} className="text-emerald-500 ml-auto" />
          )}
        </td>
      </tr>
      {expanded && hasErrors && wf.recentErrors.map(err => (
        <tr key={err.id} className="bg-rose-500/3 border-b border-slate-800/30">
          <td colSpan={7} className="px-8 py-2">
            <div className="flex items-start gap-3">
              <XCircle size={11} className="text-rose-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold text-rose-400">{err.errorCode}</span>
                  <span className="text-[10px] text-slate-600">· {err.retryCount} retries</span>
                  <span className="text-[10px] text-slate-700 ml-auto">{relativeTime(err.createdAt)}</span>
                </div>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{err.errorDetail}</p>
              </div>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Configure Events Modal ───────────────────────────────────────────────────

function ConfigureEventsModal({
  wf,
  token,
  workspaceId,
  onClose,
  onSaved,
}: {
  wf: WorkflowMeta;
  token: string;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: EventFilter = wf.eventFilter ?? { enabled: true, apps: [], eventTypes: [] };
  const [enabled,     setEnabled]     = useState(initial.enabled);
  const [selApps,     setSelApps]     = useState<string[]>(initial.apps);
  const [selEvents,   setSelEvents]   = useState<string[]>(initial.eventTypes);
  const [saving,      setSaving]      = useState(false);

  function toggleItem<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter(x => x !== item) : [...list, item];
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/api/n8n-connect/event-filter`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          workspaceId,
          n8nId:   wf.n8nId,
          execSyncEnabled: enabled,
          filter:  { enabled, apps: selApps, eventTypes: selEvents },
        }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white">Configure Event Capture</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">{wf.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Master toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setEnabled(v => !v)}
              className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${enabled ? "bg-indigo-500" : "bg-slate-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-white leading-none">Capture executions from this workflow</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Poll n8n every 5 min and create contact events from node outputs
              </p>
            </div>
          </label>

          {enabled && (
            <>
              {/* App filter */}
              {wf.appsUsed.length > 0 && (
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Apps to capture</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Leave all unchecked to capture from every app in this workflow</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wf.appsUsed.map(app => {
                      const active = selApps.length === 0 || selApps.includes(app);
                      return (
                        <button
                          key={app}
                          onClick={() => setSelApps(prev =>
                            prev.length === 0
                              ? wf.appsUsed.filter(a => a !== app)
                              : toggleItem(prev, app)
                          )}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            active
                              ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-300"
                              : "bg-slate-800 border-slate-700 text-slate-500"
                          }`}
                        >
                          {app}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Event type filter */}
              <div className="space-y-2">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Event types to record</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Leave all unchecked to record all inferred types</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_EVENT_TYPES.map(({ value, label }) => {
                    const active = selEvents.length === 0 || selEvents.includes(value);
                    return (
                      <button
                        key={value}
                        onClick={() => setSelEvents(prev =>
                          prev.length === 0
                            ? ALL_EVENT_TYPES.map(e => e.value).filter(v => v !== value)
                            : toggleItem(prev, value)
                        )}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] border text-left transition-colors ${
                          active
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-slate-800 border-slate-700 text-slate-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors disabled:opacity-60"
          >
            {saving ? <><RefreshCw size={11} className="animate-spin" /> Saving…</> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationHealthPage() {
  const [data,        setData]        = useState<AutomationData | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading,     setLoading]     = useState(true);
  const [period,      setPeriod]      = useState<Period>("30d");
  const [showPeriod,  setShowPeriod]  = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // n8n connection state
  const [connStatus,      setConnStatus]      = useState<any>(null);
  const [workflowMeta,    setWorkflowMeta]    = useState<WorkflowMeta[]>([]);
  const [metaLoading,     setMetaLoading]     = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [formBaseUrl,     setFormBaseUrl]     = useState("");
  const [formApiKey,      setFormApiKey]      = useState("");
  const [connecting,      setConnecting]      = useState(false);
  const [connectError,    setConnectError]    = useState("");
  const [syncing,         setSyncing]         = useState(false);
  const [polling,         setPolling]         = useState(false);
  const [configWf,        setConfigWf]        = useState<WorkflowMeta | null>(null);

  // Platform picker
  const [selectedPlatform, setSelectedPlatform] = useState<"n8n" | "make" | null>(null);

  // Make.com state
  const [makeConn,        setMakeConn]        = useState<any>(null);
  const [makeScenarios,   setMakeScenarios]   = useState<ScenarioMeta[]>([]);
  const [makeMetaLoading, setMakeMetaLoading] = useState(false);
  const [showMakeForm,    setShowMakeForm]    = useState(false);
  const [makeApiKey,      setMakeApiKey]      = useState("");
  const [makeRegion,      setMakeRegion]      = useState("us1");
  const [makeConnecting,  setMakeConnecting]  = useState(false);
  const [makeConnError,   setMakeConnError]   = useState("");
  const [makeSyncing,     setMakeSyncing]     = useState(false);
  const [guideScenario,   setGuideScenario]   = useState<ScenarioMeta | null>(null);
  const [guideUrl,        setGuideUrl]        = useState("");

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (wsId: string, p: Period) => {
    if (!wsId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/automation-health?workspaceId=${wsId}&period=${p}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      if (r.ok) { setData(await r.json()); setLastRefresh(new Date()); }
    } catch {} finally { setLoading(false); }
  }, []);

  const loadConnStatus = useCallback(async (wsId: string) => {
    if (!wsId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/n8n-connect/status?workspaceId=${wsId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setConnStatus(await r.json());
    } catch {}
  }, []);

  const loadWorkflowMeta = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setMetaLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setWorkflowMeta(await r.json());
    } catch {} finally { setMetaLoading(false); }
  }, []);

  const loadMakeConn = useCallback(async (wsId: string) => {
    if (!wsId) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/make-connect/status?workspaceId=${wsId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setMakeConn(await r.json());
    } catch {}
  }, []);

  const loadMakeScenarios = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setMakeMetaLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setMakeScenarios(await r.json());
    } catch {} finally { setMakeMetaLoading(false); }
  }, []);

  useEffect(() => {
    if (workspaceId) {
      load(workspaceId, period);
      loadConnStatus(workspaceId);
      loadWorkflowMeta(workspaceId);
      loadMakeConn(workspaceId);
      loadMakeScenarios(workspaceId);
    }
  }, [workspaceId, period, load, loadConnStatus, loadWorkflowMeta, loadMakeConn, loadMakeScenarios]);

  // Auto-select platform once connection status loads
  useEffect(() => {
    if (selectedPlatform !== null) return; // user already chose
    if (connStatus?.connected) { setSelectedPlatform("n8n"); return; }
    if (makeConn?.connected)   { setSelectedPlatform("make"); return; }
  }, [connStatus, makeConn, selectedPlatform]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !formBaseUrl || !formApiKey) return;
    setConnecting(true);
    setConnectError("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/n8n-connect/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, baseUrl: formBaseUrl, apiKey: formApiKey }),
      });
      const d = await r.json();
      if (!r.ok) { setConnectError(d.error || "Connection failed"); return; }
      setShowConnectForm(false);
      setFormApiKey("");
      await loadConnStatus(workspaceId);
      setTimeout(() => loadWorkflowMeta(workspaceId), 3000);
    } catch (err: any) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!workspaceId) return;
    if (!confirm("Disconnect n8n? All synced workflow metadata will be removed.")) return;
    await fetch(`${API_BASE_URL}/api/n8n-connect?workspaceId=${workspaceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    setConnStatus(null);
    setWorkflowMeta([]);
  }

  async function handleSyncNow() {
    if (!workspaceId || syncing) return;
    setSyncing(true);
    try {
      await fetch(`${API_BASE_URL}/api/n8n-connect/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      await loadConnStatus(workspaceId);
      await loadWorkflowMeta(workspaceId);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePollNow() {
    if (!workspaceId || polling) return;
    setPolling(true);
    try {
      await fetch(`${API_BASE_URL}/api/n8n-connect/poll-now`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      // Reload queue stats after a brief delay
      setTimeout(() => load(workspaceId, period), 3000);
    } finally {
      setPolling(false);
    }
  }

  async function handleMakeConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !makeApiKey) return;
    setMakeConnecting(true); setMakeConnError("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/make-connect/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, apiKey: makeApiKey, region: makeRegion }),
      });
      const d = await r.json();
      if (!r.ok) { setMakeConnError(d.error || "Connection failed"); return; }
      setShowMakeForm(false); setMakeApiKey("");
      await loadMakeConn(workspaceId);
      setTimeout(() => loadMakeScenarios(workspaceId), 3000);
    } catch (err: any) { setMakeConnError(err.message); }
    finally { setMakeConnecting(false); }
  }

  async function handleMakeDisconnect() {
    if (!workspaceId) return;
    if (!confirm("Disconnect Make.com? All synced scenario metadata will be removed.")) return;
    await fetch(`${API_BASE_URL}/api/make-connect?workspaceId=${workspaceId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
    });
    setMakeConn(null); setMakeScenarios([]);
  }

  async function handleMakeSyncNow() {
    if (!workspaceId || makeSyncing) return;
    setMakeSyncing(true);
    try {
      await fetch(`${API_BASE_URL}/api/make-connect/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      await loadMakeConn(workspaceId);
      await loadMakeScenarios(workspaceId);
    } finally { setMakeSyncing(false); }
  }

  async function openGuide(sc: ScenarioMeta) {
    setGuideScenario(sc);
    try {
      const r = await fetch(`${API_BASE_URL}/api/make-connect/webhook-url?workspaceId=${workspaceId}&makeId=${sc.makeId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      setGuideUrl(d.url ?? "");
    } catch { setGuideUrl(""); }
  }

  const n8n   = data?.n8n;
  const make  = data?.make;
  const openErrors = (n8n?.errors.length ?? 0) + (make?.errors.length ?? 0);
  const queueActive = (n8n?.queueStats.pending ?? 0) + (n8n?.queueStats.processing ?? 0);

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-6 space-y-6 max-w-5xl">

      {/* Configure Events modal */}
      {configWf && (
        <ConfigureEventsModal
          wf={configWf}
          token={token()}
          workspaceId={workspaceId}
          onClose={() => setConfigWf(null)}
          onSaved={() => loadWorkflowMeta(workspaceId)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bot size={18} className="text-indigo-400" />
          <div>
            <h1 className="text-base font-bold text-white leading-none">Automation Health</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              n8n and Make.com workflow event report
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowPeriod(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-colors"
            >
              <Calendar size={11} className="text-slate-600" />
              {PERIOD_LABELS[period]}
              <ChevronDown size={11} className={`text-slate-600 transition-transform ${showPeriod ? "rotate-180" : ""}`} />
            </button>
            {showPeriod && (
              <div className="absolute top-full right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden z-20 shadow-xl w-40">
                {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => { setPeriod(k); setShowPeriod(false); }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors ${period === k ? "text-indigo-400 font-medium" : "text-slate-400"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-[10px] text-slate-700 tabular-nums">
            {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={() => load(workspaceId, period)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-400 transition-colors"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Platform picker (shown when no platform selected yet) ── */}
      {!loading && selectedPlatform === null && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-center mb-10">
            <h2 className="text-lg font-bold text-white mb-2">Choose your automation platform</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              iqpipe connects to your existing Make.com or n8n account, reads your workflows, and lets you select which events to record per app node.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 w-full max-w-xl">
            {/* n8n card */}
            <button
              onClick={() => setSelectedPlatform("n8n")}
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border border-slate-800 bg-slate-900/40 hover:border-orange-500/40 hover:bg-orange-500/5 transition-all text-left"
            >
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-slate-900/50 group-hover:shadow-orange-500/10 transition-all">
                <img src={`${API_BASE_URL}/api/proxy/favicon?domain=n8n.io`} width={34} height={34} alt="n8n" className="object-contain" />
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-white mb-1">n8n</div>
                <div className="text-xs text-slate-500 leading-relaxed">Self-hosted or n8n Cloud · code-friendly workflows · 400+ integrations</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 group-hover:text-orange-300 transition-colors">
                Connect n8n <ChevronRight size={13} />
              </div>
            </button>
            {/* Make.com card */}
            <button
              onClick={() => setSelectedPlatform("make")}
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border border-slate-800 bg-slate-900/40 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all text-left"
            >
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-slate-900/50 group-hover:shadow-violet-500/10 transition-all">
                <img src={`${API_BASE_URL}/api/proxy/favicon?domain=make.com`} width={34} height={34} alt="Make" className="object-contain" />
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-white mb-1">Make.com</div>
                <div className="text-xs text-slate-500 leading-relaxed">Visual scenario builder · 500+ app modules · drag-and-drop</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-400 group-hover:text-violet-300 transition-colors">
                Connect Make.com <ChevronRight size={13} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Platform breadcrumb — shown once a platform is selected */}
      {selectedPlatform !== null && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedPlatform(null)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← All platforms
          </button>
          <span className="text-slate-700">/</span>
          <div className="flex items-center gap-1.5">
            <img
              src={`${API_BASE_URL}/api/proxy/favicon?domain=${selectedPlatform === "n8n" ? "n8n.io" : "make.com"}`}
              width={13} height={13}
              alt={selectedPlatform}
              className="object-contain rounded"
            />
            <span className="text-xs font-semibold text-slate-300">{selectedPlatform === "n8n" ? "n8n" : "Make.com"}</span>
          </div>
        </div>
      )}

      {selectedPlatform !== null && loading ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" /> Loading automation data…
        </div>
      ) : selectedPlatform !== null && !data ? (
        <div className="flex items-center justify-center h-48 text-slate-700 text-sm">No data available</div>
      ) : selectedPlatform !== null ? (
        <>
          {/* Overview stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="n8n Workflows"  value={n8n?.totalWorkflows ?? 0}    color="indigo" />
            <StatCard label="Total Events"   value={(n8n?.totalEvents ?? 0).toLocaleString()} sub={PERIOD_LABELS[period]} color="slate" />
            <StatCard label="Success Rate"   value={`${n8n?.successRate ?? 0}%`}  color={(n8n?.successRate ?? 0) >= 90 ? "emerald" : (n8n?.successRate ?? 0) >= 70 ? "amber" : "rose"} />
            <StatCard label="Queue Active"   value={queueActive}                  color={queueActive > 0 ? "amber" : "emerald"} sub="pending + processing" />
            <StatCard label="Open Errors"    value={openErrors}                   color={openErrors === 0 ? "emerald" : "rose"} />
          </div>

          {/* ── n8n Connection Panel ── */}
          {selectedPlatform === "n8n" && <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-indigo-400" />
                <span className="text-sm font-semibold text-white">n8n Instance</span>
                {connStatus?.connected ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-600">Not connected</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {connStatus?.connected && (
                  <>
                    <button
                      onClick={handlePollNow}
                      disabled={polling}
                      title="Pull latest execution events from n8n (runs every 5 min automatically)"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                    >
                      <Play size={11} className={polling ? "animate-pulse" : ""} />
                      {polling ? "Polling…" : "Poll Executions"}
                    </button>
                    <button
                      onClick={handleSyncNow}
                      disabled={syncing}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
                      {syncing ? "Syncing\u2026" : "Sync Workflows"}
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
                    >
                      Disconnect
                    </button>
                  </>
                )}
                {!connStatus?.connected && (
                  <button
                    onClick={() => setShowConnectForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-xs text-indigo-400 transition-colors"
                  >
                    Connect n8n
                  </button>
                )}
              </div>
            </div>

            {connStatus?.connected ? (
              <div className="px-5 py-4 flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Instance</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">{connStatus.baseUrl}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Workflows</p>
                  <p className="text-sm font-bold text-white">{connStatus.workflowCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Metadata Synced</p>
                  <p className="text-xs text-slate-400">{connStatus.lastSyncAt ? relativeTime(connStatus.lastSyncAt) : "Syncing\u2026"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Last Exec Poll</p>
                  <p className="text-xs text-slate-400">{connStatus.lastExecPollAt ? relativeTime(connStatus.lastExecPollAt) : "Not yet"}</p>
                </div>
                {connStatus.lastError && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle size={12} />
                    {connStatus.lastError}
                  </div>
                )}
              </div>
            ) : showConnectForm ? (
              <form onSubmit={handleConnect} className="p-5 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 font-medium">n8n Instance URL</label>
                    <input
                      type="url"
                      placeholder="https://your-instance.n8n.cloud"
                      value={formBaseUrl}
                      onChange={e => setFormBaseUrl(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none text-sm text-white placeholder-slate-600 transition-colors"
                    />
                    <p className="text-[10px] text-slate-700">Your n8n cloud URL or self-hosted base URL</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 font-medium">API Key</label>
                    <input
                      type="password"
                      placeholder="n8n_api_\u2026"
                      value={formApiKey}
                      onChange={e => setFormApiKey(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-indigo-500 focus:outline-none text-sm text-white placeholder-slate-600 transition-colors"
                    />
                    <p className="text-[10px] text-slate-700">Settings &#8594; API &#8594; Create API key in your n8n instance</p>
                  </div>
                </div>
                {connectError && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">
                    <XCircle size={12} />
                    {connectError}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={connecting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {connecting ? <><RefreshCw size={12} className="animate-spin" /> Testing connection\u2026</> : "Connect & Sync"}
                  </button>
                  <button type="button" onClick={() => setShowConnectForm(false)} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-300">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-slate-600">Connect your n8n instance to see workflow definitions and app usage</p>
                <p className="text-[11px] text-slate-700 mt-1">API key required &#8212; no workflow canvas data is imported</p>
              </div>
            )}
          </div>}

          {/* ── Connected Workflows (from n8n instance) ── */}
          {connStatus?.connected && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Workflow size={14} className="text-indigo-400" />
                  <span className="text-sm font-semibold text-white">Connected Workflows</span>
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-semibold">
                    {workflowMeta.length}
                  </span>
                </div>
                {metaLoading && <RefreshCw size={12} className="text-slate-600 animate-spin" />}
              </div>

              {metaLoading && workflowMeta.length === 0 ? (
                <div className="flex items-center justify-center h-24 gap-2 text-slate-600 text-xs">
                  <RefreshCw size={12} className="animate-spin" /> Loading workflows\u2026
                </div>
              ) : workflowMeta.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-600">No workflows synced yet</p>
                  <p className="text-[11px] text-slate-700 mt-1">Click &#8220;Sync Now&#8221; to fetch your n8n workflows</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {workflowMeta.map(wf => (
                    <div key={wf.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-slate-800/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wf.active ? "bg-emerald-500" : "bg-slate-700"}`} />
                          <span className="text-sm font-medium text-white truncate">{wf.name}</span>
                          <span className="text-[10px] text-slate-600 font-mono shrink-0">
                            {triggerIcon(wf.triggerType)} {triggerLabel(wf.triggerType)}
                          </span>
                          {wf.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {wf.description && (
                          <p className="text-[11px] text-slate-600 mt-0.5 truncate">{wf.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {wf.appsUsed.slice(0, 8).map(app => (
                            <span key={app} className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800/80 border border-slate-700/80 text-slate-400 font-medium">
                              {app}
                            </span>
                          ))}
                          {wf.appsUsed.length > 8 && (
                            <span className="text-[10px] text-slate-600">+{wf.appsUsed.length - 8} more</span>
                          )}
                          {wf.appsUsed.length === 0 && (
                            <span className="text-[10px] text-slate-700">No external apps detected</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1.5">
                        <button
                          onClick={() => setConfigWf(wf)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-[10px] text-slate-500 hover:text-indigo-400 transition-colors ml-auto"
                        >
                          <Settings2 size={10} />
                          Configure
                        </button>
                        <p className="text-[10px] text-slate-700">{wf.nodeCount} nodes</p>
                        {wf.lastUpdatedAt && (
                          <p className="text-[10px] text-slate-700">Updated {relativeTime(wf.lastUpdatedAt)}</p>
                        )}
                        <div className="flex items-center gap-1 justify-end">
                          <span className={`w-1.5 h-1.5 rounded-full ${wf.execSyncEnabled ? "bg-indigo-500" : "bg-slate-700"}`} />
                          <span className="text-[10px] text-slate-700">{wf.execSyncEnabled ? "Exec sync on" : "Exec sync off"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── n8n Section ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
              <Workflow size={14} className="text-indigo-400" />
              <span className="text-sm font-semibold text-white">n8n Workflows</span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-semibold">
                {n8n?.totalWorkflows} workflow{n8n?.totalWorkflows !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Queue overview bar */}
            {n8n && n8n.queueStats.total > 0 && (
              <div className="px-5 py-3 border-b border-slate-800/50">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2">Queue State (all-time)</p>
                <QueueBar stats={n8n.queueStats} />
              </div>
            )}

            {/* Event class split */}
            {n8n && n8n.totalEvents > 0 && (
              <div className="px-5 py-3 border-b border-slate-800/50 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Zap size={11} className="text-emerald-400" />
                  <span className="text-xs text-slate-400">
                    <span className="font-bold text-emerald-400">{n8n.outcomeEvents.toLocaleString()}</span> outcome events
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity size={11} className="text-slate-500" />
                  <span className="text-xs text-slate-400">
                    <span className="font-bold text-slate-300">{n8n.processEvents.toLocaleString()}</span> process events
                  </span>
                </div>
                <span className="text-[10px] text-slate-700 ml-auto">Outcome events update canonical dataset · Process events power workflow analytics only</span>
              </div>
            )}

            {/* Workflows table */}
            {n8n && n8n.workflows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {["Workflow", "Events", "Outcomes", "Success", "Source Apps", "Last Event", "Errors"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-[10px] text-slate-600 uppercase tracking-wider font-semibold whitespace-nowrap text-right first:text-left last:text-right">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {n8n.workflows.map(wf => <WorkflowRowItem key={wf.workflowId} wf={wf} />)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <Bot size={28} className="text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-600 font-medium">No n8n workflows detected yet</p>
                <p className="text-[11px] text-slate-700 mt-1">
                  Send events to <span className="font-mono text-slate-500">POST /api/webhooks/n8n</span> to activate
                </p>
              </div>
            )}
          </div>

          {/* ── Make.com Connection Panel ── */}
          {selectedPlatform === "make" && <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-purple-400" />
                <span className="text-sm font-semibold text-white">Make.com</span>
                {makeConn?.connected ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-600">Not connected</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {makeConn?.connected && (
                  <>
                    <button
                      onClick={handleMakeSyncNow}
                      disabled={makeSyncing}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={makeSyncing ? "animate-spin" : ""} />
                      {makeSyncing ? "Syncing…" : "Sync Scenarios"}
                    </button>
                    <button
                      onClick={handleMakeDisconnect}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
                    >
                      Disconnect
                    </button>
                  </>
                )}
                {!makeConn?.connected && (
                  <button
                    onClick={() => setShowMakeForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-xs text-purple-400 transition-colors"
                  >
                    Connect Make.com
                  </button>
                )}
              </div>
            </div>

            {makeConn?.connected ? (
              <div className="px-5 py-4 flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Region</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">{makeConn.region}.make.com</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Scenarios</p>
                  <p className="text-sm font-bold text-white">{makeConn.scenarioCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider">Last Synced</p>
                  <p className="text-xs text-slate-400">{makeConn.lastSyncAt ? relativeTime(makeConn.lastSyncAt) : "Syncing…"}</p>
                </div>
                {makeConn.lastError && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle size={12} />{makeConn.lastError}
                  </div>
                )}
              </div>
            ) : showMakeForm ? (
              <form onSubmit={handleMakeConnect} className="p-5 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 font-medium">API Token</label>
                    <input
                      type="password"
                      placeholder="Your Make.com API token"
                      value={makeApiKey}
                      onChange={e => setMakeApiKey(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-purple-500 focus:outline-none text-sm text-white placeholder-slate-600 transition-colors"
                    />
                    <p className="text-[10px] text-slate-700">Profile → API access → Generate API token</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-500 font-medium">Region</label>
                    <select
                      value={makeRegion}
                      onChange={e => setMakeRegion(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-purple-500 focus:outline-none text-sm text-white transition-colors"
                    >
                      <option value="us1">us1 (United States)</option>
                      <option value="eu1">eu1 (Europe)</option>
                      <option value="eu2">eu2 (Europe 2)</option>
                    </select>
                    <p className="text-[10px] text-slate-700">Check your Make.com URL to identify your region</p>
                  </div>
                </div>
                {makeConnError && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">
                    <XCircle size={12} />{makeConnError}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={makeConnecting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {makeConnecting ? <><RefreshCw size={12} className="animate-spin" /> Testing…</> : "Connect & Sync"}
                  </button>
                  <button type="button" onClick={() => setShowMakeForm(false)} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-300">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-slate-600">Connect Make.com to sync your scenarios and set up webhook event capture</p>
                <p className="text-[11px] text-slate-700 mt-1">API token required — no scenario logic or data is imported</p>
              </div>
            )}
          </div>}

          {/* ── Make Scenarios List ── */}
          {makeConn?.connected && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-purple-400" />
                  <span className="text-sm font-semibold text-white">Scenarios</span>
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-400 font-semibold">
                    {makeScenarios.length}
                  </span>
                </div>
                {makeMetaLoading && <RefreshCw size={12} className="text-slate-600 animate-spin" />}
              </div>

              {makeMetaLoading && makeScenarios.length === 0 ? (
                <div className="flex items-center justify-center h-24 gap-2 text-slate-600 text-xs">
                  <RefreshCw size={12} className="animate-spin" /> Loading scenarios…
                </div>
              ) : makeScenarios.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-600">No scenarios synced yet</p>
                  <p className="text-[11px] text-slate-700 mt-1">Click "Sync Scenarios" to fetch your Make.com scenarios</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {makeScenarios.map(sc => (
                    <div key={sc.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-slate-800/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.active ? "bg-emerald-500" : "bg-slate-700"}`} />
                          <span className="text-sm font-medium text-white truncate">{sc.name}</span>
                          <span className="text-[10px] text-slate-600 font-mono shrink-0">
                            {sc.triggerType === "webhook" ? "⚡ webhook" : sc.triggerType === "email" ? "✉ email" : "🕐 schedule"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {sc.appsUsed.slice(0, 8).map(app => (
                            <span key={app} className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800/80 border border-slate-700/80 text-slate-400 font-medium">
                              {app}
                            </span>
                          ))}
                          {sc.appsUsed.length > 8 && (
                            <span className="text-[10px] text-slate-600">+{sc.appsUsed.length - 8} more</span>
                          )}
                          {sc.appsUsed.length === 0 && (
                            <span className="text-[10px] text-slate-700">No external apps detected</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1.5">
                        <button
                          onClick={() => openGuide(sc)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-[10px] text-purple-400 hover:text-purple-300 transition-colors ml-auto"
                        >
                          <Zap size={10} />
                          Set up capture
                        </button>
                        <p className="text-[10px] text-slate-700">{sc.moduleCount} modules</p>
                        {sc.lastUpdatedAt && (
                          <p className="text-[10px] text-slate-700">Updated {relativeTime(sc.lastUpdatedAt)}</p>
                        )}
                        <div className="flex items-center gap-1 justify-end">
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.execSyncEnabled ? "bg-purple-500" : "bg-slate-700"}`} />
                          <span className="text-[10px] text-slate-700">{sc.execSyncEnabled ? "Capture on" : "Capture off"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Make Setup Guide Modal ── */}
          {guideScenario && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers size={14} className="text-purple-400" />
                      Set up event capture
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-sm">{guideScenario.name}</p>
                  </div>
                  <button onClick={() => { setGuideScenario(null); setGuideUrl(""); }} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-5">
                  <MakeSetupGuide
                    webhookUrl={guideUrl || `…/api/webhooks/make?workspaceId=${workspaceId}&scenarioId=${guideScenario.makeId}`}
                    scenarioName={guideScenario.name}
                    defaultEventType={guideScenario.eventFilter?.eventTypes?.[0]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Make event stats (if events received) ── */}
          {(make?.totalEvents ?? 0) > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
                <Layers size={14} className="text-purple-400" />
                <span className="text-sm font-semibold text-white">Make.com Events</span>
                <span className="text-[10px] text-slate-600 ml-1">{PERIOD_LABELS[period]}</span>
              </div>
              <div className="px-5 py-4 flex items-center gap-8 flex-wrap">
                <div>
                  <p className="text-2xl font-black text-white tabular-nums">{(make?.totalEvents ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600">total events</p>
                </div>
                <div>
                  <p className={`text-2xl font-black tabular-nums ${(make?.errors.length ?? 0) === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {make?.errors.length ?? 0}
                  </p>
                  <p className="text-[10px] text-slate-600">open errors</p>
                </div>
              </div>
              {(make?.errors.length ?? 0) > 0 && (
                <div className="border-t border-slate-800 divide-y divide-slate-800/50">
                  {make!.errors.map(err => (
                    <div key={err.id} className="px-5 py-3 flex items-start gap-3">
                      <XCircle size={12} className="text-rose-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-semibold text-rose-400">{err.errorCode}</span>
                          <span className="text-[10px] text-slate-600">· {err.retryCount} retries</span>
                          <span className="text-[10px] text-slate-700 ml-auto">{relativeTime(err.createdAt)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{err.errorDetail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Global Error Log ── */}
          {selectedPlatform === "n8n" && (n8n?.errors.length ?? 0) > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
                <XCircle size={14} className="text-rose-400" />
                <span className="text-sm font-semibold text-white">n8n Error Log</span>
                <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-400 font-semibold">
                  {n8n!.errors.length} unresolved
                </span>
              </div>
              <div className="divide-y divide-slate-800/50">
                {n8n!.errors.map(err => (
                  <div key={err.id} className="px-5 py-3 flex items-start gap-3">
                    <AlertTriangle size={12} className="text-rose-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-500">{err.source}</span>
                        <span className="text-[10px] font-semibold font-mono text-rose-400">{err.errorCode}</span>
                        <span className="text-[10px] text-slate-700">{err.retryCount} retries</span>
                        <span className="text-[10px] text-slate-700 ml-auto tabular-nums">{relativeTime(err.createdAt)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">{err.errorDetail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-700 pb-4">
            n8n events are staged in the ingestion queue and processed asynchronously. Outcome events update canonical lead data; process events power workflow-level analytics only.
          </p>
        </>
      ) : null}
    </div>
  );
}
