import { useState, useRef, useCallback, useEffect } from "react";
import { adminFetch } from "./useAdmin";
import {
  Play, Loader2, Database, AlertTriangle, Clock,
  ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";

// ── Query history persisted in sessionStorage ─────────────────────────────────

const HISTORY_KEY = "iqpipe_admin_sql_history";
const MAX_HISTORY = 20;

function loadHistory(): string[] {
  try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]"); }
  catch { return []; }
}

function saveHistory(q: string, prev: string[]): string[] {
  const next = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

// ── Starter queries shown as quick-access chips ───────────────────────────────

const QUICK_QUERIES = [
  {
    label: "Recent touchpoints",
    sql:   `SELECT "workspaceId", tool, channel, "eventType", "recordedAt"\nFROM "Touchpoint"\nORDER BY "recordedAt" DESC\nLIMIT 50`,
  },
  {
    label: "Recent leads",
    sql:   `SELECT email, company, source, "createdAt", "workspaceId"\nFROM "Lead"\nORDER BY "createdAt" DESC\nLIMIT 50`,
  },
  {
    label: "Recent deals",
    sql:   `SELECT name, stage, amount, currency, "createdAt", "workspaceId"\nFROM "Deal"\nORDER BY "createdAt" DESC\nLIMIT 50`,
  },
  {
    label: "Events per workspace",
    sql:   `SELECT "workspaceId", COUNT(*) AS events\nFROM "Touchpoint"\nGROUP BY "workspaceId"\nORDER BY events DESC\nLIMIT 30`,
  },
  {
    label: "Active users (30d)",
    sql:   `SELECT u.email, u."fullName", MAX(t."recordedAt") AS last_event\nFROM "Touchpoint" t\nJOIN "WorkspaceUser" wu ON wu."workspaceId" = t."workspaceId"\nJOIN "User" u ON u.id = wu."userId"\nWHERE t."recordedAt" > NOW() - INTERVAL '30 days'\nGROUP BY u.id, u.email, u."fullName"\nORDER BY last_event DESC\nLIMIT 50`,
  },
  {
    label: "Plan distribution",
    sql:   `SELECT plan, COUNT(*) AS workspaces\nFROM "Workspace"\nGROUP BY plan\nORDER BY workspaces DESC`,
  },
  {
    label: "Recent activities",
    sql:   `SELECT type, subject, status, "createdAt", "workspaceId"\nFROM "Activity"\nORDER BY "createdAt" DESC\nLIMIT 50`,
  },
  {
    label: "Top tools by events",
    sql:   `SELECT tool, COUNT(*) AS events\nFROM "Touchpoint"\nGROUP BY tool\nORDER BY events DESC\nLIMIT 20`,
  },
];

// ── Result table ──────────────────────────────────────────────────────────────

function ResultTable({ columns, rows }: { columns: string[]; rows: any[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500 px-4 py-6 text-center">Query returned 0 rows.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs font-mono">
        <thead className="border-b border-slate-700 bg-slate-950/60">
          <tr>
            {columns.map((col) => (
              <th key={col} className="text-left px-3 py-2 text-slate-400 font-semibold whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-800/30 transition-colors">
              {columns.map((col) => {
                const val = row[col];
                const display =
                  val === null || val === undefined ? (
                    <span className="text-slate-600 italic">null</span>
                  ) : typeof val === "object" ? (
                    <span className="text-amber-400">{JSON.stringify(val)}</span>
                  ) : typeof val === "boolean" ? (
                    <span className={val ? "text-emerald-400" : "text-rose-400"}>{String(val)}</span>
                  ) : String(val).length > 80 ? (
                    <span title={String(val)}>{String(val).slice(0, 80)}…</span>
                  ) : (
                    String(val)
                  );

                return (
                  <td key={col} className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-xs overflow-hidden">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminActivityPage() {
  const [query,   setQuery]   = useState("");
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<{
    rows: any[]; columns: string[]; count: number; query: string; ms: number;
  } | null>(null);
  const [error,   setError]   = useState("");
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runQuery = useCallback(async (sql = query) => {
    const q = sql.trim();
    if (!q) return;

    setRunning(true);
    setError("");
    setResult(null);

    const t0 = Date.now();
    try {
      const data = await adminFetch<{
        rows: any[]; columns: string[]; count: number; query: string;
      }>("/sql", {
        method: "POST",
        body:   JSON.stringify({ query: q }),
      });
      setResult({ ...data, ms: Date.now() - t0 });
      setHistory((prev) => saveHistory(q, prev));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }, [query]);

  // Ctrl+Enter / Cmd+Enter to run
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };

  const copyQuery = () => {
    if (!result?.query) return;
    navigator.clipboard.writeText(result.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Auto-focus editor on mount
  useEffect(() => { textareaRef.current?.focus(); }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Activity</h1>
        <p className="text-xs text-slate-500">
          Run a SQL <code className="text-indigo-400">SELECT</code> query to explore activity data.
          Nothing is fetched until you run a query.
        </p>
      </div>

      {/* Quick-query chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_QUERIES.map((q) => (
          <button
            key={q.label}
            onClick={() => { setQuery(q.sql); setTimeout(() => runQuery(q.sql), 0); }}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden focus-within:border-indigo-500/60 transition-colors">
        {/* Editor toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Database size={11} className="text-indigo-400" />
            <span>PostgreSQL · SELECT only · max 500 rows</span>
          </div>
          <div className="flex items-center gap-2">
            {/* History toggle */}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Clock size={10} />
                History
                {showHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
            )}

            <button
              onClick={() => runQuery()}
              disabled={running || !query.trim()}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-[11px] font-semibold text-white transition-colors"
            >
              {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              {running ? "Running…" : "Run"}
              <span className="opacity-50 text-[10px] hidden sm:inline ml-0.5">⌘↵</span>
            </button>
          </div>
        </div>

        {/* History dropdown */}
        {showHistory && (
          <div className="border-b border-slate-800 bg-slate-950/60 max-h-48 overflow-y-auto">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => { setQuery(h); setShowHistory(false); textareaRef.current?.focus(); }}
                className="w-full text-left px-4 py-2 hover:bg-slate-800/60 text-[11px] font-mono text-slate-400 hover:text-slate-200 transition-colors border-b border-slate-800/40 last:border-0 truncate"
              >
                {h.replace(/\s+/g, " ").slice(0, 120)}
              </button>
            ))}
          </div>
        )}

        {/* SQL textarea */}
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={6}
          spellCheck={false}
          placeholder={`SELECT "workspaceId", tool, "eventType", "recordedAt"\nFROM "Touchpoint"\nORDER BY "recordedAt" DESC\nLIMIT 50`}
          className="w-full bg-transparent px-4 py-3 text-xs font-mono text-slate-200 placeholder-slate-700 resize-y focus:outline-none leading-relaxed"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3 text-xs text-rose-400 font-mono">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && !error && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Result meta bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-emerald-400 font-semibold">{result.count} row{result.count !== 1 ? "s" : ""}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">{result.ms}ms</span>
              {result.count === 500 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-amber-400">result capped at 500 rows</span>
                </>
              )}
            </div>
            <button
              onClick={copyQuery}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-200 transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy query"}
            </button>
          </div>

          <ResultTable columns={result.columns} rows={result.rows} />
        </div>
      )}

      {/* Empty state — shown only before first query */}
      {!result && !error && !running && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-700 space-y-2">
          <Database size={32} strokeWidth={1.5} />
          <p className="text-sm">Write a query and press <kbd className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-400">⌘↵</kbd> or click Run</p>
          <p className="text-xs">Only <span className="text-indigo-500 font-mono">SELECT</span> statements allowed</p>
        </div>
      )}
    </div>
  );
}
