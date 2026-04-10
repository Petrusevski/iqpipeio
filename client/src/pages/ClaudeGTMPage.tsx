import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Zap, Activity, AlertTriangle, CheckCircle2, ArrowRight,
  Terminal, Radio, ShieldCheck, BarChart3, Target, RefreshCw,
  ChevronRight, MessageSquare, Code2, Cpu, Workflow,
  Plus, SlidersHorizontal, Send,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { Link } from "react-router-dom";

// ─── Mock data ────────────────────────────────────────────────────────────────

const LIVE_FEED_EVENTS = [
  { tool: "Apollo",    event: "sequence_started",  contact: "sarah@growth.io",     time: "2s ago",  color: "text-orange-400",  dot: "bg-orange-400" },
  { tool: "HeyReach", event: "connection_sent",    contact: "mike@techcorp.com",    time: "8s ago",  color: "text-pink-400",    dot: "bg-pink-400"   },
  { tool: "Clay",     event: "lead_imported",      contact: "anna@scale.ai",        time: "14s ago", color: "text-sky-400",     dot: "bg-sky-400"    },
  { tool: "Lemlist",  event: "email_sent",         contact: "james@ventures.com",   time: "22s ago", color: "text-violet-400",  dot: "bg-violet-400" },
  { tool: "HubSpot",  event: "deal_created",       contact: "laura@series-b.com",   time: "35s ago", color: "text-orange-500",  dot: "bg-orange-500" },
  { tool: "Apollo",   event: "reply_received",     contact: "david@enterprise.io",  time: "1m ago",  color: "text-emerald-400", dot: "bg-emerald-400"},
];

const WORKFLOW_HEALTH = [
  { name: "Clay → HeyReach → HubSpot",  score: 91, grade: "A", reliability: 94, conversion: 8.4,  leakage: 1200,  status: "healthy"  },
  { name: "Apollo → Lemlist → Pipedrive",score: 67, grade: "C", reliability: 71, conversion: 3.1,  leakage: 8400,  status: "warning"  },
  { name: "ZoomInfo → Instantly → SF",   score: 44, grade: "D", reliability: 48, conversion: 1.2,  leakage: 22000, status: "critical" },
];

const STUCK_LEADS = [
  { name: "Mike Chen",    company: "TechCorp",    tool: "HeyReach",  days: 18, touches: 6 },
  { name: "Sarah Kim",    company: "Acme Inc",    tool: "Lemlist",   days: 12, touches: 4 },
  { name: "James Liu",    company: "Scale.ai",    tool: "Instantly", days: 9,  touches: 3 },
  { name: "Anna Novak",   company: "Ventures Co", tool: "Apollo",    days: 7,  touches: 2 },
];

const MCP_CONVERSATIONS = [
  {
    key: "lead_status",
    label: "Lead safety gate",
    icon: ShieldCheck,
    color: "emerald",
    prompt: "Before I enroll these 3 leads in the HeyReach sequence, check if they are safe to contact.",
    tool_call: `check_lead_status({
  emails: [
    "mike@techcorp.com",
    "sarah@acme.com",
    "james@scale.ai"
  ]
})`,
    tool_result: `{
  "total": 3,
  "safeToContact": 2,
  "blocked": 1,
  "leads": [
    { "email": "mike@techcorp.com",
      "safeToContact": false,
      "reason": "Active in sequence — 6 touches, 18d silent" },
    { "email": "sarah@acme.com",
      "safeToContact": true },
    { "email": "james@scale.ai",
      "safeToContact": true }
  ]
}`,
    claude_reply: "mike@techcorp.com is already in an active sequence and has been silent for 18 days — I'll skip him to avoid overlap. Enrolling sarah@acme.com and james@scale.ai now.",
  },
  {
    key: "sequence_rec",
    label: "Sequence selection",
    icon: Target,
    color: "indigo",
    prompt: "Which sequence should I use for a VP of Growth at a Series B SaaS company sourced from Clay?",
    tool_call: `get_sequence_recommendation({
  title: "VP of Growth",
  company: "Series B SaaS",
  source_tool: "clay",
  channel: "email"
})`,
    tool_result: `{
  "recommendations": [
    {
      "sequenceId": "seq_vp_growth_q2",
      "tool": "lemlist",
      "replyRate": 14.2,
      "meetingRate": 6.8,
      "relevanceScore": 87,
      "reason": "High ICP match — title overlap 91%, same source tool"
    },
    {
      "sequenceId": "seq_enterprise_cold",
      "tool": "instantly",
      "replyRate": 6.1,
      "meetingRate": 2.3,
      "relevanceScore": 52
    }
  ]
}`,
    claude_reply: "seq_vp_growth_q2 in Lemlist is the clear choice — 14.2% reply rate vs 6.1% for the next best, and it has a 91% title match to your ICP. I'll enroll them there.",
  },
  {
    key: "confirm_event",
    label: "Execution confirmation",
    icon: Radio,
    color: "sky",
    prompt: "I just triggered the HeyReach campaign 5 minutes ago. Did the webhook actually arrive?",
    tool_call: `confirm_event_received({
  tool: "heyreach",
  since_minutes: 10,
  event_type: "sequence_started"
})`,
    tool_result: `{
  "arrived": true,
  "processed": 4,
  "dropped": 0,
  "errors": 0,
  "total": 4,
  "windowMinutes": 10,
  "verdict": "All 4 sequence_started events arrived and processed successfully."
}`,
    claude_reply: "Confirmed — all 4 sequence_started webhooks from HeyReach arrived and were processed. No drops, no errors. The campaign is live.",
  },
  {
    key: "improvement",
    label: "Campaign evaluation",
    icon: BarChart3,
    color: "fuchsia",
    prompt: "What should I fix in my GTM stack this week? Give me a ranked improvement report.",
    tool_call: `get_improvement_report({
  days: 30
})`,
    tool_result: `{
  "summary": {
    "issueCount": 4,
    "criticalIssues": 1,
    "warningIssues": 3,
    "stuckLeadCount": 23
  },
  "issues": [
    { "severity": "critical",
      "title": "ZoomInfo → Instantly workflow: 48% reliability",
      "detail": "22 failed events. Est. leakage $22,000." },
    { "severity": "warning",
      "title": "23 leads stuck 7+ days with no reply",
      "detail": "Consider a follow-up step or sequence rotation." }
  ],
  "suggestions": [
    { "priority": 1, "action": "Fix Instantly webhook identity fields",
      "n8n_hint": "Add Set node before HTTP Request — map email field from payload" }
  ]
}`,
    claude_reply: "Critical: your ZoomInfo → Instantly workflow is at 48% reliability with ~$22K in estimated leakage. I'll fix the identity field mapping in n8n now. Also flagging 23 stuck leads — want me to rotate them into a follow-up sequence?",
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function AppMockLiveFeed() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <Zap size={11} className="text-indigo-400" />
          <span className="text-[11px] font-semibold text-slate-400">Live Feed</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-emerald-400">Live</span>
        </div>
      </div>
      <div className="divide-y divide-slate-800/50">
        {LIVE_FEED_EVENTS.map((e, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-900/40 transition-colors"
          >
            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${e.dot}`} />
            <span className={`text-[11px] font-semibold w-16 shrink-0 ${e.color}`}>{e.tool}</span>
            <code className="text-[10px] font-mono text-slate-400 flex-1 truncate">{e.event}</code>
            <span className="text-[10px] text-slate-600 truncate max-w-[110px]">{e.contact}</span>
            <span className="text-[10px] text-slate-700 shrink-0">{e.time}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AppMockWorkflowHealth() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <Activity size={11} className="text-indigo-400" />
          <span className="text-[11px] font-semibold text-slate-400">Workflow Health</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {WORKFLOW_HEALTH.map((w, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`rounded-lg border p-3 ${
              w.status === "critical" ? "border-rose-500/25 bg-rose-500/5" :
              w.status === "warning"  ? "border-amber-500/25 bg-amber-500/5" :
              "border-slate-800 bg-slate-900/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                w.status === "critical" ? "text-rose-400 border-rose-500/30 bg-rose-500/10" :
                w.status === "warning"  ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              }`}>{w.grade}</span>
              <span className="text-[11px] font-medium text-slate-300 truncate flex-1">{w.name}</span>
              <span className={`text-[11px] font-bold ${
                w.score >= 80 ? "text-emerald-400" : w.score >= 60 ? "text-amber-400" : "text-rose-400"
              }`}>{w.score}</span>
            </div>
            <div className="flex gap-4 text-[10px] text-slate-500">
              <span>Reliability <span className={w.reliability >= 80 ? "text-emerald-400" : "text-rose-400"}>{w.reliability}%</span></span>
              <span>Reply <span className="text-slate-300">{w.conversion}%</span></span>
              <span>Leakage <span className={w.leakage > 5000 ? "text-rose-400" : "text-slate-400"}>${(w.leakage/1000).toFixed(0)}K</span></span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AppMockStuckLeads() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <AlertTriangle size={11} className="text-amber-400" />
          <span className="text-[11px] font-semibold text-slate-400">Stuck Leads</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 font-bold">{STUCK_LEADS.length}</span>
        </div>
      </div>
      <div className="divide-y divide-slate-800/50">
        {STUCK_LEADS.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.07 }}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-400 shrink-0">
              {l.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-slate-200 truncate">{l.name}</p>
              <p className="text-[10px] text-slate-600 truncate">{l.company}</p>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-400">{l.tool}</span>
            <span className={`text-[11px] font-bold ${l.days >= 14 ? "text-rose-400" : l.days >= 7 ? "text-amber-400" : "text-slate-400"}`}>{l.days}d</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ClaudeConversation({ conv }: { conv: typeof MCP_CONVERSATIONS[0] }) {
  const Icon = conv.icon;
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-500/25 bg-emerald-500/5 text-emerald-400",
    indigo:  "border-indigo-500/25 bg-indigo-500/5 text-indigo-400",
    sky:     "border-sky-500/25 bg-sky-500/5 text-sky-400",
    fuchsia: "border-fuchsia-500/25 bg-fuchsia-500/5 text-fuchsia-400",
  };
  const toolColor: Record<string, string> = {
    emerald: "text-emerald-300 border-emerald-500/20 bg-emerald-500/5",
    indigo:  "text-indigo-300 border-indigo-500/20 bg-indigo-500/5",
    sky:     "text-sky-300 border-sky-500/20 bg-sky-500/5",
    fuchsia: "text-fuchsia-300 border-fuchsia-500/20 bg-fuchsia-500/5",
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <Bot size={11} className="text-indigo-400" />
          <span className="text-[11px] font-semibold text-slate-400">Claude — claude.ai</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10">
          <img src="/logo.png" alt="iqpipe" className="h-3 w-3 object-contain" />
          <span className="text-[10px] text-indigo-300 font-medium">iqpipe MCP</span>
          <CheckCircle2 size={9} className="text-emerald-400" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* User prompt */}
        <div className="flex gap-3 justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600/20 border border-indigo-500/20 px-3.5 py-2.5">
            <p className="text-[12px] text-slate-200 leading-relaxed">{conv.prompt}</p>
          </div>
          <div className="h-7 w-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[9px] font-bold text-indigo-300">YOU</span>
          </div>
        </div>

        {/* Tool call */}
        <div className={`rounded-xl border p-3 ${colorMap[conv.color]}`}>
          <div className="flex items-center gap-2 mb-2">
            <Icon size={11} className="shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Calling iqpipe MCP tool</span>
            <RefreshCw size={9} className="ml-auto animate-spin opacity-60" />
          </div>
          <pre className={`text-[10px] font-mono leading-relaxed rounded-lg border p-3 bg-slate-950 overflow-x-auto ${toolColor[conv.color]}`}>
            {conv.tool_call}
          </pre>
        </div>

        {/* Tool result */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Code2 size={10} className="text-slate-500" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">iqpipe response</span>
          </div>
          <pre className="text-[10px] font-mono text-slate-400 leading-relaxed overflow-x-auto max-h-36 scrollbar-none">
            {conv.tool_result}
          </pre>
        </div>

        {/* Claude reply */}
        <div className="flex gap-3">
          <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={12} className="text-slate-300" />
          </div>
          <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-800/60 border border-slate-700/50 px-3.5 py-2.5">
            <p className="text-[12px] text-slate-200 leading-relaxed">{conv.claude_reply}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Claude MCP Simulator ─────────────────────────────────────────────────────

const DEMO_PROMPTS = [
  {
    key: "safety",
    short: "Are these Clay leads safe to contact?",
    full: "Before I enroll these leads from Clay in the HeyReach sequence, check if any are already in an active outreach.",
    stages: [
      { type: "thinking" as const,  text: ""                                                                                                     },
      { type: "tool"    as const,   text: "check_lead_status",  detail: "Checking 3 leads against active sequences..."                          },
      { type: "result"  as const,   text: "2 safe · 1 blocked — mike@techcorp.com already in active sequence (18d silent, 6 touches)"            },
      { type: "reply"   as const,   text: "mike@techcorp.com is already in an active sequence — skipping to avoid overlap. Enrolling the other 2 now." },
    ],
  },
  {
    key: "sequence",
    short: "Best sequence for VP of Sales on LinkedIn?",
    full: "Which LinkedIn sequence should I run for a VP of Sales at a mid-market SaaS company?",
    stages: [
      { type: "thinking" as const,  text: ""                                                                                                     },
      { type: "tool"    as const,   text: "get_sequence_recommendation", detail: "Scanning sequence performance for this ICP..."                 },
      { type: "result"  as const,   text: "seq_linkedin_vp_outbound · reply rate 18.4% · meeting rate 6.1% · relevance score 94"                },
      { type: "reply"   as const,   text: "Use seq_linkedin_vp_outbound — it has an 18.4% reply rate for VP-level SaaS contacts and outperforms the next best by 9 points." },
    ],
  },
  {
    key: "delivery",
    short: "Did n8n deliver the leads to HeyReach?",
    full: "My n8n workflow ran 20 minutes ago. Confirm the leads were actually received and processed by HeyReach.",
    stages: [
      { type: "thinking" as const,  text: ""                                                                                                     },
      { type: "tool"    as const,   text: "confirm_event_received", detail: "Checking HeyReach event log for the last 30 minutes..."            },
      { type: "result"  as const,   text: "47 of 47 events arrived · all processed · 0 failed · last event 18 minutes ago"                      },
      { type: "reply"   as const,   text: "All 47 leads landed in HeyReach and were processed successfully. Nothing was dropped." },
    ],
  },
  {
    key: "anomaly",
    short: "Why is my outbound dropping this week?",
    full: "Outbound performance looks worse than last week. What is causing it and what should I fix first?",
    stages: [
      { type: "thinking" as const,  text: ""                                                                                                     },
      { type: "tool"    as const,   text: "get_improvement_report", detail: "Analyzing workflow health, funnel drops and anomalies..."           },
      { type: "result"  as const,   text: "3 issues found · ZoomInfo→Instantly workflow at health score 44 · 22k leads leaking · conversion 1.2% (was 4.8%)" },
      { type: "reply"   as const,   text: "The ZoomInfo → Instantly workflow is the primary cause — health score dropped to 44 and is leaking 22k leads at the top of funnel. I'd pause it, audit the enrichment step, and recheck delivery before re-enrolling." },
    ],
  },
];

type SimStage = { type: "thinking" | "tool" | "result" | "reply"; text: string; detail?: string };

function ClaudeMCPSimulator() {
  const [activePrompt, setActivePrompt]   = useState<number | null>(null);
  const [visibleStages, setVisibleStages] = useState<SimStage[]>([]);
  const [running, setRunning]             = useState(false);
  const chatRef                           = useRef<HTMLDivElement>(null);
  const timerRef                          = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }

  function runDemo(idx: number) {
    clearTimers();
    setActivePrompt(idx);
    setVisibleStages([]);
    setRunning(true);
    const stages = DEMO_PROMPTS[idx].stages;
    stages.forEach((stage, i) => {
      const t = setTimeout(() => {
        setVisibleStages(prev => [...prev, stage]);
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
        if (i === stages.length - 1) setRunning(false);
      }, 600 + i * 1100);
      timerRef.current.push(t);
    });
  }

  useEffect(() => () => clearTimers(), []);

  const prompt = activePrompt !== null ? DEMO_PROMPTS[activePrompt] : null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Browser chrome */}
      <div className="rounded-2xl border border-slate-700/60 bg-[#1a1b26] shadow-2xl overflow-hidden">

        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 bg-[#13141f]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/70" />
            <span className="w-3 h-3 rounded-full bg-amber-400/70" />
            <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            claude.ai
          </div>
          {/* iqpipe MCP badge */}
          <div className="flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-indigo-300">iqpipe MCP</span>
            <CheckCircle2 size={9} className="text-emerald-400" />
          </div>
        </div>

        {/* Header greeting */}
        <div className="pt-10 pb-6 px-6 text-center border-b border-slate-800/60">
          <div className="flex items-center justify-center gap-3 mb-3">
            {/* Anthropic asterisk */}
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
              <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <span className="text-2xl font-semibold text-white">{"Hey, GTM team"}</span>
          </div>
          <p className="text-sm text-slate-400">{"iqpipe is connected. Ask anything about your GTM stack."}</p>
        </div>

        {/* Chat area */}
        <div ref={chatRef} className="min-h-[220px] max-h-72 overflow-y-auto px-6 py-5 space-y-4 scroll-smooth">
          {activePrompt === null && (
            <div className="flex items-center justify-center h-28">
              <p className="text-sm text-slate-600 text-center">{"Pick a prompt below to see Claude use iqpipe live."}</p>
            </div>
          )}

          {prompt && (
            <>
              {/* User message */}
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5">
                  <p className="text-sm text-white leading-relaxed">{prompt.full}</p>
                </div>
              </motion.div>

              {/* Stages */}
              {visibleStages.map((stage, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  {stage.type === "thinking" && (
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-[#2a2b3d] border border-slate-700 flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
                          <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="flex gap-1 py-2">
                        {[0,1,2].map(d => (
                          <motion.span key={d} animate={{ opacity: [0.2,1,0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: d*0.2 }}
                            className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        ))}
                      </div>
                    </div>
                  )}

                  {stage.type === "tool" && (
                    <div className="flex items-start gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-[#2a2b3d] border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
                          <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="rounded-xl border border-indigo-500/25 bg-indigo-950/40 px-3.5 py-2.5 max-w-[85%]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">iqpipe MCP</span>
                        </div>
                        <code className="text-[11px] text-indigo-300 font-mono">{stage.text}()</code>
                        {stage.detail && <p className="text-[10px] text-slate-500 mt-1">{stage.detail}</p>}
                      </div>
                    </div>
                  )}

                  {stage.type === "result" && (
                    <div className="ml-9">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-3.5 py-2.5 max-w-[85%]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle2 size={9} className="text-emerald-400" />
                          <span className="text-[10px] font-semibold text-emerald-400">iqpipe returned</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{stage.text}</p>
                      </div>
                    </div>
                  )}

                  {stage.type === "reply" && (
                    <div className="flex items-start gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-[#2a2b3d] border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
                          <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="rounded-2xl rounded-tl-sm bg-[#2a2b3d] border border-slate-700/50 px-4 py-3 max-w-[85%]">
                        <p className="text-sm text-slate-200 leading-relaxed">{stage.text}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {running && visibleStages.length > 0 && visibleStages[visibleStages.length - 1].type !== "thinking" && (
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-[#2a2b3d] border border-slate-700 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
                      <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="flex gap-1 py-2">
                    {[0,1,2].map(d => (
                      <motion.span key={d} animate={{ opacity: [0.2,1,0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: d*0.2 }}
                        className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Prompt pills */}
        <div className="px-5 pt-3 pb-2 border-t border-slate-800/60 flex flex-wrap gap-2">
          {DEMO_PROMPTS.map((p, i) => (
            <button
              key={p.key}
              onClick={() => runDemo(i)}
              disabled={running}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-full border transition-all ${
                activePrompt === i
                  ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                  : "border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-600"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {p.short}
            </button>
          ))}
        </div>

        {/* Input bar (decorative) */}
        <div className="px-5 pb-5 pt-2">
          <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-[#13141f] px-4 py-3">
            <button className="text-slate-600 hover:text-slate-400 transition-colors"><Plus size={16} /></button>
            <button className="text-slate-600 hover:text-slate-400 transition-colors"><SlidersHorizontal size={15} /></button>
            <span className="flex-1 text-sm text-slate-600">{"Ask about your GTM stack..."}</span>
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>Claude Sonnet 4</span>
              <div className="h-7 w-7 rounded-lg bg-[#cc785c] flex items-center justify-center">
                <Send size={12} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Label */}
      <p className="text-center text-xs text-slate-600 mt-4">
        {"Click any prompt above to simulate. iqpipe MCP is connected — Claude calls live GTM data before every answer."}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClaudeGTMPage() {
  const [activeConv, setActiveConv] = useState(0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative border-b border-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-indigo-500/8 blur-[100px] pointer-events-none" />
          <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-16 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-medium text-indigo-300 mb-6">
                <Bot size={11} /> How Claude uses iqpipe
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
                What Claude sees.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
                  What Claude decides.
                </span>
              </h1>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-8">
                Two steps. Step 1 — your automation health, live in the iqpipe app. Step 2 — Claude reads it all through the MCP server and turns data into precise GTM decisions.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link to="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-full font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                  Connect Claude free <ArrowRight size={14} />
                </Link>
                <Link to="/mcp-protocol" className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 px-6 py-3 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all">
                  View MCP tools
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Claude MCP Simulator ── */}
        <section className="py-20 px-4 border-b border-slate-900 bg-[#0d0e1a]">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-medium text-indigo-300 mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live simulation &mdash; iqpipe connected
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
                {"This is what Claude sees"}
              </h2>
              <p className="text-slate-400 max-w-xl mx-auto text-base leading-relaxed">
                {"With iqpipe connected, every GTM question Claude gets is answered with live data — not a guess."}
              </p>
            </div>
            <ClaudeMCPSimulator />
          </div>
        </section>

        {/* ── Step 1: App screens ── */}
        <section className="py-24 px-4 border-b border-slate-900">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-400">1</div>
              <div>
                <h2 className="text-2xl font-bold text-white">Your GTM stack, fully observed</h2>
                <p className="text-slate-400 text-sm mt-0.5">Every webhook, every lead, every workflow — visible in real time inside iqpipe.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 mt-10">
              {/* Live Feed */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-300">Live Feed</span>
                  <span className="text-[10px] text-slate-600 ml-auto">Events from all connected tools</span>
                </div>
                <AppMockLiveFeed />
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  Every webhook from Apollo, HeyReach, Lemlist and HubSpot arrives here in real time. Claude queries this via <code className="text-indigo-400">get_live_feed</code>.
                </p>
              </div>

              {/* Workflow Health */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-300">Workflow Health</span>
                  <span className="text-[10px] text-slate-600 ml-auto">GTM Alpha Score per workflow</span>
                </div>
                <AppMockWorkflowHealth />
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  Each workflow is scored on reliability, conversion, velocity, and leakage. Claude queries via <code className="text-indigo-400">get_workflow_health</code>.
                </p>
              </div>

              {/* Stuck Leads */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={13} className="text-amber-400" />
                  <span className="text-xs font-semibold text-slate-300">Stuck Leads</span>
                  <span className="text-[10px] text-slate-600 ml-auto">Leads silent for 7+ days</span>
                </div>
                <AppMockStuckLeads />
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  Leads with no reply and no progression are surfaced here. Claude queries via <code className="text-indigo-400">get_stuck_leads</code>.
                </p>
              </div>
            </div>

            {/* Data trail note */}
            <div className="mt-8 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 px-6 py-4 flex items-start gap-4">
              <Cpu size={18} className="text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-indigo-200 mb-1">All of this is queryable by Claude via MCP — in real time</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every screen in the iqpipe app has a corresponding MCP tool. Claude does not access a static export — it calls the same live data layer your dashboard reads from. When your automation runs at 2am, Claude can query it at 2am.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Step 2: Claude MCP conversations ── */}
        <section className="py-24 px-4">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-sm font-bold text-fuchsia-400">2</div>
              <div>
                <h2 className="text-2xl font-bold text-white">Claude reads the data, makes the decision</h2>
                <p className="text-slate-400 text-sm mt-0.5">Each MCP tool call returns live iqpipe data. Claude synthesizes it into a precise GTM action — no guessing.</p>
              </div>
            </div>

            {/* Tool selector */}
            <div className="flex flex-wrap gap-2 mt-8 mb-8">
              {MCP_CONVERSATIONS.map((conv, i) => {
                const Icon = conv.icon;
                const active = activeConv === i;
                return (
                  <button
                    key={conv.key}
                    onClick={() => setActiveConv(i)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                        : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <Icon size={12} />
                    {conv.label}
                  </button>
                );
              })}
            </div>

            <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeConv}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ClaudeConversation conv={MCP_CONVERSATIONS[activeConv]} />
                </motion.div>
              </AnimatePresence>

              {/* Side explainer */}
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Terminal size={13} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300">How it works</span>
                  </div>
                  <ol className="space-y-3 text-xs text-slate-400">
                    {[
                      "You give Claude a GTM instruction in chat",
                      "Claude calls the relevant iqpipe MCP tool",
                      "iqpipe queries your live data and returns structured JSON",
                      "Claude synthesizes the data into a precise decision",
                      "Claude executes the action in n8n or Make.com",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="h-4 w-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500 shrink-0 mt-0.5">{i + 1}</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">MCP tools in this example</p>
                  <div className="space-y-2">
                    {[
                      { tool: "check_lead_status",         desc: "Contact safety gate" },
                      { tool: "get_sequence_recommendation",desc: "Best sequence for ICP" },
                      { tool: "confirm_event_received",     desc: "Delivery confirmation" },
                      { tool: "get_improvement_report",     desc: "Ranked issue synthesis" },
                      { tool: "get_workflow_health",        desc: "GTM Alpha Score" },
                      { tool: "get_stuck_leads",            desc: "Silent lead detection" },
                    ].map((t) => (
                      <div key={t.tool} className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-indigo-400 bg-indigo-500/8 border border-indigo-500/15 px-1.5 py-0.5 rounded">{t.tool}</code>
                        <span className="text-[10px] text-slate-600">{t.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    <span className="text-[11px] font-semibold text-emerald-300">Works in Claude.ai and Claude Desktop</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Add the iqpipe MCP URL to your Claude settings. Connect in under 5 minutes &mdash; no setup scripts, no config files.
                  </p>
                  <Link to="/settings" className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium">
                    Get your API key <ChevronRight size={11} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-slate-900 py-20 px-4 bg-slate-950/60">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="flex justify-center items-center gap-4 mb-8">
                <div className="h-12 w-12 rounded-2xl overflow-hidden ring-1 ring-indigo-500/30">
                  <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
                </div>
                <div className="text-slate-700 text-xl font-thin">+</div>
                <div className="h-12 w-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Bot size={22} className="text-slate-300" />
                </div>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Your Claude is already capable.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
                  Give it the data to prove it.
                </span>
              </h2>
              <p className="text-slate-400 text-base mb-8 max-w-xl mx-auto leading-relaxed">
                Connect iqpipe to Claude in under 5 minutes. Paste the MCP URL into Claude settings and start making data-driven GTM decisions immediately.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link to="/signup" className="inline-flex h-12 items-center justify-center rounded-full bg-white text-slate-950 px-8 text-sm font-bold shadow-xl hover:bg-slate-100 hover:scale-105 transition-all">
                  Connect Claude free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link to="/mcp-protocol" className="inline-flex h-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900/50 px-6 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-all">
                  How Claude connects
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
