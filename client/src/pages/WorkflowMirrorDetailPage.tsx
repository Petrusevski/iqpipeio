import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, GitBranch, CheckCircle2, Circle, AlertTriangle,
  Plug, Settings2, Key, Webhook, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Copy, Check, ExternalLink,
  Link2, Activity, Clock, X, Plus,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppCatalogEntry {
  label: string; domain: string;
  connectionType: "webhook" | "polling" | "both";
  events: { key: string; label: string; category: string }[];
}

interface ObservedEvent { id: string; eventKey: string; label: string; appKey: string; }

interface AppConnection {
  id: string; appKey: string; connectionType: string;
  status: string; lastEventAt: string | null; errorMessage: string | null;
  observedEvents: ObservedEvent[];
}

interface Mirror {
  id: string; workflowId: string; platform: string;
  correlationKey: string | null; unknownMappings: string;
  appConnections: AppConnection[];
}

interface WorkflowMeta {
  id: string; name: string; active: boolean;
  n8nId?: string; makeId?: string;
  appsUsed: string[]; nodeCount: number; nodeTypes?: string[];
  eventFilter?: { enabled: boolean; apps: string[]; eventTypes: string[] } | null;
  triggerType: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Map friendly app name → catalog key (e.g. "HubSpot" → "hubspot")
function appNameToKey(name: string, catalog: Record<string, AppCatalogEntry>): string | null {
  const n = normKey(name);
  for (const key of Object.keys(catalog)) {
    if (normKey(key) === n || normKey(catalog[key].label) === n) return key;
  }
  return null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Flow Visualizer ──────────────────────────────────────────────────────────

const BRANCH_SLUGS = new Set(["if", "switch", "splitInBatches", "compareDatasets"]);

function hasBranchNode(nodeTypes: string[]): boolean {
  return nodeTypes.some(t =>
    BRANCH_SLUGS.has((t.split(".").pop() ?? "").replace(/Trigger$/, ""))
  );
}

function VisNode({
  name, domain, excluded, visible, onToggle,
}: {
  name: string; domain: string | null;
  excluded: boolean; visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1.5"
      style={{
        transition: "opacity 0.45s ease, transform 0.45s ease",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
      }}
    >
      <div className={`relative group h-12 w-12 rounded-xl border flex items-center justify-center transition-all duration-200 ${
        excluded
          ? "bg-slate-900/60 border-slate-800 opacity-35"
          : "bg-slate-800 border-slate-600/60 shadow-md shadow-black/30"
      }`}>
        {domain
          ? <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              className="h-6 w-6 object-contain" alt={name}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          : <span className="text-sm font-bold text-slate-400">{name[0]}</span>
        }
        <button
          onClick={onToggle}
          title={excluded ? "Re-include in recording" : "Exclude from recording"}
          className={`absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full border flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-all duration-150
            ${excluded
              ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/40"
              : "bg-slate-700 border-slate-600 text-slate-500 hover:bg-rose-500/20 hover:border-rose-400/40 hover:text-rose-400"
            }`}
        >
          {excluded ? <Plus size={7} /> : <X size={7} />}
        </button>
      </div>
      <span className={`text-[9px] leading-tight text-center max-w-[52px] truncate transition-colors ${
        excluded ? "line-through text-slate-700" : "text-slate-500"
      }`}>{name}</span>
    </div>
  );
}

function VisConnector({ visible, branch }: { visible: boolean; branch?: boolean }) {
  return (
    <div
      className="flex items-start pt-[22px]"
      style={{ transition: "opacity 0.3s ease", opacity: visible ? 1 : 0 }}
    >
      <div className={`w-5 h-px ${branch ? "bg-indigo-500/30" : "bg-slate-700"}`} />
      <div className={`w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] ${
        branch ? "border-l-indigo-500/40" : "border-l-slate-600"
      }`} />
    </div>
  );
}

function FlowVisualizer({
  apps, nodeTypes, excludedApps, onToggle, catalog,
}: {
  apps: string[];
  nodeTypes: string[];
  excludedApps: Set<string>;
  onToggle: (app: string) => void;
  catalog: Record<string, AppCatalogEntry>;
}) {
  const isBranched = hasBranchNode(nodeTypes);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const timers = apps.map((_, i) =>
      window.setTimeout(() => setVisibleCount(n => Math.max(n, i + 1)), i * 200 + 250)
    );
    return () => timers.forEach(window.clearTimeout);
  }, [apps]);

  const getDomain = (name: string): string | null => {
    const key = Object.keys(catalog).find(k =>
      catalog[k].label.toLowerCase() === name.toLowerCase() ||
      k === name.toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    return key ? catalog[key].domain : null;
  };

  if (apps.length === 0) return null;

  if (!isBranched) {
    return (
      <div className="flex items-start gap-0 flex-wrap">
        {apps.map((app, i) => (
          <div key={app} className="flex items-start">
            <VisNode
              name={app} domain={getDomain(app)}
              excluded={excludedApps.has(app)}
              visible={visibleCount > i}
              onToggle={() => onToggle(app)}
            />
            {i < apps.length - 1 && <VisConnector visible={visibleCount > i} />}
          </div>
        ))}
      </div>
    );
  }

  // Branched — split apps into two rows
  const mid = Math.ceil(apps.length / 2);
  const branchA = apps.slice(0, mid);
  const branchB = apps.slice(mid);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GitBranch size={11} className="text-indigo-400/50" />
        <span className="text-[10px] text-slate-600">Branching flow detected — apps distributed across paths</span>
      </div>
      <div className="space-y-3">
        {/* Branch A */}
        <div className="flex items-start gap-0 pl-3 border-l-2 border-indigo-500/25 flex-wrap">
          {branchA.map((app, i) => (
            <div key={app} className="flex items-start">
              <VisNode
                name={app} domain={getDomain(app)}
                excluded={excludedApps.has(app)}
                visible={visibleCount > i}
                onToggle={() => onToggle(app)}
              />
              {i < branchA.length - 1 && <VisConnector visible={visibleCount > i} branch />}
            </div>
          ))}
        </div>
        {/* Branch B */}
        <div className="flex items-start gap-0 pl-3 border-l-2 border-purple-500/20 flex-wrap">
          {branchB.map((app, i) => (
            <div key={app} className="flex items-start">
              <VisNode
                name={app} domain={getDomain(app)}
                excluded={excludedApps.has(app)}
                visible={visibleCount > i + branchA.length}
                onToggle={() => onToggle(app)}
              />
              {i < branchB.length - 1 && (
                <VisConnector visible={visibleCount > i + branchA.length} branch />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-slate-600 hover:text-slate-300 transition-colors ml-1">
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children, step }: {
  title: string; subtitle?: string; children: React.ReactNode; step: number;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-start gap-3">
        <div className="h-6 w-6 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0 mt-0.5">
          {step}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Connect modal ────────────────────────────────────────────────────────────

function ConnectModal({
  appKey, entry, mirrorId, workspaceId, token, onConnected, onClose,
}: {
  appKey: string; entry: AppCatalogEntry; mirrorId: string;
  workspaceId: string; token: string;
  onConnected: (conn: AppConnection) => void; onClose: () => void;
}) {
  const [credential,    setCredential]    = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  // The webhook URL the user registers in their app
  const webhookUrl = `${API_BASE_URL}/api/app-webhooks/${appKey}?workspaceId=${workspaceId}&mirrorId=${mirrorId}`;

  const save = async () => {
    if (entry.connectionType === "polling" && !credential) {
      setErr("API key required"); return;
    }
    setSaving(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/workflow-mirror/${mirrorId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId, appKey,
          connectionType: entry.connectionType === "polling" ? "polling" : "webhook",
          credential:    credential    || undefined,
          webhookSecret: webhookSecret || undefined,
        }),
      });
      if (!r.ok) { setErr("Failed to save"); setSaving(false); return; }
      onConnected(await r.json());
    } catch { setErr("Network error"); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
          <img src={`https://www.google.com/s2/favicons?domain=${entry.domain}&sz=32`}
            className="h-5 w-5 object-contain" alt={entry.label} />
          <h3 className="text-sm font-semibold text-white">Connect {entry.label}</h3>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Webhook connection */}
          {entry.connectionType !== "polling" && (
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Webhook URL — register this in {entry.label}
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <code className="text-xs text-indigo-300 truncate flex-1">{webhookUrl}</code>
                <CopyBtn text={webhookUrl} />
              </div>
              <div className="mt-4">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Webhook Signing Secret <span className="text-slate-700">(optional — recommended)</span>
                </label>
                <input
                  type="password" value={webhookSecret}
                  onChange={e => setWebhookSecret(e.target.value)}
                  placeholder="Paste your webhook secret…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* API key connection */}
          {entry.connectionType !== "webhook" && (
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                API Key {entry.connectionType === "polling" ? "(required)" : "(optional)"}
              </label>
              <input
                type="password" value={credential}
                onChange={e => setCredential(e.target.value)}
                placeholder={`${entry.label} API key…`}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {err && <p className="text-xs text-rose-400">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Save connection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Event selector ───────────────────────────────────────────────────────────

function EventSelector({
  conn, catalogEntry, mirrorId, token, onUpdated,
}: {
  conn: AppConnection; catalogEntry: AppCatalogEntry; mirrorId: string;
  token: string; onUpdated: (conn: AppConnection) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedKeys = new Set(conn.observedEvents.map(e => e.eventKey));

  const toggle = async (ev: { key: string; label: string }) => {
    const next = new Set(selectedKeys);
    next.has(ev.key) ? next.delete(ev.key) : next.add(ev.key);
    setSaving(true);
    const r = await fetch(
      `${API_BASE_URL}/api/workflow-mirror/${mirrorId}/connections/${conn.id}/events`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          events: catalogEntry.events
            .filter(e => next.has(e.key))
            .map(e => ({ key: e.key, label: e.label, appKey: conn.appKey })),
        }),
      },
    );
    if (r.ok) onUpdated(await r.json());
    setSaving(false);
  };

  // Group events by category
  const byCategory = catalogEntry.events.reduce<Record<string, typeof catalogEntry.events>>((acc, ev) => {
    (acc[ev.category] ??= []).push(ev); return acc;
  }, {});

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
        <Settings2 size={12} />
        {selectedKeys.size === 0 ? "Select events to observe" : `${selectedKeys.size} event${selectedKeys.size !== 1 ? "s" : ""} observed`}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
          {Object.entries(byCategory).map(([cat, evs]) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{cat}</p>
              <div className="space-y-1">
                {evs.map(ev => (
                  <label key={ev.key} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(ev.key)}
                      onChange={() => toggle(ev)}
                      disabled={saving}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 focus:ring-offset-transparent"
                    />
                    <span className="text-xs text-slate-400 group-hover:text-white transition-colors">{ev.label}</span>
                    <code className="text-[9px] text-slate-700 ml-auto font-mono">{ev.key}</code>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App connection row ───────────────────────────────────────────────────────

function AppRow({
  appName, appKey, catalog, conn, mirrorId, workspaceId, token,
  onConnect, onDisconnect, onEventsUpdated,
}: {
  appName: string; appKey: string | null;
  catalog: Record<string, AppCatalogEntry>;
  conn: AppConnection | null;
  mirrorId: string; workspaceId: string; token: string;
  onConnect: (conn: AppConnection) => void;
  onDisconnect: (connId: string) => void;
  onEventsUpdated: (conn: AppConnection) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const entry = appKey ? catalog[appKey] : null;
  const domain = entry?.domain;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {domain
            ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                className="h-6 w-6 object-contain rounded" alt={appName} />
            : <div className="h-6 w-6 rounded bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {appName[0]}
              </div>
          }
          <div>
            <p className="text-sm font-medium text-white">{appName}</p>
            {entry && (
              <div className="flex items-center gap-1.5 mt-0.5">
                {entry.connectionType === "webhook"
                  ? <span className="flex items-center gap-1 text-[9px] text-sky-400"><Webhook size={9} />Webhook</span>
                  : entry.connectionType === "polling"
                  ? <span className="flex items-center gap-1 text-[9px] text-amber-400"><RefreshCw size={9} />Polling</span>
                  : <span className="flex items-center gap-1 text-[9px] text-violet-400"><Link2 size={9} />Webhook + API</span>
                }
                {!appKey && <span className="text-[9px] text-slate-600 italic">— map to known app</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {conn?.status === "connected" && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle2 size={11} />Connected
            </span>
          )}
          {!appKey && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <AlertTriangle size={11} />Unknown step
            </span>
          )}
          {appKey && !conn && (
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium transition-colors">
              <Plug size={11} />Connect
            </button>
          )}
          {conn && (
            <button onClick={() => onDisconnect(conn.id)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Event selector — shown only when connected and catalog entry exists */}
      {conn?.status === "connected" && entry && (
        <div className="mt-3 pt-3 border-t border-slate-800/60">
          <EventSelector
            conn={conn} catalogEntry={entry}
            mirrorId={mirrorId} token={token} onUpdated={onEventsUpdated}
          />
          {conn.lastEventAt && (
            <p className="text-[10px] text-slate-700 mt-2 flex items-center gap-1">
              <Clock size={9} />Last event {fmtDate(conn.lastEventAt)}
            </p>
          )}
        </div>
      )}

      {showModal && entry && (
        <ConnectModal
          appKey={appKey!} entry={entry} mirrorId={mirrorId}
          workspaceId={workspaceId} token={token}
          onConnected={conn => { onConnect(conn); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ─── Correlation feed ─────────────────────────────────────────────────────────

interface CorrelationResult {
  id: string; appKey: string; correlationKey: string; correlationValue: string;
  verified: boolean; discrepancy: string | null; matchedAt: string;
  appEvent: { appKey: string; eventKey: string; receivedAt: string; correlationValue: string | null };
}

function CorrelationFeed({ mirrorId, token }: { mirrorId: string; token: string }) {
  const [results,  setResults]  = useState<CorrelationResult[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workflow-mirror/${mirrorId}/correlation`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setResults(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [mirrorId, token]);

  if (loading) return <p className="text-xs text-slate-600 py-4 text-center">Loading…</p>;
  if (results.length === 0) return (
    <div className="text-center py-8">
      <Activity size={20} className="text-slate-700 mx-auto mb-2" />
      <p className="text-xs text-slate-600">No correlations yet — events will appear here once your connected apps start firing.</p>
    </div>
  );

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
      {results.map(r => (
        <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs ${
          r.verified
            ? "bg-emerald-500/5 border-emerald-500/15"
            : r.discrepancy
            ? "bg-amber-500/5 border-amber-500/15"
            : "bg-slate-900 border-slate-800"
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.verified ? "bg-emerald-400" : r.discrepancy ? "bg-amber-400" : "bg-slate-600"}`} />
          <div className="flex-1 min-w-0">
            <span className="text-slate-300 font-medium">{r.appEvent.eventKey}</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-slate-500 font-mono text-[10px]">{r.correlationValue}</span>
          </div>
          <span className={`text-[10px] font-semibold ${r.verified ? "text-emerald-400" : r.discrepancy ? "text-amber-400" : "text-slate-600"}`}>
            {r.verified ? "Verified" : r.discrepancy ? "Mismatch" : "Matched"}
          </span>
          <span className="text-[10px] text-slate-700 shrink-0">{fmtDate(r.matchedAt)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowMirrorDetailPage() {
  const { id }              = useParams<{ id: string }>();
  const [searchParams]      = useSearchParams();
  const platform            = (searchParams.get("platform") ?? "n8n") as "n8n" | "make";
  const navigate            = useNavigate();

  const [wsId,    setWsId]    = useState("");
  const [token,   setToken]   = useState("");
  const [wfMeta,  setWfMeta]  = useState<WorkflowMeta | null>(null);
  const [mirror,  setMirror]  = useState<Mirror | null>(null);
  const [catalog, setCatalog] = useState<Record<string, AppCatalogEntry>>({});
  const [loading, setLoading] = useState(true);

  // Unknown app mappings: "HTTP Request" → appKey
  const [unknownMap, setUnknownMap] = useState<Record<string, string>>({});

  // Excluded apps (not recorded by iqpipe)
  const [excludedApps, setExcludedApps] = useState<Set<string>>(new Set());

  // Correlation key selection
  const [corrKey, setCorrKey] = useState<string>("");
  const [savingKey, setSavingKey] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = localStorage.getItem("iqpipe_token") ?? "";
    setToken(t);
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWsId(d.id); })
      .catch(() => {});
  }, []);

  const loadAll = useCallback(async (wsId: string, t: string) => {
    if (!wsId || !id) return;

    // Fetch app catalog
    const catRes = await fetch(`${API_BASE_URL}/api/workflow-mirror/app-catalog`,
      { headers: { Authorization: `Bearer ${t}` } });
    const cat: Record<string, AppCatalogEntry> = catRes.ok ? await catRes.json() : {};
    setCatalog(cat);

    // Fetch workflow metadata
    const wfUrl = platform === "n8n"
      ? `${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`
      : `${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`;
    const wfRes  = await fetch(wfUrl, { headers: { Authorization: `Bearer ${t}` } });
    const wfList = wfRes.ok ? await wfRes.json() : [];
    const wf = wfList.find((w: WorkflowMeta) => w.id === id) ?? null;
    setWfMeta(wf);

    // Restore excluded apps from saved event filter (whitelist → invert to excluded)
    if (wf?.eventFilter?.enabled && wf.eventFilter.apps.length > 0) {
      const whitelisted = new Set(wf.eventFilter.apps);
      const excluded = new Set((wf.appsUsed ?? []).filter(a => !whitelisted.has(a)));
      setExcludedApps(excluded);
    }

    // Fetch mirror config
    const mirRes = await fetch(
      `${API_BASE_URL}/api/workflow-mirror?workspaceId=${wsId}&workflowId=${id}`,
      { headers: { Authorization: `Bearer ${t}` } },
    );
    const m: Mirror | null = mirRes.ok ? await mirRes.json() : null;
    setMirror(m);
    if (m?.correlationKey) setCorrKey(m.correlationKey);
    if (m?.unknownMappings) {
      try { setUnknownMap(JSON.parse(m.unknownMappings)); } catch { /* ignore */ }
    }

    setLoading(false);
  }, [id, platform]);

  useEffect(() => {
    if (wsId && token) loadAll(wsId, token);
  }, [wsId, token, loadAll]);

  // ── Upsert mirror helper ──────────────────────────────────────────────────
  const upsertMirror = useCallback(async (
    patch: { correlationKey?: string; unknownMappings?: Record<string, string> }
  ): Promise<Mirror> => {
    const r = await fetch(`${API_BASE_URL}/api/workflow-mirror`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId:     wsId,
        workflowId:      id,
        platform,
        correlationKey:  patch.correlationKey  ?? mirror?.correlationKey  ?? null,
        unknownMappings: patch.unknownMappings ?? (mirror?.unknownMappings ? JSON.parse(mirror.unknownMappings) : {}),
      }),
    });
    const updated = await r.json();
    setMirror(prev => ({ ...(prev ?? updated), ...updated }));
    return updated;
  }, [wsId, id, platform, token, mirror]);

  // ── Correlation key save ──────────────────────────────────────────────────
  const saveCorrelationKey = async () => {
    setSavingKey(true);
    await upsertMirror({ correlationKey: corrKey });
    setSavingKey(false);
  };

  // ── App connection handlers ───────────────────────────────────────────────
  const handleConnect = (conn: AppConnection) => {
    setMirror(prev => {
      if (!prev) return prev;
      const filtered = prev.appConnections.filter(c => c.appKey !== conn.appKey);
      return { ...prev, appConnections: [...filtered, conn] };
    });
  };

  const handleDisconnect = async (connId: string) => {
    if (!mirror) return;
    await fetch(`${API_BASE_URL}/api/workflow-mirror/${mirror.id}/connections/${connId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    setMirror(prev => prev
      ? { ...prev, appConnections: prev.appConnections.filter(c => c.id !== connId) }
      : prev
    );
  };

  const handleEventsUpdated = (conn: AppConnection) => {
    setMirror(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        appConnections: prev.appConnections.map(c => c.id === conn.id ? conn : c),
      };
    });
  };

  // ── Unknown app mapping ───────────────────────────────────────────────────
  const mapUnknown = async (nodeName: string, appKey: string) => {
    const next = { ...unknownMap, [nodeName]: appKey };
    setUnknownMap(next);
    // Ensure mirror exists first
    if (!mirror) await upsertMirror({ unknownMappings: next });
    else          await upsertMirror({ unknownMappings: next });
  };

  // ── Exclude / include app from recording ─────────────────────────────────
  const toggleExclude = useCallback(async (appName: string) => {
    if (!wfMeta) return;
    const next = new Set(excludedApps);
    next.has(appName) ? next.delete(appName) : next.add(appName);
    setExcludedApps(next);

    const allApps   = wfMeta.appsUsed ?? [];
    const whitelist = allApps.filter(a => !next.has(a));
    const nativeId  = wfMeta.n8nId ?? wfMeta.makeId ?? "";
    if (!nativeId || !wsId) return;

    const endpoint = platform === "n8n" ? "n8n-connect" : "make-connect";
    await fetch(`${API_BASE_URL}/api/${endpoint}/event-filter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        workspaceId: wsId,
        n8nId: nativeId,
        execSyncEnabled: true,
        filter: { enabled: next.size > 0, apps: whitelist, eventTypes: [] },
      }),
    }).catch(() => {});
  }, [excludedApps, wfMeta, wsId, token, platform]);

  // ── Derive app list from appsUsed + unknown mappings ─────────────────────
  const UNKNOWN_NODES = new Set(["HTTP Request", "Webhook"]);
  const detectedApps = wfMeta?.appsUsed ?? [];

  const appRows: Array<{ displayName: string; appKey: string | null; isUnknown: boolean }> =
    detectedApps.map(name => {
      if (UNKNOWN_NODES.has(name)) {
        const mapped = unknownMap[name];
        return { displayName: name, appKey: mapped ?? null, isUnknown: true };
      }
      const key = appNameToKey(name, catalog);
      return { displayName: name, appKey: key, isUnknown: false };
    });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-950">
      <RefreshCw size={20} className="animate-spin text-slate-600" />
    </div>
  );

  if (!wfMeta) return (
    <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-500 text-sm">
      Automation not found.
    </div>
  );

  const mirrorId = mirror?.id ?? "";

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 min-h-0">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ── Back + Header ── */}
        <div>
          <button onClick={() => navigate("/my-workflow")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-5">
            <ArrowLeft size={14} />Back to Workflow Mirrors
          </button>

          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
              <GitBranch size={18} className="text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-white">{wfMeta.name}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  platform === "n8n"
                    ? "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20"
                    : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                }`}>{platform === "n8n" ? "n8n" : "Make.com"}</span>
                {wfMeta.active
                  ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Active</span>
                  : <span className="text-[10px] text-slate-600">Inactive</span>
                }
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {wfMeta.nodeCount} nodes · {detectedApps.length} apps detected
              </p>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-[10px] font-mono text-slate-700">{wfMeta.id}</p>
                <CopyBtn text={wfMeta.id} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Flow Visualizer ── */}
        {detectedApps.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Flow Mirror</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  iqpipe detected {detectedApps.length} app{detectedApps.length !== 1 ? "s" : ""} in this flow.
                  Hover any node to exclude it from recording.
                </p>
              </div>
              {excludedApps.size > 0 && (
                <span className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 shrink-0">
                  <AlertTriangle size={10} />
                  {excludedApps.size} excluded
                </span>
              )}
            </div>
            <FlowVisualizer
              apps={detectedApps}
              nodeTypes={wfMeta.nodeTypes ?? []}
              excludedApps={excludedApps}
              onToggle={toggleExclude}
              catalog={catalog}
            />
          </div>
        )}

        {/* ── Step 1: Detected Apps ── */}
        <Section step={1} title="Detected Apps"
          subtitle="Apps found in this workflow. Connect each one to capture direct outcome events.">
          {appRows.length === 0 ? (
            <p className="text-xs text-slate-600">No apps detected in this workflow.</p>
          ) : (
            <div className="space-y-3">
              {appRows.map(row => {
                const conn = mirror?.appConnections.find(c =>
                  c.appKey === row.appKey
                ) ?? null;
                return (
                  <div key={row.displayName}>
                    {/* Unknown node mapping */}
                    {row.isUnknown && !row.appKey && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs text-amber-400 font-medium">{row.displayName}</span>
                        <span className="text-xs text-slate-600">→ map to:</span>
                        <select
                          value=""
                          onChange={e => { if (e.target.value) mapUnknown(row.displayName, e.target.value); }}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 appearance-none"
                        >
                          <option value="">— select app —</option>
                          {Object.entries(catalog).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <AppRow
                      appName={row.isUnknown && row.appKey ? (catalog[row.appKey]?.label ?? row.displayName) : row.displayName}
                      appKey={row.appKey}
                      catalog={catalog}
                      conn={conn}
                      mirrorId={mirrorId || "pending"}
                      workspaceId={wsId}
                      token={token}
                      onConnect={async (newConn) => {
                        // Create mirror first if it doesn't exist yet
                        if (!mirror) await upsertMirror({});
                        handleConnect(newConn);
                      }}
                      onDisconnect={handleDisconnect}
                      onEventsUpdated={handleEventsUpdated}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Step 2: Correlation Key ── */}
        <Section step={2} title="Correlation Key"
          subtitle="The single shared identifier used to match automation executions to app events across all steps.">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "email",  label: "Email address",  desc: "Most reliable — present in almost every GTM event" },
                { key: "domain", label: "Company domain", desc: "Good for account-level tracking" },
                { key: "phone",  label: "Phone number",   desc: "Use when email is unavailable" },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setCorrKey(opt.key)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    corrKey === opt.key
                      ? "bg-indigo-500/10 border-indigo-500/30 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {corrKey === opt.key
                      ? <CheckCircle2 size={13} className="text-indigo-400" />
                      : <Circle size={13} className="text-slate-700" />
                    }
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-600">{opt.desc}</p>
                </button>
              ))}
            </div>

            <button
              onClick={saveCorrelationKey}
              disabled={!corrKey || savingKey}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors disabled:opacity-40"
            >
              {savingKey ? "Saving…" : "Save correlation key"}
            </button>

            {mirror?.correlationKey && (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={10} />
                Correlation key set to <strong className="font-mono">{mirror.correlationKey}</strong>
              </p>
            )}
          </div>
        </Section>

        {/* ── Step 3: Correlation Feed ── */}
        <Section step={3} title="Live Correlation Feed"
          subtitle="Recent matches between automation execution events and direct app events.">
          {mirrorId
            ? <CorrelationFeed mirrorId={mirrorId} token={token} />
            : <p className="text-xs text-slate-600 py-4 text-center">Complete steps 1 and 2 to enable the correlation feed.</p>
          }
        </Section>

        {/* ── Webhook reference ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Key size={14} className="text-slate-500" />
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Webhook endpoint reference</h3>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Each connected app posts events to this URL pattern. The <code className="text-indigo-400">mirrorId</code> is set automatically when you connect an app.
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
            <code className="text-xs text-slate-500 truncate flex-1">
              {API_BASE_URL}/api/app-webhooks/<span className="text-indigo-400">:appKey</span>?workspaceId=<span className="text-fuchsia-400">{wsId}</span>&mirrorId=<span className="text-amber-400">{mirrorId || "…"}</span>
            </code>
            <ExternalLink size={11} className="text-slate-700 shrink-0" />
          </div>
        </div>

      </div>
    </div>
  );
}
