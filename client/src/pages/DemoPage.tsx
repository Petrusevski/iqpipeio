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
  Fingerprint,
  Workflow,
  Code2,
  TrendingUp,
  Play,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

// ── Mini tool logo ────────────────────────────────────────────────────────────
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

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: "flow",    label: "How it connects",   icon: Workflow    },
  { id: "feed",    label: "Live Feed",          icon: Zap         },
  { id: "inspect", label: "Contact Inspector",  icon: Search      },
  { id: "health",  label: "Pipeline Health",    icon: Activity    },
  { id: "report",  label: "GTM Report",         icon: FileText    },
];

// ── Mock event stream ─────────────────────────────────────────────────────────
const FEED_EVENTS = [
  { platform: "make.com",    tool: "Clay",      event: "lead_imported",     contact: "alex@acme.com",     time: "2s ago",  color: "text-sky-400"     },
  { platform: "n8n.io",     tool: "Clearbit",   event: "record_enriched",   contact: "alex@acme.com",     time: "2s ago",  color: "text-violet-400"  },
  { platform: "make.com",    tool: "HeyReach",  event: "connection_sent",   contact: "sara@bloom.io",     time: "18s ago", color: "text-blue-400"    },
  { platform: "n8n.io",     tool: "HubSpot",    event: "deal_created",      contact: "marc@pivot.co",     time: "1m ago",  color: "text-emerald-400" },
  { platform: "make.com",    tool: "Instantly",  event: "email_opened",      contact: "lea@orbit.ai",      time: "2m ago",  color: "text-fuchsia-400" },
  { platform: "n8n.io",     tool: "Stripe",     event: "payment_succeeded", contact: "alex@acme.com",     time: "4m ago",  color: "text-green-400"   },
  { platform: "make.com",    tool: "HeyReach",  event: "reply_received",    contact: "sara@bloom.io",     time: "6m ago",  color: "text-blue-400"    },
  { platform: "n8n.io",     tool: "Clay",       event: "lead_imported",     contact: "dom@crest.com",     time: "8m ago",  color: "text-sky-400"     },
];

// ── Mock contact journey ──────────────────────────────────────────────────────
const JOURNEY = [
  { tool: "Clay",      domain: "clay.com",      event: "lead_imported",    day: "Day 1 · 09:14",  color: "text-sky-400"     },
  { tool: "Clearbit",  domain: "clearbit.com",  event: "record_enriched",  day: "Day 1 · 09:15",  color: "text-violet-400"  },
  { tool: "HeyReach",  domain: "heyreach.io",   event: "connection_sent",  day: "Day 3 · 09:01",  color: "text-blue-400"    },
  { tool: "Instantly", domain: "instantly.ai",  event: "email_opened",     day: "Day 4 · 11:42",  color: "text-fuchsia-400" },
  { tool: "HeyReach",  domain: "heyreach.io",   event: "reply_received",   day: "Day 5 · 14:33",  color: "text-blue-400"    },
  { tool: "HubSpot",   domain: "hubspot.com",   event: "deal_created",     day: "Day 6 · 10:02",  color: "text-emerald-400" },
  { tool: "Stripe",    domain: "stripe.com",    event: "payment_succeeded", day: "Day 14 · 11:30", color: "text-green-400"  },
];

// ── Mock health data ──────────────────────────────────────────────────────────
const HEALTH_ROWS = [
  { name: "Make · Clay → HeyReach",   platform: "make.com", last: "8s ago",    status: "Healthy", count: 412, dot: "bg-emerald-400"              },
  { name: "n8n · Enrichment flow",    platform: "n8n.io",   last: "1m ago",    status: "Healthy", count: 238, dot: "bg-emerald-400"              },
  { name: "Make · Outreach sequence", platform: "make.com", last: "9m ago",    status: "Warning", count: 61,  dot: "bg-amber-400 animate-pulse"  },
  { name: "n8n · CRM sync",           platform: "n8n.io",   last: "3 days ago", status: "Silent",  count: 0,   dot: "bg-rose-500 animate-pulse"   },
];

// ── Mock report stacks ────────────────────────────────────────────────────────
const STACKS = [
  { name: "Clay → HeyReach → HubSpot",  reply: 24, close: 8.1,  rev: "$84,600", winner: true  },
  { name: "Apollo → Instantly → CRM",   reply: 11, close: 3.9,  rev: "$38,200", winner: false },
  { name: "n8n enrichment-only flow",   reply: 6,  close: 1.8,  rev: "$12,800", winner: false },
];

// ── Panels ────────────────────────────────────────────────────────────────────

function FlowPanel() {
  return (
    <div className="space-y-8">
      {/* Animated diagram */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
        <div className="text-center mb-6">
          <div className="text-sm font-bold text-white mb-1">Your automations → iqpipe webhook → analytics</div>
          <p className="text-xs text-slate-500">Add one HTTP step to any Make.com or n8n workflow. Every event it fires shows up here.</p>
        </div>

        {/* Platforms */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-8">
          {[
            { label: "Make.com scenario", domain: "make.com", color: "border-violet-500/30 bg-violet-500/5", text: "text-violet-400" },
            { label: "n8n workflow",       domain: "n8n.io",   color: "border-orange-500/30 bg-orange-500/5", text: "text-orange-400" },
          ].map((p) => (
            <div key={p.domain} className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${p.color}`}>
              <Logo domain={p.domain} name={p.label} size={7} />
              <div>
                <div className="text-xs font-semibold text-white">{p.label}</div>
                <div className={`text-[10px] ${p.text}`}>HTTP Request step → iqpipe webhook</div>
              </div>
            </div>
          ))}
        </div>

        {/* Step-by-step */}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              step: "1", color: "indigo",
              title: "Copy your webhook URL",
              code: "Settings → Connections\n→ Copy workspace webhook URL",
            },
            {
              step: "2", color: "fuchsia",
              title: "Add HTTP step to automation",
              code: 'POST {webhook}\n{\n  "event": "lead_imported",\n  "email": "{{contact.email}}"\n}',
            },
            {
              step: "3", color: "emerald",
              title: "Watch analytics appear",
              code: "Live Feed · Contact Inspector\nPipeline Health · GTM Report",
            },
          ].map((card) => (
            <div key={card.step} className={`rounded-xl border border-${card.color}-500/20 bg-${card.color}-500/5 p-4`}>
              <div className={`text-[10px] font-bold text-${card.color}-400 mb-2 flex items-center gap-1.5`}>
                <span className={`w-5 h-5 rounded-full bg-${card.color}-500/15 border border-${card.color}-500/25 flex items-center justify-center text-[10px]`}>{card.step}</span>
                Step {card.step}
              </div>
              <div className="text-xs font-semibold text-white mb-2">{card.title}</div>
              <pre className="text-[10px] font-mono text-slate-400 leading-relaxed whitespace-pre">{card.code}</pre>
            </div>
          ))}
        </div>
      </div>

      {/* Event payload format */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Code2 size={14} className="text-indigo-400" />
          <span className="text-sm font-bold text-white">Universal event payload format</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              label: "Make.com",
              domain: "make.com",
              code: `{
  "event": "lead_imported",
  "source": "clay",
  "email": "{{1.email}}",
  "properties": {
    "company": "{{1.company}}",
    "title": "{{1.job_title}}"
  }
}`,
            },
            {
              label: "n8n",
              domain: "n8n.io",
              code: `{
  "event": "sequence_started",
  "source": "heyreach",
  "email": "={{ $json.email }}",
  "properties": {
    "campaign": "={{ $json.campaign_name }}"
  }
}`,
            },
          ].map((p) => (
            <div key={p.label} className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
                <Logo domain={p.domain} name={p.label} size={4} />
                <span className="text-[11px] font-semibold text-slate-300">{p.label}</span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 leading-relaxed p-4 overflow-x-auto">{p.code}</pre>
            </div>
          ))}
        </div>
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
          <span>All automations</span>
          <span>{FEED_EVENTS.length} events</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[100px_100px_1fr_140px_70px] gap-3 px-5 py-2 border-b border-slate-800/50 text-[9px] font-semibold uppercase tracking-widest text-slate-600">
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
            className="grid grid-cols-[100px_100px_1fr_140px_70px] gap-3 px-5 py-2.5 items-center hover:bg-slate-900/30 transition-colors"
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

      {/* Search */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-xs">
          <Search size={12} className="text-indigo-400 shrink-0" />
          <span className="text-slate-300 flex-1">alex@acme.com</span>
          <span className="text-[10px] text-indigo-400 font-medium">↵</span>
        </div>
      </div>

      {/* Contact card */}
      <div className="mx-5 mb-3 flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold shrink-0">AF</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white">Alex Foster · VP Growth · Acme Corp</div>
          <div className="text-[10px] text-slate-500 mt-0.5">7 events · 5 tools · 2 automations · 14 days to close</div>
        </div>
        <div className="text-xs font-bold text-emerald-400 shrink-0">Closed ✓</div>
      </div>

      {/* Automation source badge */}
      <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-500/20 bg-violet-500/5 text-[11px] text-violet-300">
        <Logo domain="make.com" name="Make" size={3} />
        <span>Sourced via Make.com · Clay → HeyReach scenario</span>
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
          <span className="text-xs font-semibold text-slate-300">Pipeline Health · Automation Monitor</span>
        </div>
        <span className="text-[10px] text-slate-600">auto-refresh 30s</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-px bg-slate-800/50 border-b border-slate-800">
        {[
          { label: "Automations", val: "4", color: "text-white"      },
          { label: "Healthy",     val: "2", color: "text-emerald-400" },
          { label: "Warning",     val: "1", color: "text-amber-400"   },
          { label: "Silent",      val: "1", color: "text-rose-400"    },
        ].map((s) => (
          <div key={s.label} className="bg-slate-950 px-4 py-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-800/50">
        {HEALTH_ROWS.map((row) => (
          <div key={row.name} className={`flex items-center gap-3 px-5 py-3 ${row.status === "Silent" ? "bg-rose-500/5" : ""}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />
            <Logo domain={row.platform} name={row.platform} size={4} />
            <span className="text-xs text-slate-300 flex-1 truncate">{row.name}</span>
            <span className={`text-xs font-semibold w-16 text-right ${row.status === "Silent" ? "text-rose-400" : row.status === "Warning" ? "text-amber-400" : "text-emerald-400"}`}>
              {row.status}
            </span>
            <span className="text-xs font-bold text-slate-300 w-10 text-right tabular-nums">{row.count > 0 ? row.count : "—"}</span>
            <span className="text-[10px] text-slate-600 w-24 text-right">{row.last}</span>
          </div>
        ))}
      </div>

      {/* Alarm */}
      <div className="m-4 flex gap-3 p-4 rounded-xl border border-rose-500/40 bg-rose-500/8">
        <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
          <AlertTriangle size={13} className="text-rose-400" />
        </div>
        <div>
          <div className="text-xs font-bold text-rose-300 mb-0.5">n8n CRM sync is silent — 3 days, 0 events</div>
          <p className="text-[11px] text-slate-500 leading-relaxed">Expected: deal_created, stage_changed. Last event: 72h ago. Check your n8n workflow run history.</p>
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
          <span className="text-xs font-semibold text-slate-300">GTM Report · Automation Attribution</span>
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
          Pipeline Funnel · Winning Automation
        </div>
        <div className="space-y-1.5">
          {[
            { label: "Sourced",   n: 300, pct: 100, color: "from-violet-500 to-indigo-500"  },
            { label: "Enriched",  n: 287, pct: 96,  color: "from-indigo-500 to-blue-500"    },
            { label: "Contacted", n: 241, pct: 80,  color: "from-blue-500 to-sky-500"       },
            { label: "Replied",   n: 72,  pct: 30,  color: "from-sky-500 to-cyan-500"       },
            { label: "Meetings",  n: 29,  pct: 40,  color: "from-cyan-500 to-teal-500"      },
            { label: "Won",       n: 24,  pct: 83,  color: "from-emerald-500 to-green-500"  },
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

// ── Main page ─────────────────────────────────────────────────────────────────
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
                Connect your Make.com or n8n workflows to iqpipe via a single HTTP step. Every event your automations fire flows into Live Feed, Contact Inspector, Pipeline Health, and GTM Report — automatically.
              </p>

              {/* Platform indicators */}
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
                  <Fingerprint size={16} />
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

            {/* Tabs */}
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

            {/* Panel */}
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
            <h2 className="text-xl font-bold text-white text-center mb-8">Everything that appears automatically when your automations are connected</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Zap,           color: "indigo",  title: "Live Feed",        desc: "Every event from every automation, as it fires. Real-time, sorted, searchable."        },
                { icon: Search,        color: "fuchsia", title: "Contact Inspector", desc: "Full cross-tool journey per contact — from first import to closed revenue in one view." },
                { icon: Activity,      color: "amber",   title: "Pipeline Health",   desc: "Monitors automation run frequency. Alerts when a workflow goes silent during work hours." },
                { icon: FileText,      color: "emerald", title: "GTM Report",        desc: "Revenue attributed to each automation sequence — which workflow combination closes most." },
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

        {/* ── Why automations ── */}
        <section className="border-t border-slate-900 py-16 px-4">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <h2 className="text-xl font-bold text-white mb-3">Why connect through Make.com or n8n?</h2>
              <p className="text-slate-400 text-sm max-w-md mx-auto">Instead of per-tool webhooks, one automation platform sends all your GTM events through a single integration point.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  icon: CheckCircle2,
                  color: "emerald",
                  title: "One connection, every tool",
                  body: "Make.com and n8n already connect to 400–500 apps. Add one HTTP step once — then route events from any tool in your workflow to iqpipe without additional setup per tool.",
                },
                {
                  icon: Workflow,
                  color: "indigo",
                  title: "Your workflow is already running",
                  body: "You don't build new automations for iqpipe. You add one HTTP Request step to automations you already have. If Clay → HeyReach runs today, it can send to iqpipe today.",
                },
                {
                  icon: TrendingUp,
                  color: "fuchsia",
                  title: "Attribution at the automation level",
                  body: "iqpipe attributes revenue to automation sequences, not just individual tools. You see which Make.com scenario or n8n workflow generated closed revenue — not just which tools were involved.",
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
        <section className="border-t border-slate-900 py-20 px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-xl mx-auto text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Fingerprint size={28} />
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Ready to connect your automations?</h2>
            <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto leading-relaxed">
              Sign up free, copy your webhook URL, and add one HTTP step to your first Make.com or n8n workflow. First event appears in Live Feed within seconds.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a href="/signup" className="inline-flex h-12 items-center justify-center rounded-full bg-white text-slate-950 px-8 text-sm font-bold shadow-xl hover:bg-slate-100 hover:scale-105 transition-all">
                Get started free <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              <a href="/integrations" className="inline-flex h-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900/50 px-6 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-all">
                See integration guide
              </a>
            </div>
          </motion.div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
