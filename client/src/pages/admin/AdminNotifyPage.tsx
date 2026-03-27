import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "./useAdmin";
import { Bell, Send, Loader2, CheckCircle2, AlertTriangle, Info, ChevronDown } from "lucide-react";

type Target   = "all" | "workspace" | "user";
type Severity = "info" | "warning" | "error";

interface WorkspaceOption { id: string; name: string; plan: string; }
interface UserOption      { id: string; email: string; fullName: string; workspaceId: string; }

interface HistoryRow {
  id:          string;
  title:       string;
  body:        string;
  severity:    string;
  type:        string;
  workspaceId: string;
  userId:      string | null;
  createdAt:   string;
}

const SEV_STYLES: Record<Severity, string> = {
  info:    "bg-sky-500/15 text-sky-400 border-sky-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  error:   "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const SEV_ICON: Record<Severity, React.ReactNode> = {
  info:    <Info size={12} />,
  warning: <AlertTriangle size={12} />,
  error:   <AlertTriangle size={12} />,
};

export default function AdminNotifyPage() {
  // ── form state ───────────────────────────────────────────────────────────
  const [target,      setTarget]      = useState<Target>("all");
  const [severity,    setSeverity]    = useState<Severity>("info");
  const [title,       setTitle]       = useState("");
  const [body,        setBody]        = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [userId,      setUserId]      = useState("");

  // ── options for pickers ──────────────────────────────────────────────────
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [users,      setUsers]      = useState<UserOption[]>([]);
  const [loadingWs,  setLoadingWs]  = useState(false);
  const [loadingU,   setLoadingU]   = useState(false);

  // ── send state ───────────────────────────────────────────────────────────
  const [sending,  setSending]  = useState(false);
  const [success,  setSuccess]  = useState<string | null>(null);
  const [sendErr,  setSendErr]  = useState<string | null>(null);

  // ── history ──────────────────────────────────────────────────────────────
  const [history,     setHistory]     = useState<HistoryRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  // ── load workspaces when target needs it ─────────────────────────────────
  useEffect(() => {
    if (target !== "workspace" && target !== "user") return;
    if (workspaces.length > 0) return;
    setLoadingWs(true);
    adminFetch<{ workspaces: WorkspaceOption[] }>("/workspaces?limit=200")
      .then(d => setWorkspaces(d.workspaces))
      .catch(() => {})
      .finally(() => setLoadingWs(false));
  }, [target, workspaces.length]);

  // ── load users when target = user and a workspace is picked ──────────────
  useEffect(() => {
    if (target !== "user" || !workspaceId) { setUsers([]); setUserId(""); return; }
    setLoadingU(true);
    adminFetch<{ users: any[] }>(`/users?limit=200`)
      .then(d => {
        setUsers(d.users.filter((u: any) => u.workspace?.id === workspaceId));
        setUserId("");
      })
      .catch(() => {})
      .finally(() => setLoadingU(false));
  }, [target, workspaceId]);

  // ── load history ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      const d = await adminFetch<{ notifications: HistoryRow[] }>("/notify/history");
      setHistory(d.notifications);
    } catch { /* silent */ } finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── send ─────────────────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setSendErr(null);

    if (!title.trim() || !body.trim()) { setSendErr("Title and message are required."); return; }
    if (target === "workspace" && !workspaceId) { setSendErr("Please select a workspace."); return; }
    if (target === "user" && (!workspaceId || !userId)) { setSendErr("Please select a workspace and a user."); return; }

    setSending(true);
    try {
      const result = await adminFetch<{ ok: boolean; count: number }>("/notify", {
        method: "POST",
        body:   JSON.stringify({ title: title.trim(), body: body.trim(), severity, target, workspaceId: workspaceId || undefined, userId: userId || undefined }),
      });
      setSuccess(`Sent to ${result.count} workspace${result.count !== 1 ? "s" : ""}.`);
      setTitle("");
      setBody("");
      loadHistory();
    } catch (err: any) {
      setSendErr(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
          <Bell size={15} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-100">Send Notification</h1>
          <p className="text-xs text-slate-500 mt-0.5">Push a message to users' bell notification feed</p>
        </div>
      </div>

      {/* Compose form */}
      <form onSubmit={handleSend} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">

        {/* Target + Severity row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Recipients</label>
            <div className="relative">
              <select
                value={target}
                onChange={e => { setTarget(e.target.value as Target); setWorkspaceId(""); setUserId(""); }}
                className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 pr-8"
              >
                <option value="all">All users</option>
                <option value="workspace">Specific workspace</option>
                <option value="user">Specific user</option>
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Severity</label>
            <div className="relative">
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as Severity)}
                className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 pr-8"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Workspace picker */}
        {(target === "workspace" || target === "user") && (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Workspace</label>
            {loadingWs ? (
              <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" /> Loading…</div>
            ) : (
              <div className="relative">
                <select
                  value={workspaceId}
                  onChange={e => setWorkspaceId(e.target.value)}
                  className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 pr-8"
                >
                  <option value="">— select workspace —</option>
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.id}>{ws.name} ({ws.plan})</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* User picker */}
        {target === "user" && workspaceId && (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">User</label>
            {loadingU ? (
              <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" /> Loading…</div>
            ) : users.length === 0 ? (
              <p className="text-xs text-slate-600">No users found in this workspace.</p>
            ) : (
              <div className="relative">
                <select
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 pr-8"
                >
                  <option value="">— select user —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New feature available"
            maxLength={120}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your notification message…"
            rows={4}
            maxLength={1000}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none leading-relaxed"
          />
          <p className="text-right text-[10px] text-slate-600 mt-1">{body.length} / 1000</p>
        </div>

        {/* Feedback */}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
            <CheckCircle2 size={14} /> {success}
          </div>
        )}
        {sendErr && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            <AlertTriangle size={14} /> {sendErr}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? "Sending…" : "Send notification"}
          </button>
        </div>
      </form>

      {/* History */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent sent notifications</h2>

        {loadingHist ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
            <Loader2 size={14} className="animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-600 py-6 text-center">No notifications sent yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(n => (
              <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-start gap-3">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 mt-0.5 ${SEV_STYLES[n.severity as Severity] ?? SEV_STYLES.info}`}>
                  {SEV_ICON[n.severity as Severity] ?? SEV_ICON.info}
                  {n.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{n.title}</span>
                    <span className="text-[10px] text-slate-600 shrink-0">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-700">
                      {n.type === "admin_broadcast" ? (n.userId ? "workspace" : "broadcast") : "user"}
                    </span>
                    <span className="text-[10px] text-slate-700 font-mono truncate">{n.workspaceId}</span>
                    {n.userId && <span className="text-[10px] text-slate-700 font-mono truncate">{n.userId}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
