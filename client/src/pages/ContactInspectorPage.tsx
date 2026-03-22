import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  User,
  Building2,
  Briefcase,
  Fingerprint,
  Clock,
  Terminal,
  Copy,
  Check,
  Zap,
  ChevronLeft,
  ArrowUpDown,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContactInfo {
  id: string;
  displayName: string;
  company: string | null;
  title: string | null;
  email: string | null;
}

interface TimelineEvent {
  id: string;
  tool: string;
  toolLabel: string;
  channel: string;
  eventType: string;
  recordedAt: string;
  meta: Record<string, unknown> | null;
}

interface TimelineResult {
  found: boolean;
  contact: ContactInfo | null;
  activeSequences: string[];
  events: TimelineEvent[];
}

interface ContactRow {
  id: string;
  displayName: string;
  company: string | null;
  title: string | null;
  email: string | null;
  eventCount: number;
  lastTool: string | null;
  lastEvent: string | null;
  lastAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHANNEL_COLOR: Record<string, string> = {
  email:       "text-blue-400 bg-blue-500/10 border-blue-500/20",
  linkedin:    "text-sky-400 bg-sky-500/10 border-sky-500/20",
  enrichment:  "text-violet-400 bg-violet-500/10 border-violet-500/20",
  crm:         "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  billing:     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  prospecting: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  automation:  "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
};
function channelColor(ch: string) { return CHANNEL_COLOR[ch] ?? "text-slate-400 bg-slate-700/30 border-slate-700"; }

const EVENT_COLOR: Record<string, string> = {
  reply_received:      "text-emerald-400",
  meeting_booked:      "text-emerald-300",
  deal_won:            "text-amber-400",
  deal_created:        "text-amber-300",
  lead_imported:       "text-slate-400",
  lead_enriched:       "text-violet-400",
  sequence_started:    "text-blue-400",
  email_opened:        "text-blue-300",
  connection_accepted: "text-sky-400",
};
function eventColor(ev: string) { return EVENT_COLOR[ev] ?? "text-slate-400"; }

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function absDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: TimelineEvent }) {
  const [open, setOpen] = useState(false);
  const hasMeta = ev.meta && Object.keys(ev.meta).length > 0;

  return (
    <div className="relative pl-8 group">
      <div className="absolute left-3 top-4 w-2 h-2 rounded-full bg-slate-700 group-hover:bg-indigo-500/60 transition-colors" />
      <div className="absolute left-3.5 top-6 bottom-0 w-px bg-slate-800/60" />

      <div
        className="ml-4 mb-1 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/30 transition-colors cursor-pointer"
        onClick={() => hasMeta && setOpen((o) => !o)}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="mt-0.5 shrink-0 w-4">
            {hasMeta ? (
              open ? <ChevronDown size={13} className="text-slate-500" /> : <ChevronRight size={13} className="text-slate-600" />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-200">{ev.toolLabel}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${channelColor(ev.channel)}`}>
                {ev.channel}
              </span>
              <code className={`text-[11px] font-mono font-semibold ${eventColor(ev.eventType)}`}>
                {ev.eventType}
              </code>
            </div>
            {ev.meta && !open && (
              <p className="text-[11px] text-slate-600 mt-0.5 truncate max-w-sm">
                {Object.entries(ev.meta)
                  .filter(([k]) => !["via", "viaAutomation", "note"].includes(k))
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-500 tabular-nums">{relTime(ev.recordedAt)}</p>
            <p className="text-[10px] text-slate-700 mt-0.5">{absDate(ev.recordedAt)}</p>
          </div>
        </div>
        {open && hasMeta && (
          <div className="px-4 pb-3 pt-0 border-t border-slate-800/40">
            <pre className="text-[11px] font-mono text-slate-400 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto leading-relaxed">
              {JSON.stringify(ev.meta, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overlap API docs ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function OverlapApiDocs({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const token = localStorage.getItem("iqpipe_token") ?? "<your-token>";
  const baseUrl = `${API_BASE_URL}/api/overlap-check`;

  const curlSnippet =
`curl "${baseUrl}?workspaceId=${workspaceId}&email=CONTACT_EMAIL" \\
  -H "Authorization: Bearer ${token}"`;

  const n8nSnippet =
`// n8n HTTP Request node
Method: GET
URL: ${baseUrl}
Query params:
  workspaceId = ${workspaceId}
  email       = {{ $json.email }}
Headers:
  Authorization = Bearer ${token}

// IF node condition:
{{ $json.active === false }}
// true  → proceed with enrollment
// false → skip (already being touched)`;

  const makeSnippet =
`// Make.com HTTP module
Method: GET
URL: ${baseUrl}?workspaceId=${workspaceId}&email={{email}}
Headers:
  Authorization: Bearer ${token}

// Router: active = false → enroll | active = true → skip`;

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-900/40 transition-colors"
      >
        <Terminal size={14} className="text-indigo-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Prevent this automatically</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Call the Overlap Check API from n8n or Make before enrolling contacts
          </p>
        </div>
        <ChevronDown size={14} className={`text-slate-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-slate-800 px-4 py-4 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Before enrolling a contact in a sequence, call this endpoint. If <code className="text-indigo-300 bg-slate-800 px-1 rounded">active</code> is <code className="text-rose-300 bg-slate-800 px-1 rounded">true</code>, skip them — they're already being touched by another tool.
          </p>
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Response</p>
            <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto leading-relaxed">{`{
  "active": true,
  "contact": { "id": "iq_4x9f2ma1", "displayName": "S**** M." },
  "sequences": [
    { "tool": "heyreach", "toolLabel": "HeyReach",
      "channel": "linkedin", "sinceHours": 18.4,
      "lastEvent": "connection_sent" }
  ],
  "checkedAt": "2026-03-19T14:32:00.000Z"
}`}</pre>
          </div>
          {[
            { label: "cURL",      text: curlSnippet },
            { label: "n8n",       text: n8nSnippet  },
            { label: "Make.com",  text: makeSnippet  },
          ].map(({ label, text }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{label}</p>
                <CopyButton text={text} />
              </div>
              <pre className="text-[11px] font-mono text-slate-400 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto leading-relaxed whitespace-pre-wrap">{text}</pre>
            </div>
          ))}
          <p className="text-[10px] text-slate-600">
            Also accepts <code className="text-slate-500">?token=&lt;jwt&gt;</code> query param if your tool can't set headers.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactInspectorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("email") ?? "";

  const [query, setQuery]           = useState(initialQuery);
  const [submitted, setSubmitted]   = useState(initialQuery);
  const [result, setResult]         = useState<TimelineResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");

  // Browse list
  const [contacts, setContacts]             = useState<ContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [listSearch, setListSearch]         = useState("");
  const [sortBy, setSortBy]                 = useState<"events" | "recent" | "name">("recent");
  const [page, setPage]                     = useState(0);
  const PAGE_SIZE = 20;

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  // Load contact browse list
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`${API_BASE_URL}/api/signal-health/contacts?workspaceId=${workspaceId}&limit=500`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setContactsLoading(false));
  }, [workspaceId]);

  const lookup = useCallback(async (email: string, wsId: string) => {
    if (!email.trim() || !wsId) return;
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ workspaceId: wsId, email: email.trim() });
      const r = await fetch(`${API_BASE_URL}/api/signal-health/timeline?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (r.ok) setResult(await r.json());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery && workspaceId) lookup(initialQuery, workspaceId);
  }, [initialQuery, workspaceId, lookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSubmitted("");
      setResult(null);
      setSearchParams({});
      setPage(0);
      return;
    }
    setSubmitted(query);
    setSearchParams({ email: query });
    lookup(query, workspaceId);
  };

  const handleBack = () => {
    setQuery("");
    setSubmitted("");
    setResult(null);
    setSearchParams({});
    setPage(0);
  };

  const selectContact = (email: string) => {
    setQuery(email);
    setSubmitted(email);
    setSearchParams({ email });
    lookup(email, workspaceId);
  };

  const toolsUsed = result?.found ? [...new Set(result.events.map((e) => e.toolLabel))] : [];

  // Show browse list when no active search result
  const showBrowse = !loading && !result && !submitted;
  const showBrowseAlso = !loading && !result && submitted && contacts.length > 0;

  // Filtered + sorted contacts
  const filteredContacts = contacts
    .filter((c) => {
      if (!listSearch.trim()) return true;
      const q = listSearch.toLowerCase();
      return (
        c.displayName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "events")  return b.eventCount - a.eventCount;
      if (sortBy === "name")    return (a.displayName ?? "").localeCompare(b.displayName ?? "");
      // recent: lastAt descending
      return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
    });

  const totalPages   = Math.ceil(filteredContacts.length / PAGE_SIZE);
  const pagedContacts = filteredContacts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-6 space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Search size={18} className="text-indigo-400" />
        <div>
          <h1 className="text-base font-bold text-white leading-none">Contact Inspector</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Full cross-tool timeline for any contact · search by email or pick from the list</p>
        </div>
      </div>

      {/* Back button */}
      {(result || submitted) && (
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft size={13} />
          Back to contacts
        </button>
      )}

      {/* Search */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) handleBack();
            }}
            placeholder="sarah.mitchell@notion.so"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
        >
          {loading ? "Looking up…" : "Inspect"}
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-32 text-slate-600 text-sm gap-2">
          <Search size={14} className="animate-pulse" />
          Searching across all tools…
        </div>
      )}

      {/* Not found */}
      {!loading && result && !result.found && submitted && (
        <div className="flex flex-col items-center gap-2 py-8 text-slate-600">
          <User size={24} className="opacity-30" />
          <p className="text-sm">No contact found for <span className="font-mono text-slate-500">{submitted}</span></p>
        </div>
      )}

      {/* Result */}
      {!loading && result?.found && result.contact && (
        <div className="space-y-5">
          {/* Contact card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-lg font-bold text-slate-300">
                  {(result.contact.displayName || "?")[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{result.contact.displayName}</h2>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {result.contact.email && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Fingerprint size={11} /> {result.contact.email}
                      </span>
                    )}
                    {result.contact.company && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Building2 size={11} /> {result.contact.company}
                      </span>
                    )}
                    {result.contact.title && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Briefcase size={11} /> {result.contact.title}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-white tabular-nums">{result.events.length}</p>
                <p className="text-[11px] text-slate-500">total events</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{toolsUsed.length} tool{toolsUsed.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {toolsUsed.length > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-slate-600">Seen in:</span>
                {toolsUsed.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-slate-300">{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Overlap warning + API docs */}
          {result.activeSequences.length > 1 && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25">
                <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">Active sequence overlap detected</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    This contact is currently active in <strong>{result.activeSequences.length} tools simultaneously</strong>: {result.activeSequences.join(", ")}. They may be receiving duplicate outreach.
                  </p>
                </div>
              </div>
              <OverlapApiDocs workspaceId={workspaceId} />
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Clock size={11} />
              Event Timeline · {result.events.length} event{result.events.length !== 1 ? "s" : ""}
            </h3>
            {result.events.length === 0 ? (
              <p className="text-sm text-slate-600 text-center py-8">No events recorded for this contact.</p>
            ) : (
              <div className="space-y-1">
                {result.events.map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact browse list — shown when no active result */}
      {(showBrowse || showBrowseAlso) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-2">
              <User size={11} />
              {contacts.length > 0 ? `${filteredContacts.length} of ${contacts.length} contacts` : "No contacts yet"}
            </h3>
          </div>

          {contactsLoading ? (
            <div className="text-xs text-slate-600 py-4">Loading contacts…</div>
          ) : contacts.length === 0 ? (
            <div className="text-xs text-slate-700 py-4">
              Seed demo data from the Live Feed page to see contacts here.
            </div>
          ) : (
            <>
              {/* Filter bar */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filter by name, email, company…"
                    value={listSearch}
                    onChange={(e) => { setListSearch(e.target.value); setPage(0); }}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                  />
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <ArrowUpDown size={11} className="text-slate-600" />
                  {(["recent", "events", "name"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSortBy(s); setPage(0); }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        sortBy === s
                          ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                          : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {s === "recent" ? "Recent" : s === "events" ? "Most events" : "Name A–Z"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {["Contact", "Company", "Events", "Last Activity"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {pagedContacts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-600">
                          No contacts match "{listSearch}"
                        </td>
                      </tr>
                    ) : pagedContacts.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                        onClick={() => c.email && selectContact(c.email)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-400 shrink-0">
                              {(c.displayName || "?")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{c.displayName}</p>
                              {c.email && <p className="text-[10px] text-slate-600 font-mono truncate">{c.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-400">{c.company ?? "—"}</p>
                          {c.title && <p className="text-[10px] text-slate-600">{c.title}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Zap size={11} className="text-indigo-500/60" />
                            <span className="text-sm font-mono font-medium text-white tabular-nums">{c.eventCount}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.lastEvent ? (
                            <>
                              <code className={`text-[11px] font-mono ${EVENT_COLOR[c.lastEvent] ?? "text-slate-400"}`}>{c.lastEvent}</code>
                              {c.lastAt && <p className="text-[10px] text-slate-600 mt-0.5">{relTime(c.lastAt)}</p>}
                            </>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-600 tabular-nums">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredContacts.length)} of {filteredContacts.length}
                    </span>
                    <div className="flex items-center flex-wrap gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="p-1.5 rounded-lg border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        const p = totalPages <= 7 ? i : (page < 4 ? i : page - 3 + i);
                        if (p >= totalPages) return null;
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-medium border transition-all ${
                              p === page
                                ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                                : "border-slate-800 text-slate-500 hover:text-white hover:border-slate-700"
                            }`}
                          >
                            {p + 1}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="p-1.5 rounded-lg border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
