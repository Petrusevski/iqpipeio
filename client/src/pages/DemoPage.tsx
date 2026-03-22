import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Activity,
  Search,
  GitBranch,
  HeartPulse,
  FileText,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  ChevronRight,
  ArrowUpRight,
  Bell,
  Fingerprint,
  Plug,
  RefreshCw,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function ToolLogo({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">
        {name[0]}
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden shrink-0">
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt={name}
        width={14}
        height={14}
        className="object-contain"
        onError={() => setErr(true)}
      />
    </div>
  );
}

const STATUS_COLORS = {
  Healthy: "text-emerald-400",
  Warning: "text-amber-400",
  Silent:  "text-rose-400",
  "No data": "text-slate-500",
};

const STATUS_DOT = {
  Healthy: "bg-emerald-400",
  Warning: "bg-amber-400 animate-pulse",
  Silent:  "bg-rose-400 animate-pulse",
  "No data": "bg-slate-600",
};

const CHANNEL_PILL: Record<string, string> = {
  prospecting: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  enrichment:  "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  email:       "text-sky-400 bg-sky-500/10 border-sky-500/20",
  linkedin:    "text-blue-400 bg-blue-500/10 border-blue-500/20",
  crm:         "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  billing:     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  automation:  "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
};

// ── Feature: Live Feed ─────────────────────────────────────────────────────────

const TOOL_CARDS = [
  { name: "Clay",       domain: "clay.com",       channel: "prospecting", status: "Healthy",  events24h: 412, events7d: 2841, metric: "412 leads sourced",     lastEvent: "2s ago"   },
  { name: "PDL",        domain: "peopledatalabs.com", channel: "enrichment", status: "Healthy", events24h: 388, events7d: 2610, metric: "388 enriched",         lastEvent: "14s ago"  },
  { name: "Instantly",  domain: "instantly.ai",   channel: "email",       status: "Warning",  events24h: 61,  events7d: 1840, metric: "61% open rate",         lastEvent: "4m ago"   },
  { name: "HeyReach",   domain: "heyreach.io",    channel: "linkedin",    status: "Healthy",  events24h: 93,  events7d: 604,  metric: "93 connections sent",   lastEvent: "38s ago"  },
  { name: "HubSpot",    domain: "hubspot.com",    channel: "crm",         status: "Healthy",  events24h: 34,  events7d: 218,  metric: "34 deals updated",      lastEvent: "1m ago"   },
  { name: "Stripe",     domain: "stripe.com",     channel: "billing",     status: "Silent",   events24h: 0,   events7d: 7,    metric: "No events today",       lastEvent: "2d ago"   },
];

const SIGNAL_EVENTS = [
  { tool: "HeyReach",  domain: "heyreach.io",  channel: "linkedin",    event: "reply_received",      lead: "iq_4f2a9c", meta: "a****@example.com · \"Interested, let's connect\"",  ago: "12s ago"  },
  { tool: "Instantly", domain: "instantly.ai", channel: "email",       event: "email_opened",        lead: "iq_8b1e3d", meta: "m****@example.com · Subject: Quick question",          ago: "34s ago"  },
  { tool: "Clay",      domain: "clay.com",     channel: "prospecting", event: "lead_enriched",       lead: "iq_2c7f0a", meta: "p****@example.com · ICP match: Series B, 120 emp",    ago: "1m ago"   },
  { tool: "HubSpot",   domain: "hubspot.com",  channel: "crm",         event: "deal_created",        lead: "iq_5d3b8e", meta: "a****@example.com · $12,000 · Stage: Prospecting",    ago: "3m ago"   },
  { tool: "Instantly", domain: "instantly.ai", channel: "email",       event: "meeting_booked",      lead: "iq_9r3q7l", meta: "j****@example.com · Calendly 30-min confirmed",        ago: "8m ago"   },
  { tool: "HeyReach",  domain: "heyreach.io",  channel: "linkedin",    event: "connection_accepted", lead: "iq_7k2p1n", meta: "s****@example.com · 2nd degree connection",            ago: "11m ago"  },
];

function LiveFeedDemo() {
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((p) => p + 1), 3000);
    return () => clearInterval(t);
  }, [live]);

  const rotatedEvents = [...SIGNAL_EVENTS.slice(tick % SIGNAL_EVENTS.length), ...SIGNAL_EVENTS.slice(0, tick % SIGNAL_EVENTS.length)].slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              live
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            {live ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</> : <><Play size={10} /> Paused</>}
          </button>
          <span className="text-[10px] text-slate-600">refreshes every 15s</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="px-2 py-0.5 rounded border border-slate-700 text-slate-400">Events ▾</span>
          <span className="px-2 py-0.5 rounded border border-slate-700 text-slate-400">Apps ▾</span>
          <span className="px-2 py-0.5 rounded border border-slate-700 text-slate-400">Stacks ▾</span>
        </div>
      </div>

      {/* Tool KPI Cards */}
      <div className="grid grid-cols-3 gap-2">
        {TOOL_CARDS.map((card) => (
          <div
            key={card.name}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <ToolLogo domain={card.domain} name={card.name} />
              <span className="text-[11px] font-semibold text-slate-200 truncate flex-1">{card.name}</span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[card.status as keyof typeof STATUS_DOT]}`} />
            </div>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${CHANNEL_PILL[card.channel]}`}>
              {card.channel}
            </span>
            <div className="mt-2">
              <div className="text-base font-bold text-white">{card.events24h.toLocaleString()}</div>
              <div className="text-[9px] text-slate-500">events 24h</div>
            </div>
            <div className={`text-[9px] font-medium mt-1 ${STATUS_COLORS[card.status as keyof typeof STATUS_COLORS]}`}>
              {card.status} · {card.lastEvent}
            </div>
          </div>
        ))}
      </div>

      {/* Signal events */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/60 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Signal Events</span>
        </div>
        <AnimatePresence mode="popLayout">
          {rotatedEvents.map((ev) => (
            <motion.div
              key={ev.lead + ev.ago}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 last:border-0"
            >
              <ToolLogo domain={ev.domain} name={ev.tool} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-[10px] font-mono text-indigo-300">{ev.lead}</code>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${CHANNEL_PILL[ev.channel]}`}>{ev.channel}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{ev.event}</span>
                </div>
                <p className="text-[10px] text-slate-600 truncate mt-0.5">{ev.meta}</p>
              </div>
              <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">{ev.ago}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Feature: Contact Inspector ─────────────────────────────────────────────────

const CONTACT_TIMELINE = [
  { tool: "Clay",      domain: "clay.com",       channel: "prospecting", event: "lead_imported",      ts: "Day 1 · 09:14",  detail: "ICP match · Series B · 120 emp · clay.com/table/row/8821" },
  { tool: "PDL",       domain: "peopledatalabs.com", channel: "enrichment", event: "record_enriched",  ts: "Day 1 · 09:15",  detail: "Email verified · Phone appended · LinkedIn URL matched"     },
  { tool: "HubSpot",   domain: "hubspot.com",    channel: "crm",         event: "contact_created",    ts: "Day 1 · 09:16",  detail: "Owner: Alex · Deal stage: Prospecting · $18,400"           },
  { tool: "Instantly", domain: "instantly.ai",   channel: "email",       event: "sequence_enrolled",  ts: "Day 2 · 08:00",  detail: "Campaign: Series B Q1 · Step 1 of 5 queued"                },
  { tool: "Instantly", domain: "instantly.ai",   channel: "email",       event: "email_opened",       ts: "Day 2 · 11:42",  detail: "Open rate: 1st open · Device: Mac · Client: Gmail"         },
  { tool: "HeyReach",  domain: "heyreach.io",    channel: "linkedin",    event: "connection_sent",    ts: "Day 3 · 09:01",  detail: "2nd degree · Note attached: personalized intro"            },
  { tool: "HeyReach",  domain: "heyreach.io",    channel: "linkedin",    event: "reply_received",     ts: "Day 5 · 14:33",  detail: "\"Interested, let's connect\" · High-intent signal"        },
  { tool: "Stripe",    domain: "stripe.com",      channel: "billing",     event: "payment_succeeded",  ts: "Day 14 · 11:30", detail: "$18,400 ARR · Sub: sub_9f2a3c · Attribution: Clay → HeyReach" },
];

function ContactInspectorDemo() {
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(3);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-sm">
          <Search size={14} className="text-slate-500 shrink-0" />
          <span className={searched ? "text-slate-200" : "text-slate-600"}>
            {searched ? "a****@example.com" : "Search any email address…"}
          </span>
        </div>
        <button
          onClick={() => setSearched(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
        >
          Inspect
        </button>
      </div>

      {searched && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Contact card */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              AF
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">A**** F****</div>
              <div className="text-xs text-slate-400">a****@example.com · VP Growth · Acme Corp</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-emerald-400">$18,400 ARR</div>
              <div className="text-[10px] text-slate-500">8 events · 5 tools · 14 days to close</div>
            </div>
          </div>

          {/* Overlap warning */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
            <AlertTriangle size={12} className="shrink-0" />
            2 active sequences detected: Instantly + HeyReach both touching this contact simultaneously.
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/60">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cross-tool timeline</span>
            </div>
            <div className="divide-y divide-slate-800/50">
              {CONTACT_TIMELINE.map((ev, i) => (
                <button
                  key={i}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors"
                >
                  <ToolLogo domain={ev.domain} name={ev.tool} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-300">{ev.event}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${CHANNEL_PILL[ev.channel]}`}>{ev.channel}</span>
                    </div>
                    <AnimatePresence>
                      {expanded === i && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="text-[10px] text-slate-500 mt-0.5 leading-relaxed"
                        >
                          {ev.detail}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0 tabular-nums">{ev.ts}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {!searched && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center">
          <Search size={24} className="text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Enter an email to see full cross-tool history</p>
          <button
            onClick={() => setSearched(true)}
            className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Try a****@example.com →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Feature: Workflow Health ───────────────────────────────────────────────────

const HEALTH_DIMS = [
  { label: "Signal Latency",        score: 81, color: "emerald", detail: "78% of events arrive in < 4h · Avg: 2.1h",          status: "good" },
  { label: "Contact Frequency",     score: 64, color: "amber",   detail: "12 leads over-touched (5+ tools simultaneously)",    status: "warn" },
  { label: "Pipeline Coverage",     score: 71, color: "emerald", detail: "71% of sourced leads received outreach within 48h",  status: "good" },
  { label: "Enrichment Freshness",  score: 58, color: "amber",   detail: "31% of records enriched 90+ days ago — stale",       status: "warn" },
];

const FUNNEL_STAGES = [
  { label: "Sourced",   count: 4120, pct: 100, color: "bg-indigo-500" },
  { label: "Enriched",  count: 3840, pct: 93,  color: "bg-fuchsia-500" },
  { label: "Contacted", count: 2910, pct: 71,  color: "bg-sky-500" },
  { label: "Replied",   count: 612,  pct: 21,  color: "bg-blue-500" },
  { label: "Meetings",  count: 183,  pct: 30,  color: "bg-emerald-500" },
  { label: "Won",       count: 47,   pct: 26,  color: "bg-amber-500" },
];

function WorkflowHealthDemo() {
  const overallScore = 72;

  return (
    <div className="space-y-4">
      {/* Score + dimensions */}
      <div className="grid grid-cols-[auto_1fr] gap-4">
        {/* Score circle */}
        <div className="flex flex-col items-center justify-center w-28 h-28 rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="text-3xl font-bold text-white">{overallScore}</div>
          <div className="text-[10px] text-slate-500 text-center mt-0.5">Health<br />Score</div>
          <div className="text-[9px] text-amber-400 font-medium mt-1">Needs attention</div>
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_DIMS.map((d) => (
            <div key={d.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-slate-400">{d.label}</span>
                <span className={`text-[10px] font-bold ${d.status === "good" ? "text-emerald-400" : "text-amber-400"}`}>{d.score}</span>
              </div>
              <div className="h-1 rounded-full bg-slate-800 overflow-hidden mb-1.5">
                <div
                  className={`h-full rounded-full ${d.status === "good" ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${d.score}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-600 leading-tight">{d.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline funnel */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pipeline Funnel</span>
          <span className="text-[10px] text-slate-600">Last 30 days</span>
        </div>
        <div className="space-y-1.5">
          {FUNNEL_STAGES.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-3">
              <div className="w-16 text-[10px] text-slate-500 text-right shrink-0">{stage.label}</div>
              <div className="flex-1 h-5 rounded-md bg-slate-800 overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${stage.pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.07 }}
                  className={`h-full rounded-md ${stage.color} opacity-80`}
                />
              </div>
              <div className="w-16 text-[10px] text-slate-400 shrink-0 tabular-nums">
                {stage.count.toLocaleString()}
                {i > 0 && <span className="text-slate-600"> · {stage.pct}%</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feature: My Workflow ───────────────────────────────────────────────────────

const DEMO_STACKS = [
  {
    name: "Clay → HeyReach → Instantly",
    steps: [
      { tool: "Clay",      domain: "clay.com",     channel: "prospecting", event: "lead_imported",     condition: "always"                },
      { tool: "PDL",       domain: "peopledatalabs.com", channel: "enrichment", event: "record_enriched", condition: "always"              },
      { tool: "HeyReach",  domain: "heyreach.io",  channel: "linkedin",    event: "connection_sent",   condition: "always"                },
      { tool: "Instantly", domain: "instantly.ai", channel: "email",       event: "email_sent",        condition: "if reply not received"  },
    ],
    connected: 4,
    complete: 3,
  },
  {
    name: "Inbound → HubSpot → Outreach",
    steps: [
      { tool: "HubSpot",   domain: "hubspot.com",  channel: "crm",         event: "contact_created",   condition: "always"                },
      { tool: "Instantly", domain: "instantly.ai", channel: "email",       event: "sequence_enrolled", condition: "if deal stage: MQL"     },
      { tool: "HubSpot",   domain: "hubspot.com",  channel: "crm",         event: "deal_updated",      condition: "if reply received"      },
      { tool: "Stripe",    domain: "stripe.com",   channel: "billing",     event: "payment_succeeded", condition: "if demo booked"         },
    ],
    connected: 3,
    complete: 2,
  },
];

function MyWorkflowDemo() {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {DEMO_STACKS.map((stack, si) => (
        <div key={si} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          {/* Stack header */}
          <button
            onClick={() => setExpanded(expanded === si ? null : si)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors"
          >
            <GitBranch size={14} className="text-indigo-400 shrink-0" />
            <span className="flex-1 text-left text-sm font-semibold text-slate-200">{stack.name}</span>
            <div className="flex items-center gap-3 text-[10px] shrink-0">
              <span className="text-slate-500">{stack.steps.length} steps</span>
              <span className="text-emerald-400">{stack.connected} connected</span>
              <ChevronRight
                size={13}
                className={`text-slate-600 transition-transform ${expanded === si ? "rotate-90" : ""}`}
              />
            </div>
          </button>

          {/* Steps */}
          <AnimatePresence>
            {expanded === si && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-slate-800 divide-y divide-slate-800/50"
              >
                {stack.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[9px] text-slate-600 w-4 shrink-0">{i + 1}</span>
                    <ToolLogo domain={step.domain} name={step.tool} />
                    <span className="text-[11px] text-slate-300 font-medium">{step.tool}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${CHANNEL_PILL[step.channel]}`}>{step.channel}</span>
                    <code className="text-[10px] font-mono text-slate-400 flex-1">{step.event}</code>
                    <span className="text-[9px] text-slate-600 truncate max-w-[130px]">{step.condition}</span>
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* Add stack hint */}
      <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-700 text-xs text-slate-600 hover:border-indigo-500/40 hover:text-indigo-400 transition-colors">
        + New stack
      </button>
    </div>
  );
}

// ── Feature: Pipeline Health ───────────────────────────────────────────────────

const PIPELINE_TOOLS = [
  { name: "Clay",      domain: "clay.com",       channel: "prospecting", status: "Healthy", last: "2s ago",   e24: 412,  e7d: 2841 },
  { name: "PDL",       domain: "peopledatalabs.com", channel: "enrichment", status: "Healthy", last: "14s ago", e24: 388, e7d: 2610 },
  { name: "HeyReach",  domain: "heyreach.io",    channel: "linkedin",    status: "Healthy", last: "38s ago",  e24: 93,   e7d: 604  },
  { name: "Instantly", domain: "instantly.ai",   channel: "email",       status: "Warning", last: "4m ago",   e24: 61,   e7d: 1840 },
  { name: "HubSpot",   domain: "hubspot.com",    channel: "crm",         status: "Healthy", last: "1m ago",   e24: 34,   e7d: 218  },
  { name: "Stripe",    domain: "stripe.com",     channel: "billing",     status: "Silent",  last: "2d ago",   e24: 0,    e7d: 7    },
];

const ALARMS = [
  { severity: "error",   icon: WifiOff,        title: "Stripe is silent",           body: "No events in 48h. Expected: payment_succeeded, subscription_created. Check webhook config." },
  { severity: "warning", icon: AlertTriangle,  title: "Instantly reply rate drop",  body: "Reply rate fell from 12% → 4.2% in 72h. Check sequence step 3 subject line." },
  { severity: "info",    icon: Bell,           title: "Clay import volume spike",   body: "412 leads imported today — 3× daily average. Verify list source quality." },
];

const ALARM_STYLE: Record<string, string> = {
  error:   "border-rose-500/30 bg-rose-500/5 text-rose-400",
  warning: "border-amber-500/30 bg-amber-500/5 text-amber-400",
  info:    "border-indigo-500/30 bg-indigo-500/5 text-indigo-400",
};

function PipelineHealthDemo() {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Connected", value: "6",  color: "text-white" },
          { label: "Healthy",   value: "4",  color: "text-emerald-400" },
          { label: "Alarms",    value: "3",  color: "text-rose-400" },
          { label: "Events 24h", value: "988", color: "text-white" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tool table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-slate-800 bg-slate-950/60">
          {["Tool", "Channel", "Status", "24h", "7d"].map((h) => (
            <div key={h} className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider">{h}</div>
          ))}
        </div>
        {PIPELINE_TOOLS.map((tool) => (
          <div
            key={tool.name}
            className="grid grid-cols-[1.5fr_1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-slate-800/40 last:border-0 items-center"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ToolLogo domain={tool.domain} name={tool.name} />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200 truncate">{tool.name}</div>
                <div className="text-[9px] text-slate-600">{tool.last}</div>
              </div>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border w-fit ${CHANNEL_PILL[tool.channel]}`}>{tool.channel}</span>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[tool.status as keyof typeof STATUS_DOT]}`} />
              <span className={`text-[10px] font-medium ${STATUS_COLORS[tool.status as keyof typeof STATUS_COLORS]}`}>{tool.status}</span>
            </div>
            <span className="text-xs font-semibold text-slate-300 tabular-nums">{tool.e24.toLocaleString()}</span>
            <span className="text-[10px] text-slate-500 tabular-nums">{tool.e7d.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Alarms */}
      <div className="space-y-2">
        {ALARMS.map((alarm) => {
          const Icon = alarm.icon;
          return (
            <div key={alarm.title} className={`flex gap-3 p-3 rounded-xl border ${ALARM_STYLE[alarm.severity]}`}>
              <Icon size={14} className="shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-200 mb-0.5">{alarm.title}</div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{alarm.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Feature: GTM Report ────────────────────────────────────────────────────────

const METRICS = [
  { label: "Open Rate",    value: "54%",   benchmark: "40–60%",  status: "good" },
  { label: "Reply Rate",   value: "11.2%", benchmark: "3–8%",    status: "good" },
  { label: "Bounce Rate",  value: "3.1%",  benchmark: "< 2%",    status: "warn" },
  { label: "Meeting Rate", value: "8.4%",  benchmark: "> 10%",   status: "warn" },
  { label: "Unsubscribe",  value: "0.3%",  benchmark: "< 0.5%",  status: "good" },
  { label: "Pipeline",     value: "$817K", benchmark: "—",       status: "good" },
];

function GTMReportDemo() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">GTM Performance Report</div>
          <div className="text-[10px] text-slate-500">Last 30 days · Auto-generated</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
            <RefreshCw size={11} /> Refresh
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-colors">
            Export PDF
          </button>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2">
        {METRICS.map((m) => (
          <div key={m.label} className={`rounded-xl border p-3 ${m.status === "good" ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</div>
            <div className="text-lg font-bold text-white">{m.value}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-[9px] font-medium ${m.status === "good" ? "text-emerald-400" : "text-amber-400"}`}>
                {m.status === "good" ? "On target" : "Below benchmark"}
              </span>
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">benchmark: {m.benchmark}</div>
          </div>
        ))}
      </div>

      {/* Signal tier grid */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Signal Activity by Tier</div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { tier: "High Intent",  count: 47,  color: "emerald", desc: "Reply + meeting" },
            { tier: "Warm",         count: 183, color: "indigo",  desc: "Email opens, clicks" },
            { tier: "Cold Targeted",count: 1240, color: "slate",  desc: "Sourced, no response" },
            { tier: "Experimental", count: 88,  color: "fuchsia", desc: "A/B test variant" },
          ].map((tier) => (
            <div key={tier.tier} className="rounded-lg border border-slate-800 p-2.5 text-center">
              <div className={`text-lg font-bold ${tier.color === "slate" ? "text-slate-400" : `text-${tier.color}-400`}`}>
                {tier.count}
              </div>
              <div className="text-[9px] font-semibold text-slate-300 mt-0.5">{tier.tier}</div>
              <div className="text-[9px] text-slate-600 mt-0.5">{tier.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Diagnostics */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Automated Diagnostics</div>
        <div className="space-y-2">
          {[
            { severity: "warn",  msg: "Bounce rate 3.1% exceeds 2% threshold — consider warming additional domains" },
            { severity: "good",  msg: "Reply rate 11.2% outperforms 8% benchmark — Clay + HeyReach combination is working" },
            { severity: "warn",  msg: "Meeting show-up rate 68% — below 80% benchmark. Review pre-meeting reminder cadence" },
          ].map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${d.severity === "good" ? "bg-emerald-500" : "bg-amber-500"}`} />
              <p className="text-[10px] text-slate-400 leading-relaxed">{d.msg}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main demo page ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: "live-feed",
    label: "Live Feed",
    icon: Zap,
    tagline: "Real-time event stream from every connected tool",
    description: "Every event from every tool in one stream. Toggle live mode, filter by events, apps, or saved stacks. Click any lead ID to open Contact Inspector.",
    component: LiveFeedDemo,
  },
  {
    id: "contact",
    label: "Contact Inspector",
    icon: Search,
    tagline: "Full cross-tool timeline for any contact",
    description: "Search any email address and see the complete journey across all tools — enrichment, sequences, LinkedIn touches, meetings, and revenue. Overlap detection included.",
    component: ContactInspectorDemo,
  },
  {
    id: "workflow-health",
    label: "Workflow Health",
    icon: HeartPulse,
    tagline: "Process quality analysis across your whole stack",
    description: "Health score across 4 dimensions: signal latency, contact frequency, pipeline coverage, and enrichment freshness. Full funnel with stage-by-stage conversion.",
    component: WorkflowHealthDemo,
  },
  {
    id: "my-workflow",
    label: "My Workflow",
    icon: GitBranch,
    tagline: "Build and monitor your GTM stacks step by step",
    description: "Define named workflow stacks with ordered steps, expected events, and conditional logic. See which steps are connected and which have received events.",
    component: MyWorkflowDemo,
  },
  {
    id: "pipeline-health",
    label: "Pipeline Health",
    icon: Activity,
    tagline: "Per-tool status monitoring with silence detection",
    description: "See every tool's health at a glance — Healthy, Warning, or Silent. Alarms fire when a tool goes quiet, rates drop, or volume spikes unexpectedly.",
    component: PipelineHealthDemo,
  },
  {
    id: "gtm-report",
    label: "GTM Report",
    icon: FileText,
    tagline: "Automated performance reporting with benchmarks",
    description: "Consolidated metrics with industry benchmarks, signal activity by tier, pipeline funnel, and automated diagnostics — all exportable as PDF or XLSX.",
    component: GTMReportDemo,
  },
];

export default function DemoPage() {
  const [active, setActive] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;
    const t = setInterval(() => setActive((p) => (p + 1) % FEATURES.length), 6000);
    return () => clearInterval(t);
  }, [autoPlay]);

  const feature = FEATURES[active];
  const Component = feature.component;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      {/* Demo banner */}
      <div className="border-b border-amber-500/20 bg-amber-500/5 py-2.5 px-4 text-center">
        <p className="text-xs text-amber-300 flex items-center justify-center gap-2">
          <span className="flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          Interactive demo with mock data.{" "}
          <a href="/signup" className="font-semibold underline hover:text-amber-200 transition-colors">
            Start your free trial →
          </a>
        </p>
      </div>

      <main className="flex-1">

        {/* Hero */}
        <section className="py-16 md:py-20 px-4 text-center border-b border-slate-900 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[180px] bg-indigo-500/8 blur-[90px] rounded-full pointer-events-none" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 mb-5 text-xs font-medium text-indigo-300">
              <Play size={10} className="fill-current" />
              Interactive Product Demo
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Full observability for{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
                your GTM stack
              </span>
            </h1>
            <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto leading-relaxed">
              Click through each feature below to see exactly what iqpipe shows when your tools are connected.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="/signup"
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
              >
                Start free trial <ArrowRight size={15} />
              </a>
              <a
                href="/integrations"
                className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 px-6 py-3 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all"
              >
                <Plug size={14} /> View integrations
              </a>
            </div>
          </motion.div>
        </section>

        {/* Feature tour */}
        <section className="py-12 px-4">
          <div className="max-w-6xl mx-auto">

            {/* Feature tabs */}
            <div className="flex flex-wrap gap-2 mb-8 justify-center">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setActive(i); setAutoPlay(false); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                      active === i
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                        : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <Icon size={13} />
                    {f.label}
                  </button>
                );
              })}
              <button
                onClick={() => setAutoPlay((p) => !p)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  autoPlay
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-slate-800 text-slate-600 hover:text-slate-400"
                }`}
              >
                {autoPlay ? <><Pause size={12} /> Stop tour</> : <><Play size={12} /> Auto tour</>}
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 mb-8">
              {FEATURES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setActive(i); setAutoPlay(false); }}
                  className={`transition-all rounded-full ${i === active ? "w-6 h-1.5 bg-indigo-400" : "w-1.5 h-1.5 bg-slate-700"}`}
                />
              ))}
            </div>

            {/* Feature panel */}
            <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
              {/* Left: description */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={active + "-desc"}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border mb-4 bg-indigo-500/10 border-indigo-500/20 text-indigo-300`}>
                    <feature.icon size={12} />
                    {feature.label}
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-3 leading-tight">{feature.tagline}</h2>
                  <p className="text-sm text-slate-400 leading-relaxed mb-6">{feature.description}</p>

                  {/* Navigation */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setActive((active - 1 + FEATURES.length) % FEATURES.length); setAutoPlay(false); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => { setActive((active + 1) % FEATURES.length); setAutoPlay(false); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                    >
                      Next feature <ArrowRight size={11} />
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Right: demo panel */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={active + "-panel"}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
                >
                  <Component />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Integrations strip */}
        <section className="py-12 px-4 border-t border-slate-900">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-6">Connects with your existing stack</p>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { name: "Clay",      domain: "clay.com"           },
                { name: "Apollo",    domain: "apollo.io"          },
                { name: "HubSpot",   domain: "hubspot.com"        },
                { name: "Instantly", domain: "instantly.ai"       },
                { name: "HeyReach",  domain: "heyreach.io"        },
                { name: "Lemlist",   domain: "lemlist.com"        },
                { name: "Smartlead", domain: "smartlead.ai"       },
                { name: "Stripe",    domain: "stripe.com"         },
                { name: "Salesforce",domain: "salesforce.com"     },
                { name: "Clearbit",  domain: "clearbit.com"       },
                { name: "n8n",       domain: "n8n.io"             },
                { name: "Make",      domain: "make.com"           },
              ].map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/60 text-xs text-slate-400"
                >
                  <ToolLogo domain={tool.domain} name={tool.name} />
                  {tool.name}
                </div>
              ))}
              <a
                href="/integrations"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-400 hover:bg-indigo-500/20 transition-colors"
              >
                +40 more <ArrowUpRight size={11} />
              </a>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-4 text-center border-t border-slate-900">
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex justify-center mb-5">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Fingerprint size={24} />
                </div>
              </div>
              <h2 className="text-3xl font-bold mb-3">Ready to connect your stack?</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                Paste a webhook URL and events start flowing in under 5 minutes. No card required.
              </p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <a
                  href="/signup"
                  className="inline-flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20"
                >
                  Start free — no card needed <ArrowRight size={16} />
                </a>
                <a
                  href="/pricing"
                  className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 px-8 py-4 rounded-full font-semibold hover:bg-slate-800 transition-all"
                >
                  View pricing
                </a>
              </div>
              <p className="mt-4 text-xs text-slate-600">Connects in 5 minutes · paste a webhook URL and events start flowing</p>
            </motion.div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
