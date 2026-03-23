import { useEffect, useState } from "react";
import { adminFetch } from "./useAdmin";
import { Send, Clock, Loader2, Users, User, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

interface MailLog {
  id:        string;
  subject:   string;
  to:        string | string[];
  sent:      number;
  failed:    number;
  createdAt: string;
}

type RecipientMode = "all" | "single" | "list";

export default function AdminMailingPage() {
  const [mode,      setMode]      = useState<RecipientMode>("all");
  const [toEmail,   setToEmail]   = useState("");
  const [toList,    setToList]    = useState(""); // comma-separated
  const [subject,   setSubject]   = useState("");
  const [html,      setHtml]      = useState("");
  const [sending,   setSending]   = useState(false);
  const [result,    setResult]    = useState<{ sent: number; failed: number; errors: string[] } | null>(null);
  const [sendError, setSendError] = useState("");

  const [logs,        setLogs]       = useState<MailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await adminFetch<{ logs: MailLog[] }>("/mail/logs");
      setLogs(data.logs);
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  };

  useEffect(() => { loadLogs(); }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true); setResult(null); setSendError("");

    let to: string | string[];
    if (mode === "all")    to = "all";
    else if (mode === "single") to = toEmail.trim();
    else to = toList.split(",").map((s) => s.trim()).filter(Boolean);

    try {
      const data = await adminFetch<{ sent: number; failed: number; errors: string[] }>("/mail/send", {
        method: "POST",
        body:   JSON.stringify({ to, subject, html }),
      });
      setResult(data);
      if (data.sent > 0) { setSubject(""); setHtml(""); setToEmail(""); setToList(""); }
      await loadLogs();
    } catch (e: any) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-100">Mailing</h1>
        <p className="text-xs text-slate-500">Send emails to users directly from the admin panel</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <form onSubmit={handleSend} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">Compose email</h2>

          {/* Recipient mode */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Recipients</label>
            <div className="flex gap-2">
              {([
                { key: "all",    label: "All users",  icon: Users },
                { key: "single", label: "One user",   icon: User  },
                { key: "list",   label: "CSV list",   icon: Users },
              ] as { key: RecipientMode; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    mode === key
                      ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
                      : "border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-600"
                  }`}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "single" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email address</label>
              <input
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {mode === "list" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Emails (comma-separated)</label>
              <textarea
                value={toList}
                onChange={(e) => setToList(e.target.value)}
                placeholder="user1@example.com, user2@example.com"
                rows={2}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Your email subject"
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Body (HTML supported)</label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<p>Hello,</p><p>Your message here.</p>"
              rows={8}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y font-mono"
            />
          </div>

          {sendError && (
            <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {sendError}
            </div>
          )}

          {result && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${result.failed === 0 ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border border-amber-500/20 text-amber-400"}`}>
              <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              <span>Sent: {result.sent} · Failed: {result.failed}{result.errors.length > 0 ? ` · ${result.errors[0]}` : ""}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? "Sending…" : mode === "all" ? "Send to all users" : "Send email"}
          </button>
        </form>

        {/* Logs */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Send history</h2>
            <button onClick={loadLogs} className="text-slate-500 hover:text-slate-200 transition-colors">
              <RefreshCw size={12} />
            </button>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center h-24 gap-2 text-slate-500 text-xs">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-600">No emails sent yet.</div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[28rem]">
              {logs.map((log) => (
                <div key={log.id} className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate">{log.subject}</span>
                    <span className={`text-[10px] shrink-0 font-semibold ${log.failed === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                      {log.sent}✓ {log.failed > 0 ? `${log.failed}✗` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-600">
                    <Clock size={10} />
                    {new Date(log.createdAt).toLocaleString()}
                    <span>·</span>
                    <span>to: {log.to === "all" ? "all users" : Array.isArray(log.to) ? `${log.to.length} recipients` : log.to}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
