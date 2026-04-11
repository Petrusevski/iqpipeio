import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Search,
  Activity,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Workflow,
  TrendingUp,
  Play,
  Key,
  Download,
  GitBranch,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

// ── Mini tool logo ─────────────────────────────────────────────────────────────
function Logo({ domain, name, size = 5 }: { domain: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const px = size * 4;
  if (err) return (
    <div style={{ width: px, height: px }} className="rounded bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">{name[0]}</div>
  );
  return (
    <div style={{ width: px, height: px }} className="rounded bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
      <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt={name} width={px * 0.6} height={px * 0.6} className="object-contain" onError={() => setErr(true)} />
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: "flow",    label: "How it connects",  icon: Workflow  },
  { id: "feed",    label: "Live Feed",         icon: Zap       },
  { id: "inspect", label: "Contact Inspector", icon: Search    },
  { id: "health",  label: "Workflow Health",   icon: Activity  },
  { id: "report",  label: "GTM Report",        icon: FileText  },
];

// ── Mock data ──────────────────────────────────────────────────────────────────

const IMPORTED_WORKFLOWS = [
  {
    name: "Q2 Outreach — Clay → HeyReach → HubSpot",
    platform: "make.com",
    apps: ["clay.com", "heyreach.io", "hubspot.com"],
    appNames: ["Clay", "HeyReach", "HubSpot"],
    active: true,
    events: 412,
  },
  {
    name: "Lead Enrichment — Apollo → Clearbit",
    platform: "n8n.io",
    apps: ["apollo.io", "clearbit.com"],
    appNames: ["Apollo", "Clearbit"],
    active: true,
    events: 238,
  },
  {
    name: "Email Sequence — Instantly → HubSpot",
    platform: "make.com",
    apps: ["instantly.ai", "hubspot.com"],
    appNames: ["Instantly", "HubSpot"],
    active: true,
    events: 91,
  },
  {
    name: "Revenue — HubSpot → Stripe",
    platform: "n8n.io",
    apps: ["hubspot.com", "stripe.com"],
    appNames: ["HubSpot", "Stripe"],
    active: false,
    events: 0,
  },
];

const FEED_EVENTS = [
  { platform: "make.com",  tool: "Clay",      event: "contact_sourced",          contact: "alex@acmecorp.com",   time: "2s ago",   color: "text-sky-400"     },
  { platform: "make.com",  tool: "Clearbit",  event: "contact_enriched",         contact: "alex@acmecorp.com",   time: "4s ago",   color: "text-violet-400"  },
  { platform: "make.com",  tool: "HeyReach",  event: "connection_request_sent",  contact: "sara@venture.io",     time: "18s ago",  color: "text-blue-400"    },
  { platform: "n8n.io",    tool: "HeyReach",  event: "connection_accepted",      contact: "marc@pipeline.co",    time: "1m ago",   color: "text-blue-400"    },
  { platform: "make.com",  tool: "Instantly", event: "email_sent",               contact: "lea@growth.ai",       time: "2m ago",   color: "text-fuchsia-400" },
  { platform: "n8n.io",    tool: "Instantly", event: "reply_received",           contact: "lea@growth.ai",       time: "3m ago",   color: "text-fuchsia-400" },
  { platform: "n8n.io",    tool: "HubSpot",   event: "deal_created",             contact: "marc@pipeline.co",    time: "4m ago",   color: "text-emerald-400" },
  { platform: "n8n.io",    tool: "Stripe",    event: "payment_received",         contact: "alex@acmecorp.com",   time: "14m ago",  color: "text-green-400"   },
];

const JOURNEY = [
  { tool: "Clay",      domain: "clay.com",      event: "contact_sourced",         day: "Day 1 · 09:14",  color: "text-sky-400"     },
  { tool: "Clearbit",  domain: "clearbit.com",  event: "contact_enriched",        day: "Day 1 · 09:15",  color: "text-violet-400"  },
  { tool: "HeyReach",  domain: "heyreach.io",   event: "connection_request_sent", day: "Day 3 · 09:01",  color: "text-blue-400"    },
  { tool: "HeyReach",  domain: "heyreach.io",   event: "connection_accepted",     day: "Day 4 · 10:18",  color: "text-blue-400"    },
  { tool: "Instantly", domain: "instantly.ai",  event: "email_sent",              day: "Day 5 · 11:42",  color: "text-fuchsia-400" },
  { tool: "Instantly", domain: "instantly.ai",  event: "reply_received",          day: "Day 6 · 14:33",  color: "text-fuchsia-400" },
  { tool: "HubSpot",   domain: "hubspot.com",   event: "deal_created",            day: "Day 7 · 10:02",  color: "text-emerald-400" },
  { tool: "HubSpot",   domain: "hubspot.com",   event: "deal_stage_changed",      day: "Day 11 · 09:45", color: "text-emerald-400" },
  { tool: "Stripe",    domain: "stripe.com",    event: "payment_received",        day: "Day 14 · 11:30", color: "text-green-400"   },
];

const HEALTH_ROWS = [
  { name: "Q2 Outreach — Clay → HeyReach → HubSpot", platform: "make.com", last: "8s ago",     status: "Healthy", count: 412, dot: "bg-emerald-400"             },
  { name: "Lead Enrichment — Apollo → Clearbit",      platform: "n8n.io",   last: "1m ago",     status: "Healthy", count: 238, dot: "bg-emerald-400"             },
  { name: "Email Sequence — Instantly → HubSpot",     platform: "make.com", last: "9m ago",     status: "Warning", count: 61,  dot: "bg-amber-400 animate-pulse" },
  { name: "Revenue — HubSpot → Stripe",               platform: "n8n.io",   last: "3 days ago", status: "Silent",  count: 0,   dot: "bg-rose-500 animate-pulse"  },
];

const STACKS = [
  { name: "Clay → HeyReach → HubSpot",    reply: 24, close: 8.1, rev: "$84,600", winner: true  },
  { name: "Apollo → Instantly → HubSpot", reply: 11, close: 3.9, rev: "$38,200", winner: false },
  { name: "Apollo → Clearbit only",       reply: 6,  close: 1.8, rev: "$12,800", winner: false },
];

// ── Panels ─────────────────────────────────────────────────────────────────────

function FlowPanel() {
  const [activePlatform, setActivePlatform] = useState<"make" | "n8n">("make");

  const platformWorkflows = IMPORTED_WORKFLOWS.filter(
    w => activePlatform === "make" ? w.platform === "make.com" : w.platform === "n8n.io"
  );

  return (
    <div className="space-y-5">

      {/* ── Step indicators ── */}
      <div className="grid md:grid-cols-3 gap-3">
        {[
          {
            step: "1", color: "indigo", icon: Key,
            title: "Paste your API key",
            desc: "Go to Settings → Connections. Paste your Make.com or n8n API key. iqpipe connects instantly.",
          },
          {
            step: "2", color: "fuchsia", icon: Download,
            title: "Workflows imported automatically",
            desc: "iqpipe reads all your existing workflows — names, apps, node count. Nothing to configure.",
          },
          {
            step: "3", color: "emerald", icon: Zap,
            title: "Events recorded as they happen",
            desc: "As your workflows run, iqpipe captures each tool event and builds the full contact journey automatically.",
          },
        ].map((card) => {
          const CardIcon = card.icon;
          return (
            <div key={card.step} className={`rounded-xl border border-${card.color}-500/20 bg-${card.color}-500/5 p-4 flex gap-3`}>
              <div className={`w-7 h-7 rounded-full bg-${card.color}-500/15 border border-${card.color}-500/25 flex items-center justify-center text-[11px] font-bold text-${card.color}-400 shrink-0`}>
                {card.step}
              </div>
              <div>
                <div className={`flex items-center gap-1.5 text-xs font-bold text-${card.color}-300 mb-1`}>
                  <CardIcon size={12} />
                  {card.title}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{card.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Platform toggle + API key connect mock ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="text-xs font-semibold text-slate-400">Settings → Connections</div>
          <div className="flex rounded-xl border border-slate-800 overflow-hidden text-xs font-semibold">
            {(["make", "n8n"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={`flex items-center gap-2 px-4 py-2 transition-all ${activePlatform === p ? "bg-indigo-500/15 text-indigo-200 border-r border-slate-800" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Logo domain={p === "make" ? "make.com" : "n8n.io"} name={p} size={4} />
                {p === "make" ? "Make.com" : "n8n"}
              </button>
            ))}
          </div>
        </div>

        {/* API key input mock */}
        <div className="mb-4 space-y-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {activePlatform === "make" ? "Make.com" : "n8n"} API Key
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 font-mono text-[11px] text-slate-400">
              <Key size={11} className="text-slate-600 shrink-0" />
              <span className="flex-1 truncate">
                {activePlatform === "make" ? "••••••••••••••••••••••••••••••••" : "eyJhbGciOiJIUzI1NiIsInR5c••••••"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold shrink-0">
              <CheckCircle2 size={11} /> Connected
            </div>
          </div>
        </div>

        {/* Imported workflows list */}
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
          {platformWorkflows.length} workflows imported
        </div>
        <div className="space-y-2">
          {platformWorkflows.map((wf, i) => (
            <motion.div
              key={wf.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                wf.active ? "border-slate-700 bg-slate-900/60" : "border-slate-800/50 bg-slate-900/20 opacity-50"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wf.active ? "bg-emerald-400" : "bg-slate-600"}`} />
              <GitBranch size={11} className="text-slate-600 shrink-0" />
              <span className="text-[11px] text-slate-300 flex-1 truncate">{wf.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                {wf.apps.slice(0, 3).map((domain, j) => (
                  <Logo key={j} domain={domain} name={wf.appNames[j]} size={3} />
                ))}
              </div>
              <span className={`text-[10px] font-mono shrink-0 w-12 text-right ${wf.active ? "text-slate-400" : "text-slate-600"}`}>
                {wf.active ? `${wf.events} ev` : "silent"}
              </span>
            </motion.div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-slate-600">
          iqpipe reads your workflow structure — which apps are connected, in which order — and maps events to a unified contact identity.
        </p>
      </div>

    </div>
  );
}

function FeedPanel() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300">Live Feed</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <span>All workflows</span>
          <span>{FEED_EVENTS.length} events</span>
        </div>
      </div>

      <div className="grid grid-cols-[90px_100px_1fr_160px_70px] gap-3 px-5 py-2 border-b border-slate-800/50 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
        <span>Platform</span>
        <span>Tool</span>
        <span>Event</span>
        <span>Contact</span>
        <span>Time</span>
      </div>

      <div className="divide-y divide-slate-800/40">
        {FEED_EVENTS.map((ev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="grid grid-cols-[90px_100px_1fr_160px_70px] gap-3 px-5 py-2.5 items-center hover:bg-slate-900/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Logo domain={ev.platform} name={ev.platform} size={4} />
              <span className="text-[10px] text-slate-500 truncate">{ev.platform === "make.com" ? "Make" : "n8n"}</span>
            </div>
            <span className={`text-[10px] font-semibold ${ev.color}`}>{ev.tool}</span>
            <code className="text-[10px] font-mono text-slate-300">{ev.event}</code>
            <span className="text-[10px] text-slate-500 font-mono truncate">{ev.contact}</span>
            <span className="text-[9px] text-slate-600">{ev.time}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function InspectPanel() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900/60">
        <Search size={13} className="text-indigo-400" />
        <span className="text-xs font-semibold text-slate-300">Contact Inspector</span>
      </div>

      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-xs">
          <Search size={12} className="text-indigo-400 shrink-0" />
          <span className="text-slate-300 flex-1">alex@acmecorp.com</span>
          <span className="text-[10px] text-indigo-400 font-medium">↵</span>
        </div>
      </div>

      {/* Contact card */}
      <div className="mx-5 mb-3 flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold shrink-0">AF</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white">Alex Foster · VP Growth · Acme Corp</div>
          <div className="text-[10px] text-slate-500 mt-0.5">9 events · 5 tools · 2 workflows · 14 days to close</div>
        </div>
        <div className="text-xs font-bold text-emerald-400 shrink-0">Closed ✓</div>
      </div>

      {/* Workflow source */}
      <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-500/20 bg-violet-500/5 text-[11px] text-violet-300">
        <Logo domain="make.com" name="Make" size={3} />
        <span>Sourced via Make.com · Q2 Outreach — Clay → HeyReach → HubSpot</span>
      </div>

      {/* Journey timeline */}
      <div className="mx-5 mb-5 rounded-xl border border-slate-800 overflow-hidden">
        {JOURNEY.map((ev, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 last:border-0 hover:bg-slate-900/30 transition-colors">
            <Logo domain={ev.domain} name={ev.tool} size={4} />
            <span className={`text-[10px] font-semibold w-16 shrink-0 ${ev.color}`}>{ev.tool}</span>
            <code className="text-[10px] font-mono text-slate-400 flex-1">{ev.event}</code>
            <span className="text-[9px] text-slate-600 shrink-0 tabular-nums">{ev.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthPanel() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300">Workflow Health</span>
        </div>
        <span className="text-[10px] text-slate-600">auto-refresh 30s</span>
      </div>

      <div className="grid grid-cols-4 gap-px bg-slate-800/50 border-b border-slate-800">
        {[
          { label: "Workflows", val: "4",  color: "text-white"       },
          { label: "Healthy",   val: "2",  color: "text-emerald-400" },
          { label: "Warning",   val: "1",  color: "text-amber-400"   },
          { label: "Silent",    val: "1",  color: "text-rose-400"    },
        ].map((s) => (
          <div key={s.label} className="bg-slate-950 px-4 py-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="divide-y divide-slate-800/50">
        {HEALTH_ROWS.map((row) => (
          <div key={row.name} className={`flex items-center gap-3 px-5 py-3 ${row.status === "Silent" ? "bg-rose-500/5" : ""}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />
            <Logo domain={row.platform} name={row.platform} size={4} />
            <span className="text-xs text-slate-300 flex-1 truncate">{row.name}</span>
            <span className={`text-xs font-semibold w-16 text-right ${
              row.status === "Silent" ? "text-rose-400" : row.status === "Warning" ? "text-amber-400" : "text-emerald-400"
            }`}>
              {row.status}
            </span>
            <span className="text-xs font-bold text-slate-300 w-10 text-right tabular-nums">{row.count > 0 ? row.count : "—"}</span>
            <span className="text-[10px] text-slate-600 w-24 text-right">{row.last}</span>
          </div>
        ))}
      </div>

      <div className="m-4 flex gap-3 p-4 rounded-xl border border-rose-500/40 bg-rose-500/5">
        <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
          <AlertTriangle size={13} className="text-rose-400" />
        </div>
        <div>
          <div className="text-xs font-bold text-rose-300 mb-0.5">Revenue workflow is silent — 3 days, 0 events</div>
          <p className="text-[11px] text-slate-500 leading-relaxed">Expected: deal_stage_changed, payment_received. Last event: 72h ago. Check your n8n workflow run history.</p>
        </div>
      </div>
    </div>
  );
}

function ReportPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">GTM Report · Workflow Attribution</span>
          <span className="text-[10px] text-slate-600">Last 30d</span>
        </div>
        <div className="p-4 space-y-3">
          {STACKS.map((stack, i) => (
            <div key={i} className={`p-3 rounded-xl border transition-all ${stack.winner ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-900/30"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold truncate flex-1 pr-2 ${stack.winner ? "text-white" : "text-slate-400"}`}>{stack.name}</span>
                {stack.winner && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shrink-0">WINNER</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <div className="text-slate-600 mb-0.5">Reply rate</div>
                  <div className={`font-bold ${stack.winner ? "text-emerald-400" : "text-slate-500"}`}>{stack.reply}%</div>
                </div>
                <div>
                  <div className="text-slate-600 mb-0.5">Close rate</div>
                  <div className={`font-bold ${stack.winner ? "text-emerald-400" : "text-slate-500"}`}>{stack.close}%</div>
                </div>
                <div>
                  <div className="text-slate-600 mb-0.5">Revenue</div>
                  <div className={`font-bold font-mono ${stack.winner ? "text-emerald-400" : "text-slate-500"}`}>{stack.rev}</div>
                </div>
              </div>
              {stack.winner && (
                <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.3 }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline funnel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden p-4 shadow-2xl">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp size={11} />
          Pipeline Funnel · Clay → HeyReach → HubSpot
        </div>
        <div className="space-y-1.5">
          {[
            { label: "Sourced",   n: 300, pct: 100, color: "from-violet-500 to-indigo-500" },
            { label: "Enriched",  n: 287, pct: 96,  color: "from-indigo-500 to-blue-500"   },
            { label: "Contacted", n: 241, pct: 80,  color: "from-blue-500 to-sky-500"      },
            { label: "Replied",   n: 72,  pct: 30,  color: "from-sky-500 to-cyan-500"      },
            { label: "Meetings",  n: 29,  pct: 40,  color: "from-cyan-500 to-teal-500"     },
            { label: "Won",       n: 24,  pct: 83,  color: "from-emerald-500 to-green-500" },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 w-16 text-right shrink-0">{s.label}</span>
              <div className="flex-1 h-4 rounded bg-slate-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${s.pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.08 }}
                  className={`h-full rounded bg-gradient-to-r ${s.color} opacity-80`}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-300 w-8 shrink-0 tabular-nums">{s.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<string, () => JSX.Element> = {
  flow:    FlowPanel,
  feed:    FeedPanel,
  inspect: InspectPanel,
  health:  HealthPanel,
  report:  ReportPanel,
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [activeTab, setActiveTab] = useState("flow");
  const Panel = PANELS[activeTab];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative border-b border-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[250px] bg-indigo-500/8 blur-[100px] pointer-events-none" />

          <div className="relative mx-auto max-w-4xl px-4 pt-20 pb-16 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-medium text-indigo-300 mb-6">
                <Play size={10} className="fill-current" /> Interactive demo
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
                See how iqpipe works<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-amber-400">
                  with your automations.
                </span>
              </h1>
              <p className="text-slate-400 text-base max-w-xl mx-auto mb-8 leading-relaxed">
                Connect your Make.com or n8n account with your API key. iqpipe imports your workflows, records every tool event automatically, and builds a complete attributed picture of your GTM pipeline.
              </p>

              <div className="flex items-center justify-center gap-4 flex-wrap mb-6">
                {[
                  { domain: "make.com", name: "Make.com", color: "text-violet-400 border-violet-500/25 bg-violet-500/8" },
                  { domain: "n8n.io",   name: "n8n",      color: "text-orange-400 border-orange-500/25 bg-orange-500/8" },
                ].map((p) => (
                  <div key={p.domain} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold ${p.color}`}>
                    <Logo domain={p.domain} name={p.name} size={5} />
                    {p.name}
                  </div>
                ))}
                <span className="text-slate-600 text-sm">→</span>
                <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/25 bg-indigo-500/8 text-sm font-semibold text-indigo-300">
                  <img src="/logo.png" alt="iqpipe" className="h-4 w-4 object-contain" />
                  iqpipe
                </div>
              </div>

              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-7 py-3 rounded-full font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Start free — connect in 5 min <ArrowRight size={14} />
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── Tab demo ── */}
        <section className="py-16 px-4">
          <div className="mx-auto max-w-5xl">

            <div className="flex flex-wrap gap-2 justify-center mb-10">
              {TABS.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
                      activeTab === tab.id
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-200"
                        : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <TabIcon size={13} />
                    {tab.label}
                    {activeTab === tab.id && <ChevronRight size={11} className="text-indigo-400" />}
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Panel />
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* ── What you get ── */}
        <section className="border-t border-slate-900 py-16 px-4 bg-slate-950/60">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-xl font-bold text-white text-center mb-8">Everything iqpipe builds automatically once your workflows are connected</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Zap,      color: "indigo",  title: "Live Feed",          desc: "Every event from every workflow and tool, as it fires. Real-time, sorted, searchable."       },
                { icon: Search,   color: "fuchsia", title: "Contact Inspector",  desc: "Full cross-tool journey per contact — from first import to closed revenue in one view."       },
                { icon: Activity, color: "amber",   title: "Workflow Health",    desc: "Monitors run frequency per workflow. Alerts when a workflow goes silent during work hours."   },
                { icon: FileText, color: "emerald", title: "GTM Report",         desc: "Revenue attributed per workflow sequence — which tool stack closes fastest and at highest rate." },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 bg-${item.color}-500/10 border border-${item.color}-500/20`}>
                      <ItemIcon size={15} className={`text-${item.color}-400`} />
                    </div>
                    <div className="text-sm font-bold text-white mb-1.5">{item.title}</div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Why iqpipe ── */}
        <section className="border-t border-slate-900 py-16 px-4">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <h2 className="text-xl font-bold text-white mb-3">Why connect through Make.com or n8n?</h2>
              <p className="text-slate-400 text-sm max-w-md mx-auto">Your automation platform already connects every tool in your GTM stack. iqpipe reads that structure and fills in the intelligence layer — without changing how your workflows run.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  icon: CheckCircle2,
                  color: "emerald",
                  title: "One API key, every tool",
                  body: "Make.com and n8n already connect to 400–500 apps. Paste your API key once — iqpipe reads all your existing workflows and imports them automatically. No per-tool setup.",
                },
                {
                  icon: Workflow,
                  color: "indigo",
                  title: "Nothing changes in your workflows",
                  body: "iqpipe connects to your account and reads your existing flows. Your automations keep running exactly as they are — iqpipe just listens and records what's happening.",
                },
                {
                  icon: TrendingUp,
                  color: "fuchsia",
                  title: "Attribution at the workflow level",
                  body: "iqpipe attributes revenue to workflow sequences, not just individual tools. You see which Make.com scenario or n8n workflow generated closed revenue — down to the exact tool stack.",
                },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 bg-${item.color}-500/10 border border-${item.color}-500/20`}>
                      <ItemIcon size={16} className={`text-${item.color}-400`} />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-2">{item.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.body}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-slate-900 py-16 px-4 text-center">
          <div className="mx-auto max-w-lg">
            <h2 className="text-2xl font-bold text-white mb-3">Ready to see your pipeline clearly?</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Connect your Make.com or n8n account. Your first workflows appear in under a minute.
            </p>
            <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-8 py-3 rounded-full font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
              Start free <ArrowRight size={14} />
            </a>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
