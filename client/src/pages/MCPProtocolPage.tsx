/**
 * MCPProtocolPage — /mcp
 *
 * Technical deep-dive hub for the IQPipe Model Context Protocol server.
 * Sections: Hero → How it Works → Quick Start → Connector Registry →
 *           Security → SDK Reference
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Copy, Check, Search, Shield, Code2,
  ArrowRight, BookOpen, Zap,
  Lock, Server, GitBranch, Package,
  Cpu, Network, FileCode, Play, ChevronDown,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { API_BASE_URL } from "../../config";

// ─── Sidebar nav sections ────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "overview",    label: "Overview",           icon: BookOpen  },
  { id: "how-it-works", label: "How it Works",      icon: Network   },
  { id: "quickstart",  label: "Quick Start",         icon: Terminal  },
  { id: "connectors",  label: "Connector Registry",  icon: Package   },
  { id: "security",    label: "Security & Privacy",  icon: Shield    },
  { id: "sdk",         label: "SDK Reference",       icon: Code2     },
];

// ─── Connector registry data ─────────────────────────────────────────────────

const CONNECTORS = [
  { name: "n8n",          domain: "n8n.io",              category: "Automation",  status: "stable",      desc: "Sync workflows, execution events, error logs"         },
  { name: "Make.com",     domain: "make.com",            category: "Automation",  status: "stable",      desc: "Scenario metadata, module health, run history"        },
  { name: "HubSpot",      domain: "hubspot.com",         category: "CRM",         status: "stable",      desc: "Contacts, deals, pipeline stages, activity feed"      },
  { name: "Salesforce",   domain: "salesforce.com",      category: "CRM",         status: "stable",      desc: "Leads, opportunities, accounts, field mappings"       },
  { name: "Pipedrive",    domain: "pipedrive.com",       category: "CRM",         status: "stable",      desc: "Deals, persons, organizations, activities"            },
  { name: "Apollo.io",    domain: "apollo.io",           category: "Outreach",    status: "stable",      desc: "Sequences, contacts, email events, reply detection"   },
  { name: "Instantly",    domain: "instantly.ai",        category: "Outreach",    status: "stable",      desc: "Campaign sends, opens, replies, bounce tracking"      },
  { name: "Lemlist",      domain: "lemlist.com",         category: "Outreach",    status: "stable",      desc: "Sequence steps, email events, LinkedIn actions"       },
  { name: "HeyReach",     domain: "heyreach.io",         category: "LinkedIn",    status: "stable",      desc: "Connection requests, messages, accept events"         },
  { name: "Expandi",      domain: "expandi.io",          category: "LinkedIn",    status: "stable",      desc: "Campaign events, profile visits, connection accepts"  },
  { name: "Clay",         domain: "clay.com",            category: "Enrichment",  status: "stable",      desc: "Enrichment runs, field updates, table webhooks"       },
  { name: "Clearbit",     domain: "clearbit.com",        category: "Enrichment",  status: "stable",      desc: "Person + company enrichment, reveal events"           },
  { name: "Stripe",       domain: "stripe.com",          category: "Billing",     status: "stable",      desc: "Payment events, subscriptions, churn signals"         },
  { name: "Chargebee",    domain: "chargebee.com",       category: "Billing",     status: "stable",      desc: "Subscription lifecycle, MRR events, trials"           },
  { name: "Aircall",      domain: "aircall.io",          category: "Phone",       status: "stable",      desc: "Call logs, duration, outcomes, recordings meta"       },
  { name: "Twilio",       domain: "twilio.com",          category: "SMS",         status: "stable",      desc: "SMS send/receive, delivery status, opt-outs"          },
  { name: "Slack",        domain: "slack.com",           category: "Comms",       status: "beta",        desc: "Channel messages, reaction events, user activity"     },
  { name: "GitHub",       domain: "github.com",          category: "Dev",         status: "beta",        desc: "PR events, commits, issue activity, CI signals"       },
  { name: "Attio",        domain: "attio.com",           category: "CRM",         status: "coming_soon", desc: "Records, notes, tasks, workspace activity"            },
  { name: "Intercom",     domain: "intercom.com",        category: "Support",     status: "coming_soon", desc: "Conversations, user events, product signals"          },
  { name: "Smartlead",    domain: "smartlead.ai",        category: "Outreach",    status: "stable",      desc: "Multi-channel sequences, inbox rotation, reply AI"    },
  { name: "Mailshake",    domain: "mailshake.com",       category: "Outreach",    status: "stable",      desc: "Email sequences, A/B tests, team collaboration"       },
  { name: "Dripify",      domain: "dripify.io",          category: "LinkedIn",    status: "stable",      desc: "LinkedIn drip campaigns, profile views, DM events"    },
  { name: "Waalaxy",      domain: "waalaxy.com",         category: "LinkedIn",    status: "stable",      desc: "Multi-channel prospecting, LinkedIn + email"          },
  { name: "Outreach",     domain: "outreach.io",         category: "Outreach",    status: "stable",      desc: "Sequences, calls, tasks, sentiment signals"           },
  { name: "Salesloft",    domain: "salesloft.com",       category: "Outreach",    status: "stable",      desc: "Cadences, calls, analytics, revenue signals"          },
  { name: "ZoomInfo",     domain: "zoominfo.com",        category: "Enrichment",  status: "stable",      desc: "Contact + company enrichment, intent signals"         },
  { name: "Lusha",        domain: "lusha.com",           category: "Enrichment",  status: "stable",      desc: "Direct dials, verified emails, enrichment events"     },
  { name: "Dialpad",      domain: "dialpad.com",         category: "Phone",       status: "stable",      desc: "AI-powered calls, transcripts, sentiment"             },
  { name: "Kixie",        domain: "kixie.com",           category: "Phone",       status: "stable",      desc: "Power dialer, SMS, CRM-synced call outcomes"          },
  { name: "Orum",         domain: "orum.io",             category: "Phone",       status: "stable",      desc: "AI dialer, live coaching, call analytics"             },
  { name: "Wati",         domain: "wati.io",             category: "SMS",         status: "stable",      desc: "WhatsApp Business API, broadcasts, chatbots"          },
  { name: "Sakari",       domain: "sakari.io",           category: "SMS",         status: "stable",      desc: "Business SMS, drip campaigns, 2-way messaging"        },
  { name: "PhantomBuster", domain: "phantombuster.com",  category: "Enrichment",  status: "stable",      desc: "Lead scraping, LinkedIn extraction, data enrichment"  },
  { name: "Hunter.io",    domain: "hunter.io",           category: "Enrichment",  status: "stable",      desc: "Email finder, verification, domain search events"     },
];

const CATEGORIES = ["All", "Automation", "CRM", "Outreach", "LinkedIn", "Enrichment", "Billing", "Phone", "SMS", "Comms", "Dev", "Support"];

const STATUS_STYLE: Record<string, { label: string; color: string; dot: string }> = {
  stable:      { label: "Stable",      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-400" },
  beta:        { label: "Beta",        color: "text-amber-400 bg-amber-500/10 border-amber-500/30",       dot: "bg-amber-400"   },
  coming_soon: { label: "Coming Soon", color: "text-slate-400 bg-slate-500/10 border-slate-500/30",       dot: "bg-slate-500"   },
};

// ─── Connector logo ──────────────────────────────────────────────────────────

function ConnectorLogo({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
        {name[0]}
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={`${API_BASE_URL}/api/proxy/favicon?domain=${domain}`}
        alt={name}
        width={20}
        height={20}
        className="object-contain"
        onError={() => setErr(true)}
      />
    </div>
  );
}

// ─── Copy-to-clipboard hook ───────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }
  return { copied, copy };
}

// ─── Inline code block ────────────────────────────────────────────────────────

function CodeBlock({ code, language = "bash", copyKey, onCopy, isCopied }:
  { code: string; language?: string; copyKey: string; onCopy: (t: string, k: string) => void; isCopied: boolean }) {
  return (
    <div className="relative group rounded-xl border border-slate-700/60 bg-slate-900/80 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/60 bg-slate-800/60">
        <span className="text-[11px] font-mono text-slate-500">{language}</span>
        <button
          onClick={() => onCopy(code, copyKey)}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {isCopied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-sm font-mono text-slate-300 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

// ─── JSON-RPC syntax highlighter ─────────────────────────────────────────────

function JsonHighlight({ json }: { json: string }) {
  const lines = json.split("\n");
  return (
    <pre className="p-4 text-[13px] font-mono leading-relaxed overflow-x-auto">
      {lines.map((line, i) => {
        const highlighted = line
          .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span class="text-indigo-300">$1</span>:')
          .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="text-emerald-400">$1</span>')
          .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-amber-300">$1</span>')
          .replace(/:\s*(true|false|null)/g, ': <span class="text-fuchsia-400">$1</span>');
        return (
          <div key={i} dangerouslySetInnerHTML={{ __html: highlighted || "&nbsp;" }} />
        );
      })}
    </pre>
  );
}

// ─── Architecture diagram ─────────────────────────────────────────────────────

const DATA_SOURCES = [
  { label: "n8n",        color: "from-orange-500 to-amber-500",    icon: "⚡" },
  { label: "HubSpot",    color: "from-orange-600 to-red-500",      icon: "🟠" },
  { label: "Apollo",     color: "from-indigo-500 to-blue-500",     icon: "🚀" },
  { label: "Stripe",     color: "from-violet-500 to-purple-500",   icon: "💳" },
  { label: "Clay",       color: "from-slate-500 to-slate-400",     icon: "🧱" },
  { label: "LinkedIn",   color: "from-blue-600 to-sky-500",        icon: "💼" },
];

const AI_CLIENTS = [
  { label: "Claude",     color: "from-amber-500 to-orange-500",    icon: "🤖" },
  { label: "Cursor",     color: "from-indigo-500 to-violet-500",   icon: "✦"  },
  { label: "VS Code",    color: "from-blue-500 to-sky-500",        icon: "⬡"  },
  { label: "Custom SDK", color: "from-emerald-500 to-teal-500",    icon: "⚙️"  },
];

function ArchDiagram() {
  const [activeSource, setActiveSource] = useState<number | null>(null);

  return (
    <div className="relative flex items-center justify-between gap-4 py-6 px-2 overflow-x-auto min-w-0">
      {/* Data sources */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1 text-center">Data Sources</div>
        {DATA_SOURCES.map((s, i) => (
          <motion.div
            key={s.label}
            onHoverStart={() => setActiveSource(i)}
            onHoverEnd={() => setActiveSource(null)}
            whileHover={{ scale: 1.04, x: 4 }}
            className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2 cursor-default"
          >
            <span className="text-base">{s.icon}</span>
            <span className="text-xs font-medium text-slate-300 whitespace-nowrap">{s.label}</span>
            <motion.div
              animate={{ opacity: activeSource === i ? 1 : 0.2, scaleX: activeSource === i ? 1 : 0.5 }}
              className={`ml-auto h-0.5 w-6 rounded-full bg-gradient-to-r ${s.color}`}
            />
          </motion.div>
        ))}
      </div>

      {/* Animated connector lines */}
      <div className="flex flex-col items-center gap-1 shrink-0 relative">
        <svg width="80" height="260" className="overflow-visible">
          {DATA_SOURCES.map((_, i) => {
            const y = 26 + i * 44;
            return (
              <motion.line
                key={i}
                x1="0" y1={y} x2="80" y2="130"
                stroke={activeSource === i ? "#6366f1" : "#334155"}
                strokeWidth={activeSource === i ? 2 : 1}
                strokeDasharray="4 3"
                animate={{ strokeDashoffset: [0, -20] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              />
            );
          })}
        </svg>
      </div>

      {/* MCP Server (center) */}
      <motion.div
        animate={{ boxShadow: ["0 0 20px #6366f130", "0 0 40px #6366f150", "0 0 20px #6366f130"] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="shrink-0 flex flex-col items-center justify-center w-36 h-36 rounded-2xl border-2 border-indigo-500/50 bg-indigo-950/60 backdrop-blur shadow-lg shadow-indigo-500/20"
      >
        <div className="text-2xl mb-1">⬡</div>
        <div className="text-xs font-bold text-indigo-300">IQPipe</div>
        <div className="text-[10px] text-indigo-400 font-mono">MCP Server</div>
        <div className="mt-2 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-emerald-400">live</span>
        </div>
      </motion.div>

      {/* Connector lines to AI */}
      <div className="flex flex-col items-center gap-1 shrink-0 relative">
        <svg width="80" height="180" className="overflow-visible">
          {AI_CLIENTS.map((_, i) => {
            const y = 22 + i * 44;
            return (
              <motion.line
                key={i}
                x1="0" y1="90" x2="80" y2={y}
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                animate={{ strokeDashoffset: [0, -20] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: i * 0.1 }}
              />
            );
          })}
        </svg>
      </div>

      {/* AI Clients */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1 text-center">AI Clients</div>
        {AI_CLIENTS.map((c) => (
          <motion.div
            key={c.label}
            whileHover={{ scale: 1.04, x: -4 }}
            className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-2 cursor-default"
          >
            <motion.div
              animate={{ scaleX: [0.5, 1, 0.5] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className={`h-0.5 w-6 rounded-full bg-gradient-to-r ${c.color}`}
            />
            <span className="text-base">{c.icon}</span>
            <span className="text-xs font-medium text-slate-300 whitespace-nowrap">{c.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── SDK Tool entry ───────────────────────────────────────────────────────────

const SDK_TOOLS = [
  {
    name: "get_live_feed",
    desc: "Returns the latest signal events across all connected tools.",
    params: [{ name: "limit", type: "number", optional: true, desc: "Max events (default 50)" }],
    returns: "SignalEvent[]",
  },
  {
    name: "get_funnel",
    desc: "Returns the multi-step pipeline funnel with conversion rates at each stage.",
    params: [{ name: "period", type: '"7d"|"30d"|"90d"|"all"', optional: true, desc: "Lookback window (default 30d)" }],
    returns: "FunnelResponse",
  },
  {
    name: "get_workflow_health",
    desc: "Full pipeline intelligence: latency, frequency, coverage, enrichment, funnel.",
    params: [{ name: "period", type: '"7d"|"30d"|"90d"|"all"', optional: true, desc: "Lookback window (default 30d)" }],
    returns: "WorkflowHealthResponse",
  },
  {
    name: "get_anomalies",
    desc: "Returns detected GTM anomalies — silent pipelines, over-touched leads, stale enrichment.",
    params: [{ name: "severity", type: '"warning"|"error"', optional: true, desc: "Filter by severity level" }],
    returns: "Anomaly[]",
  },
  {
    name: "search_contacts",
    desc: "Full-text search across unified lead identities with funnel stage context.",
    params: [
      { name: "q",     type: "string", optional: false, desc: "Search query (name, email, company)" },
      { name: "limit", type: "number", optional: true,  desc: "Max results (default 20, max 200)"   },
    ],
    returns: "Contact[]",
  },
  {
    name: "list_deals",
    desc: "List deals with optional stage, pipeline, and date filters.",
    params: [
      { name: "stage",    type: "string", optional: true, desc: "Deal stage slug" },
      { name: "pipeline", type: "string", optional: true, desc: "Pipeline name"   },
    ],
    returns: "Deal[]",
  },
  {
    name: "diagnose_issue",
    desc: "AI-assisted root-cause analysis for a workflow or pipeline anomaly.",
    params: [{ name: "context", type: "string", optional: false, desc: "Description of the issue to diagnose" }],
    returns: "DiagnosisReport",
  },
  {
    name: "apply_fix",
    desc: "Apply a suggested remediation action from a DiagnosisReport.",
    params: [
      { name: "fixId",  type: "string", optional: false, desc: "Fix identifier from DiagnosisReport" },
      { name: "dryRun", type: "boolean", optional: true, desc: "Preview changes without applying"    },
    ],
    returns: "FixResult",
  },
];


// ─── Main page ────────────────────────────────────────────────────────────────

export default function MCPProtocolPage() {
  const [connectorSearch, setConnectorSearch] = useState("");
  const [activeCategory,  setActiveCategory]  = useState("All");
  const [activeSection,   setActiveSection]   = useState("overview");
  const [expandedTool,    setExpandedTool]    = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // ── Scroll to top on mount ───────────────────────────────────────────────────
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // ── Scroll-spy ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  function sectionRef(id: string) {
    return (el: HTMLElement | null) => { sectionRefs.current[id] = el; };
  }

  // ── Filtered connectors ──────────────────────────────────────────────────────
  const filteredConnectors = CONNECTORS.filter(c => {
    const matchCat  = activeCategory === "All" || c.category === activeCategory;
    const matchQ    = c.name.toLowerCase().includes(connectorSearch.toLowerCase()) ||
                      c.desc.toLowerCase().includes(connectorSearch.toLowerCase());
    return matchCat && matchQ;
  });

  // ── Quick-start code samples (all accurate — sourced from mcpServer.ts) ───────

  // Claude Desktop + any MCP host that supports Streamable HTTP
  const CLAUDE_DESKTOP_JSON = `{
  "mcpServers": {
    "iqpipe": {
      "url": "https://api.iqpipe.io/mcp",
      "headers": {
        "Authorization": "Bearer rvn_pk_your_key_here"
      }
    }
  }
}`;

  // Cursor — .cursor/mcp.json uses same format
  const CURSOR_JSON = `{
  "mcpServers": {
    "iqpipe": {
      "url": "https://api.iqpipe.io/mcp",
      "headers": {
        "Authorization": "Bearer rvn_pk_your_key_here"
      }
    }
  }
}`;

  // Raw HTTP — works with any HTTP client, script, or test
  const CURL_EXAMPLE = `curl -X POST https://api.iqpipe.io/mcp \\
  -H "Authorization: Bearer rvn_pk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_workflow_health",
      "arguments": { "period": "30d" }
    }
  }'`;

  const JSON_RPC_EXAMPLE = `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_workflow_health",
    "arguments": {
      "period": "30d"
    }
  }
}`;

  const JSON_RPC_RESPONSE = `{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "healthScore": 81,
    "period": "30d",
    "funnel": {
      "biggestDrop": "Contacted",
      "steps": [
        { "label": "Imported",  "count": 1204, "pct": 100 },
        { "label": "Contacted", "count": 430,  "pct": 36  },
        { "label": "Replied",   "count": 38,   "pct": 9   },
        { "label": "Won",       "count": 11,   "pct": 29  }
      ]
    },
    "coverage": {
      "totalImported": 1204,
      "gaps": 774,
      "gapPct": 64
    }
  }
}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#070c18] border-b border-slate-800/60 py-24">
        {/* Background glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-fuchsia-600/10 blur-[100px]" />
        </div>
        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(#6366f1 1px,transparent 1px),linear-gradient(90deg,#6366f1 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-xs font-medium text-indigo-300 tracking-wide uppercase">Model Context Protocol</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6"
          >
            The Protocol that{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
              Connects Everything
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            MCP is an open standard for AI-to-data interoperability. IQPipe's MCP server gives
            any compatible AI model — Claude, Cursor, custom agents — live, authenticated access
            to your entire GTM intelligence layer over a single, standardized protocol.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <a href="#quickstart" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-500/20">
              <Terminal className="w-4 h-4" />
              Quick Start
            </a>
            <a href="#sdk" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 hover:border-slate-400 bg-slate-800/60 hover:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors">
              <Code2 className="w-4 h-4" />
              SDK Reference
            </a>
            <a href="#connectors" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 hover:border-slate-400 bg-slate-800/60 hover:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors">
              <Package className="w-4 h-4" />
              {CONNECTORS.length} Connectors
            </a>
          </motion.div>

          {/* Stat row */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-8 text-sm"
          >
            {[
              { n: "35+",    label: "Tool connectors"     },
              { n: "8",      label: "MCP tools exposed"  },
              { n: "<50ms",  label: "Median response"    },
              { n: "100%",   label: "Local-first option" },
            ].map(({ n, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-white">{n}</div>
                <div className="text-slate-500 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Body: sidebar + content ───────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-16 flex gap-10 items-start">

        {/* ── Sticky Sidebar ──────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-52 shrink-0 sticky top-20">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">On this page</span>
            </div>
            <nav className="p-2 space-y-0.5">
              {NAV_SECTIONS.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    activeSection === id
                      ? "bg-indigo-500/15 text-indigo-300 font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {label}
                </a>
              ))}
            </nav>
          </div>

          {/* API key CTA */}
          <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-950/40 p-4">
            <p className="text-xs text-indigo-300 font-medium mb-2">Get your API key</p>
            <p className="text-[11px] text-slate-500 mb-2 leading-snug">Create a scoped MCP key in Settings → API Keys.</p>
            <p className="text-[10px] text-amber-400/70 mb-3 leading-snug">Available on Growth and Agency plans.</p>
            <Link to="/pricing" className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
              View Growth & Agency plans <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-20">

          {/* ── Overview ──────────────────────────────────────────────────────── */}
          <section id="overview" ref={sectionRef("overview")}>
            <SectionHeading icon={BookOpen} title="Overview" />
            <p className="text-slate-400 leading-relaxed mb-6">
              The Model Context Protocol (MCP) is an open standard originally developed by Anthropic
              that defines how AI models communicate with external data sources and tools. Instead
              of building bespoke integrations for every AI client, MCP provides a single,
              versioned protocol — similar to what LSP did for language servers in editors.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8">
              IQPipe's MCP server exposes your entire GTM data layer — live pipeline health,
              workflow events, lead activity, deal states, anomaly alerts — as a set of typed,
              authenticated tools that any MCP-compatible AI can call at runtime. Your AI always
              has fresh, authoritative context. No hallucinated pipeline data.
            </p>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: Zap,      title: "Live data",    desc: "Every tool call hits your real data. No stale snapshots or pre-indexed embeddings." },
                { icon: Lock,     title: "Scoped keys",  desc: "Each API key grants access to specific tools only. Share agents without sharing everything." },
                { icon: Server,   title: "Self-hostable", desc: "Run the MCP server inside your VPC for complete data sovereignty. No traffic leaves your infra." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <Icon className="w-5 h-5 text-indigo-400 mb-3" />
                  <div className="text-sm font-semibold text-white mb-1.5">{title}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── How it Works ──────────────────────────────────────────────────── */}
          <section id="how-it-works" ref={sectionRef("how-it-works")}>
            <SectionHeading icon={Network} title="How it Works" />
            <p className="text-slate-400 leading-relaxed mb-8">
              MCP uses JSON-RPC 2.0 over stdio (local) or HTTP+SSE (remote). The AI client
              issues a <code className="text-indigo-300 font-mono text-sm">tools/call</code> request
              with tool name and arguments. The IQPipe server resolves the workspace from the
              API key, executes the query against the materialized data layer, and streams the
              response back — typically in under 50ms.
            </p>

            {/* Architecture diagram */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 mb-8 overflow-x-auto">
              <ArchDiagram />
            </div>

            {/* Step-by-step */}
            <div className="space-y-4">
              {[
                { n: "01", title: "AI client sends tools/call",       desc: "The AI model (Claude, Cursor, custom agent) issues a JSON-RPC request to the MCP server with the tool name and any parameters." },
                { n: "02", title: "Server resolves workspace + scope", desc: "IQPipe validates the API key, checks that the requested tool is within the key's permission scope, and identifies the workspace." },
                { n: "03", title: "Query hits materialized data",      desc: "The server reads from pre-computed tables (LeadActivitySummary, N8nWorkflowMeta, etc.) — O(1) indexed queries, never full scans." },
                { n: "04", title: "Typed response streams back",       desc: "A validated, typed JSON object is returned to the AI client, which can then reason over it, surface insights, or take further actions." },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <span className="font-mono text-2xl font-bold text-slate-700 shrink-0 w-10">{n}</span>
                  <div>
                    <div className="text-sm font-semibold text-white mb-1">{title}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* JSON-RPC example */}
            <div className="mt-8 grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-700/60 bg-slate-800/60 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">Request</span>
                  <button onClick={() => copy(JSON_RPC_EXAMPLE, "rpc-req")} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
                    {copied === "rpc-req" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied === "rpc-req" ? "Copied" : "Copy"}
                  </button>
                </div>
                <JsonHighlight json={JSON_RPC_EXAMPLE} />
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-700/60 bg-slate-800/60">
                  <span className="text-[11px] font-mono text-slate-500">Response</span>
                </div>
                <JsonHighlight json={JSON_RPC_RESPONSE} />
              </div>
            </div>
          </section>

          {/* ── Quick Start ───────────────────────────────────────────────────── */}
          <section id="quickstart" ref={sectionRef("quickstart")}>
            <SectionHeading icon={Terminal} title="Quick Start" />
            <p className="text-slate-400 leading-relaxed mb-8">
              Four connection paths. All require a{" "}
              <code className="text-indigo-300 font-mono text-sm">rvn_pk_</code> public API key
              from Settings → API Keys —{" "}
              <span className="text-amber-400/80">available on Growth and Agency plans.</span>
            </p>

            <div className="space-y-6">

              {/* ── FEATURED: Claude.ai Account Connector ─────────────────── */}
              <div className="relative rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-950/60 to-slate-900/80 p-6 overflow-hidden">
                {/* Glow */}
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl" />

                {/* Badge */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 px-3 py-1 text-xs font-semibold text-indigo-300">
                    ⭐ Easiest — No config files
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" /> Live
                  </span>
                </div>

                <div className="flex items-start gap-4 mb-5">
                  {/* Claude.ai logo */}
                  <div className="w-12 h-12 rounded-xl bg-[#D97706]/10 border border-[#D97706]/30 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={`${API_BASE_URL}/api/proxy/favicon?domain=claude.ai`}
                      alt="Claude"
                      width={28}
                      height={28}
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white mb-1">Connect via Claude.ai</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Claude.ai's native <strong className="text-slate-300">Account Connectors</strong> let
                      you add IQPipe as a remote MCP server directly inside the Claude interface — no
                      terminal, no JSON files, no local process to manage. Your entire GTM data layer
                      becomes available to Claude in under 60 seconds.
                    </p>
                  </div>
                </div>

                {/* Step list */}
                <ol className="space-y-2.5 mb-5">
                  {[
                    { n: "1", text: <>Open <strong className="text-slate-300">Claude.ai</strong> → Settings → <strong className="text-slate-300">Integrations</strong></> },
                    { n: "2", text: <>Click <strong className="text-slate-300">Add integration</strong> and paste the IQPipe MCP URL:</> },
                    { n: "3", text: <>Enter your <code className="font-mono text-indigo-300 text-xs">rvn_pk_</code> API key when prompted</> },
                    { n: "4", text: <>Hit <strong className="text-slate-300">Connect</strong> — all IQPipe tools appear in Claude instantly</> },
                  ].map(({ n, text }) => (
                    <li key={n} className="flex items-start gap-3 text-sm text-slate-400">
                      <span className="flex-none w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[11px] font-bold text-indigo-300 mt-0.5">{n}</span>
                      <span className="leading-snug">{text}</span>
                    </li>
                  ))}
                </ol>

                {/* MCP URL copy block */}
                <div className="rounded-lg border border-indigo-500/20 bg-slate-900/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-indigo-500/10 bg-indigo-950/30">
                    <span className="text-[11px] font-mono text-slate-500">IQPipe MCP Server URL</span>
                    <button
                      onClick={() => copy("https://api.iqpipe.io/mcp", "mcp-url")}
                      className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {copied === "mcp-url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === "mcp-url" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="px-4 py-3 font-mono text-sm text-indigo-300">
                    https://api.iqpipe.io/mcp
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-slate-600">
                  Requires a Claude Pro, Team, or Enterprise plan. Uses OAuth 2.0 — your key is never stored in Claude's systems.
                </p>
              </div>

              {/* ── Option B: Claude Desktop ──────────────────────────────── */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=claude.ai`} alt="Claude" width={14} height={14} className="object-contain" />
                  </div>
                  Option B — Claude Desktop
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Add to{" "}
                  <code className="font-mono text-slate-400">claude_desktop_config.json</code>.
                  Uses the remote Streamable HTTP transport — no local process required.
                </p>
                <CodeBlock code={CLAUDE_DESKTOP_JSON} language="json" copyKey="claude-desktop-json" onCopy={copy} isCopied={copied === "claude-desktop-json"} />
              </div>

              {/* ── Option C: Cursor ──────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=cursor.com`} alt="Cursor" width={14} height={14} className="object-contain" />
                  </div>
                  Option C — Cursor
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Add to <code className="font-mono text-slate-400">.cursor/mcp.json</code> in your project root (or global Cursor settings):
                </p>
                <CodeBlock code={CURSOR_JSON} language="json" copyKey="cursor-json" onCopy={copy} isCopied={copied === "cursor-json"} />
              </div>

              {/* ── Option D: Raw HTTP / curl ─────────────────────────────── */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  Option D — Direct HTTP (curl / any client)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Any HTTP client can call the MCP server directly. Useful for testing, scripts, or building your own MCP host.
                </p>
                <CodeBlock code={CURL_EXAMPLE} language="bash" copyKey="curl-example" onCopy={copy} isCopied={copied === "curl-example"} />
              </div>

            </div>
          </section>

          {/* ── Connector Registry ────────────────────────────────────────────── */}
          <section id="connectors" ref={sectionRef("connectors")}>
            <SectionHeading icon={Package} title="Connector Registry" />
            <p className="text-slate-400 leading-relaxed mb-6">
              IQPipe normalizes events from all connectors into the same canonical schema before
              they reach the MCP layer. Every AI query sees consistent field names regardless of
              which tool the data originated from.
            </p>

            {/* Search + category filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={connectorSearch}
                  onChange={e => setConnectorSearch(e.target.value)}
                  placeholder="Search connectors…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700/60 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.slice(0, 7).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeCategory === cat
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Connector grid */}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {filteredConnectors.map(c => {
                  const s = STATUS_STYLE[c.status];
                  return (
                    <motion.div
                      key={c.name}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-colors"
                    >
                      <ConnectorLogo domain={c.domain} name={c.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-white">{c.name}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.color}`}>
                            <span className={`h-1 w-1 rounded-full ${s.dot}`} />
                            {s.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 leading-snug">{c.desc}</div>
                        <div className="mt-1.5">
                          <span className="text-[10px] text-indigo-400 font-mono">{c.category}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {filteredConnectors.length === 0 && (
              <div className="text-center py-12 text-slate-600">No connectors match your search.</div>
            )}
          </section>

          {/* ── Security ──────────────────────────────────────────────────────── */}
          <section id="security" ref={sectionRef("security")}>
            <SectionHeading icon={Shield} title="Security & Privacy" />
            <p className="text-slate-400 leading-relaxed mb-8">
              MCP access is designed around the principle of least privilege. No AI model ever
              receives credentials or raw PII — only the normalized, scoped output of authenticated
              tool calls.
            </p>

            <div className="grid sm:grid-cols-2 gap-5 mb-8">
              {[
                {
                  icon: Lock,
                  title: "Scoped API keys",
                  desc: "Each key is bound to an explicit tool allowlist. A key that grants get_funnel cannot call list_deals unless explicitly permitted. Keys can be revoked instantly.",
                },
                {
                  icon: Cpu,
                  title: "PII never in context",
                  desc: "Emails, phones, and LinkedIn URLs are stored as HMAC hashes + AES-256 encrypted blobs. Tool responses return only displayName, company, and funnel metadata — never raw PII.",
                },
                {
                  icon: Server,
                  title: "Self-hosted option",
                  desc: "Run the MCP server inside your own infrastructure. Use stdio transport so no data traverses the public internet. Your AI + your data never leave your VPC.",
                },
                {
                  icon: GitBranch,
                  title: "Audit log",
                  desc: "Every tool call is logged with timestamp, tool name, key ID, and workspace. Exportable as CSV from Settings → API Keys → Activity.",
                },
                {
                  icon: Shield,
                  title: "Rate limiting",
                  desc: "Per-key rate limits (configurable per plan) prevent runaway agents from hammering your data layer. Limits are applied at the server, not per-tool.",
                },
                {
                  icon: FileCode,
                  title: "GDPR compliance",
                  desc: "The MCP layer inherits IQPipe's Right to Erasure and DSAR support. Erasing a lead via the API removes them from all tool responses immediately.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white mb-1.5">{title}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── SDK Reference ─────────────────────────────────────────────────── */}
          <section id="sdk" ref={sectionRef("sdk")}>
            <SectionHeading icon={Code2} title="SDK Reference" />
            <p className="text-slate-400 leading-relaxed mb-6">
              All tools follow the same call signature:{" "}
              <code className="text-indigo-300 font-mono text-sm">client.{"<tool_name>"}(params?)</code>.
              Every response is typed and validated server-side before delivery.
            </p>

            <div className="space-y-2">
              {SDK_TOOLS.map(tool => (
                <div key={tool.name} className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <button
                    onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <code className="text-sm font-mono font-semibold text-indigo-300 shrink-0">{tool.name}</code>
                      <span className="text-xs text-slate-500 truncate hidden sm:block">{tool.desc}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <code className="hidden sm:inline text-[11px] font-mono text-amber-400/70">→ {tool.returns}</code>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expandedTool === tool.name ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedTool === tool.name && (
                      <motion.div
                        initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-slate-800"
                      >
                        <div className="px-5 py-4 space-y-4">
                          <p className="text-sm text-slate-400">{tool.desc}</p>
                          {tool.params.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Parameters</div>
                              <div className="space-y-2">
                                {tool.params.map(p => (
                                  <div key={p.name} className="flex items-start gap-3 text-sm">
                                    <code className="font-mono text-indigo-300 shrink-0">{p.name}</code>
                                    <code className="font-mono text-amber-400/70 shrink-0">{p.type}</code>
                                    <span className="text-[11px] text-slate-500">{p.optional ? "(optional) " : "(required) "}{p.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Returns </span>
                            <code className="font-mono text-sm text-amber-400">{tool.returns}</code>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </section>

          {/* ── Final CTA ─────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 to-slate-900/60 p-10 text-center">
            <div className="text-3xl font-bold text-white mb-3">Ready to connect your AI?</div>
            <p className="text-slate-400 mb-2 max-w-md mx-auto text-sm leading-relaxed">
              MCP access is included on Growth and Agency plans. Upgrade to get your API key and wire IQPipe into Claude or Cursor in minutes.
            </p>
            <p className="text-amber-400/70 text-xs mb-8">Requires Growth or Agency plan</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-500/20">
                View plans <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#quickstart" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 px-6 py-3 text-sm font-medium text-slate-300 transition-colors">
                <Play className="w-4 h-4" />
                Quick Start
              </a>
            </div>
          </div>

        </div>{/* end main content */}
      </div>{/* end body grid */}

      <Footer />
    </div>
  );
}

// ─── Shared section heading ───────────────────────────────────────────────────

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-indigo-400" />
      </div>
      <h2 className="text-xl font-bold text-white">{title}</h2>
    </div>
  );
}
