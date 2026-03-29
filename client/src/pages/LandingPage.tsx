import { useEffect, useState } from "react";import { motion, AnimatePresence } from "framer-motion";
import { 
  CreditCard,
  Database,
  Search,
  Mail,
  Briefcase,
  Fingerprint,
  ArrowRight,
  CheckCircle2,
  Zap,
  TrendingUp,

} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

// --- PRECISE GEOMETRY CONFIGURATION ---
const CARD_HEIGHT = 64;
const GAP = 20;
const MASTER_WIDTH = 200;
const STACK_WIDTH = 240;
const CONNECTOR_SPAN = 120;
const TOTAL_ITEMS = 5;
const TOTAL_HEIGHT = (CARD_HEIGHT * TOTAL_ITEMS) + (GAP * (TOTAL_ITEMS - 1));
const MASTER_HEIGHT = 200;
const MASTER_Y_CENTER = TOTAL_HEIGHT / 2;

// --- SUB-COMPONENTS (Visualizations) ---

const LiveIdTicker = () => {
  const [id, setId] = useState("9F3A");
  
  useEffect(() => {
    const interval = setInterval(() => {
      setId(Math.random().toString(36).substring(2, 6).toUpperCase());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-3 flex items-center gap-2 rounded bg-slate-900/80 px-3 py-1.5 text-[10px] font-mono text-emerald-400 border border-slate-800/60 shadow-inner">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="ml-1"
        >
          Minting RVN-{id}...
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

const StackNode = ({ icon: Icon, label, sub, color, top, delay }: any) => (
  <motion.div 
    initial={{ opacity: 0, x: 30 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.6, type: "spring" }}
    style={{ top: top, height: CARD_HEIGHT, width: STACK_WIDTH }}
    className="absolute right-0 z-20 flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3 shadow-xl backdrop-blur-md hover:border-slate-600 hover:bg-slate-900 transition-all group"
  >
    <div className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-slate-950 border-2 border-slate-700 group-hover:border-slate-500 transition-colors" />
    <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/50 ${color} shadow-sm group-hover:scale-105 transition-transform`}>
      <Icon size={18} className="text-current" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="truncate text-sm font-semibold text-slate-200 group-hover:text-white">{label}</div>
      <div className="truncate text-[11px] text-slate-400">{sub}</div>
    </div>
  </motion.div>
);

const MasterNode = () => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.5 }}
    style={{ 
      top: MASTER_Y_CENTER - (MASTER_HEIGHT / 2), 
      width: MASTER_WIDTH,
      height: MASTER_HEIGHT 
    }}
    className="absolute left-0 z-30 flex flex-col items-center justify-center rounded-2xl border border-indigo-500/40 bg-slate-950 p-4 shadow-[0_0_50px_-10px_rgba(99,102,241,0.25)]"
  >
    <div className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-indigo-500 ring-4 ring-slate-950 z-30" />
    <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-2xl -z-10" />
    <div className="mb-2 flex items-center justify-center w-full">
      <img src="/logo.png" alt="iqpipe" className="h-20 w-20 object-contain drop-shadow-lg" />
    </div>
    <div className="text-base font-bold text-white tracking-tight">iqpipe</div>
    <LiveIdTicker />
  </motion.div>
);

const BiDirectionalBeam = ({ startY, endY, delay, colorStr }: { startY: number, endY: number, delay: number, colorStr: string }) => {
  const startX = MASTER_WIDTH; 
  const endX = MASTER_WIDTH + CONNECTOR_SPAN;
  const cp1X = startX + (CONNECTOR_SPAN * 0.55);
  const cp2X = endX - (CONNECTOR_SPAN * 0.55);
  const pathD = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;

  return (
    <>
      <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="1.5" className="opacity-40" />
      <motion.path 
        d={pathD} 
        fill="none" 
        stroke="url(#outbound-grad)" 
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="10 100" 
        initial={{ strokeDashoffset: 200 }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 2, ease: "linear", repeat: Infinity, delay: delay }}
      />
      <motion.path 
        d={pathD} 
        fill="none" 
        stroke={colorStr} 
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 150" 
        initial={{ strokeDashoffset: -154 }} 
        animate={{ strokeDashoffset: 0 }} 
        transition={{ duration: 3, ease: "linear", repeat: Infinity, delay: delay + 1 }}
        style={{ filter: "drop-shadow(0px 0px 2px currentColor)" }}
      />
    </>
  );
};

const HeroVisualization = () => {
  const steps = [
    { icon: Search, label: "Clay / Apollo", sub: "1. Prospecting", color: "text-sky-400", stroke: "#38bdf8" },
    { icon: Database, label: "Clearbit / ZoomInfo", sub: "2. Enrichment", color: "text-indigo-400", stroke: "#818cf8" },
    { icon: Mail, label: "HeyReach / Lemlist", sub: "3. Outbound", color: "text-fuchsia-400", stroke: "#e879f9" },
    { icon: Briefcase, label: "HubSpot CRM", sub: "4. Deal Mgmt", color: "text-orange-400", stroke: "#fb923c" },
    { icon: CreditCard, label: "Stripe", sub: "5. Revenue", color: "text-emerald-400", stroke: "#34d399" },
  ];

  return (
    <div className="relative mx-auto select-none" style={{ width: MASTER_WIDTH + CONNECTOR_SPAN + STACK_WIDTH, height: TOTAL_HEIGHT }}>
      <svg className="absolute inset-0 h-full w-full pointer-events-none overflow-visible z-10">
        <defs>
          <linearGradient id="outbound-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {steps.map((step, index) => {
          const targetY = (index * (CARD_HEIGHT + GAP)) + (CARD_HEIGHT / 2);
          return (
            <BiDirectionalBeam 
              key={index} 
              startY={MASTER_Y_CENTER} 
              endY={targetY} 
              delay={index * 0.15} 
              colorStr={step.stroke}
            />
          );
        })}
      </svg>
      <MasterNode />
      {steps.map((step, index) => {
        const topPosition = index * (CARD_HEIGHT + GAP);
        return (
          <StackNode key={index} {...step} top={topPosition} delay={0.3 + (index * 0.1)} />
        );
      })}
    </div>
  );
};


// --- STOCK TICKER ---
const StockTicker = () => {
  const tickerItems = [
    { tool: "HeyReach", text: "Positive reply received", id: "9F3A2C", color: "text-fuchsia-400" },
    { tool: "Clay", text: "42 rows imported", id: "AB912F", color: "text-sky-400" },
    { tool: "System", text: "ID synced to Lemlist", id: "7B91DE", color: "text-slate-400" },
    { tool: "Apollo", text: "List imported (87 leads)", id: "3C71BF", color: "text-orange-400" },
    { tool: "Stripe", text: "Subscription Created ($49/mo)", id: "5C28AF", color: "text-emerald-400" },
    { tool: "HubSpot", text: "Deal Stage: Negotiation", id: "D192KA", color: "text-orange-500" },
    { tool: "Smartlead", text: "Email Opened (3x)", id: "991LKA", color: "text-blue-400" },
    { tool: "Paddle", text: "Invoice Paid ($299)", id: "M10293", color: "text-emerald-400" },
  ];

  return (
    <div className="w-full overflow-hidden bg-slate-950 border-b border-slate-900/50 py-3">
      <motion.div 
        className="flex gap-4 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ repeat: Infinity, ease: "linear", duration: 40 }}
        style={{ width: "max-content" }}
      >
        {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
          <div key={i} className="inline-flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900/80 px-4 py-1.5 text-xs shadow-sm">
            <span className={`font-bold ${item.color}`}>{item.tool}</span>
            <span className="text-slate-300 font-medium">{item.text}</span>
            <span className="font-mono text-slate-600 pl-2 border-l border-slate-800">RVN-{item.id}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200 font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1">
        
        {/* --- HERO SECTION --- */}
        <section className="relative border-b border-slate-900/50 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 blur-[100px] rounded-full opacity-50 pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-24 md:pt-24 md:pb-32 grid lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-2 z-10">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 mb-6 text-xs font-medium text-indigo-300 backdrop-blur-sm hover:bg-indigo-500/20 transition-colors cursor-default"
              >
                <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Public Beta 2.0
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 text-white"
              >
                One schema to <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
                  unify your GTM.
                </span>
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-slate-400 mb-8 leading-relaxed"
              >
                iqpipe acts as the central nervous system for your stack. We mint a <span className="text-slate-200 font-semibold">Universal ID</span> for every prospect and track their journey across every tool you use.
              </motion.p>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-4"
              >
                <a href="/signup" className="inline-flex h-12 items-center justify-center rounded-xl bg-white text-slate-950 px-6 text-sm font-bold shadow-xl shadow-indigo-500/20 hover:bg-slate-100 hover:scale-105 transition-all">
                  Get started free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
                <a href="/demo" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 px-6 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all backdrop-blur-sm">
                  Live demo
                </a>
              </motion.div>
              <div className="mt-10 flex items-center gap-4 text-sm text-slate-500">
                <p className="uppercase tracking-wider text-[10px] font-semibold">Works with</p>
                <div className="flex gap-3 opacity-60 grayscale transition-all hover:grayscale-0">
                   <span className="font-bold text-slate-300">Clay</span>
                   <span className="font-bold text-slate-300">HubSpot</span>
                   <span className="font-bold text-slate-300">Stripe</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-3 relative flex justify-center lg:justify-end mt-8 lg:mt-0 pointer-events-none select-none overflow-hidden">
               <div className="scale-[0.6] xs:scale-[0.7] sm:scale-90 md:scale-100 origin-top lg:origin-right">
                  <HeroVisualization />
               </div>
            </div>
          </div>
        </section>

        {/* --- LIVE STOCK TICKER --- */}
        <StockTicker />

        {/* ── VP 1: Broken tool, lost revenue ────────────────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-slate-800 to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:48px_48px]" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            {/* Text */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                ● The $14,000 blind spot
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                A tool went silent.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">
                  You didn't notice for 3 days.
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Stripe's webhook misconfigured. Instantly stopped sending on day two of the campaign. Clay imported 800 leads into a broken sequence. No alert. No log. No idea.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                iqpipe watches every tool, every minute. The moment a tool goes quiet — you know. Before the deal does.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Real-time silence detection per tool",
                  "Alarm when event rate drops below baseline",
                  "Know within minutes, not days",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={17} className="text-rose-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Stop flying blind <ArrowRight size={15} />
              </a>
            </motion.div>

            {/* Visual: Pipeline health alarm panel */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-rose-500/8 blur-[60px] rounded-full pointer-events-none" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-300">Pipeline Health</span>
                  </div>
                  <span className="text-[10px] text-slate-600">auto-refresh 30s</span>
                </div>

                {/* Summary row */}
                <div className="grid grid-cols-4 gap-px bg-slate-800/50 border-b border-slate-800">
                  {[
                    { label: "Connected", val: "6", color: "text-white" },
                    { label: "Healthy", val: "3", color: "text-emerald-400" },
                    { label: "Warning", val: "2", color: "text-amber-400" },
                    { label: "Silent", val: "1", color: "text-rose-400" },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-950 px-4 py-3 text-center">
                      <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
                      <div className="text-[9px] text-slate-600 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Tool rows */}
                <div className="divide-y divide-slate-800/50">
                  {[
                    { name: "Clay",      last: "12s ago",  e24: 412,  status: "Healthy", dot: "bg-emerald-400"                   },
                    { name: "HeyReach", last: "1m ago",   e24: 93,   status: "Healthy", dot: "bg-emerald-400"                   },
                    { name: "Instantly", last: "6m ago",   e24: 61,   status: "Warning", dot: "bg-amber-400 animate-pulse"       },
                    { name: "HubSpot",   last: "2m ago",   e24: 34,   status: "Healthy", dot: "bg-emerald-400"                   },
                    { name: "Stripe",    last: "3 days ago", e24: 0,  status: "SILENT",  dot: "bg-rose-500 animate-pulse"        },
                  ].map((tool) => (
                    <div key={tool.name} className={`flex items-center gap-3 px-5 py-3 ${tool.status === "SILENT" ? "bg-rose-500/5" : ""}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tool.dot}`} />
                      <span className="text-xs font-medium text-slate-200 w-24 shrink-0">{tool.name}</span>
                      <span className={`text-xs font-semibold flex-1 ${tool.status === "SILENT" ? "text-rose-400" : tool.status === "Warning" ? "text-amber-400" : "text-emerald-400"}`}>
                        {tool.status}
                      </span>
                      <span className="text-xs font-bold text-slate-300 tabular-nums w-12 text-right">{tool.e24 > 0 ? tool.e24 : "—"}</span>
                      <span className="text-[10px] text-slate-600 w-24 text-right">{tool.last}</span>
                    </div>
                  ))}
                </div>

                {/* Alarm */}
                <div className="m-4 flex gap-3 p-4 rounded-xl border border-rose-500/40 bg-rose-500/8">
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                    <Zap size={14} className="text-rose-400" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-rose-300 mb-0.5">Stripe is silent — 3 days, 0 events</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Expected: payment_succeeded, subscription_created. Last good event: 72h ago. Check webhook endpoint configuration.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── VP 2: Cross-tool contact lookup ────────────────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute right-0 top-1/4 w-[500px] h-[500px] bg-indigo-500/6 blur-[120px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            {/* Visual: Contact Inspector */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative order-2 md:order-1"
            >
              <div className="absolute -inset-4 bg-indigo-500/8 blur-[60px] rounded-full pointer-events-none" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                  <Search size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-300">Contact Inspector</span>
                </div>

                {/* Search box */}
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-xs">
                    <Search size={12} className="text-indigo-400 shrink-0" />
                    <span className="text-slate-300 flex-1">a****@example.com</span>
                    <span className="text-[10px] text-indigo-400 font-medium">↵ Enter</span>
                  </div>
                </div>

                {/* Contact card */}
                <div className="mx-5 mb-3 flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold shrink-0">AF</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white">A**** F**** · VP Growth · Acme Corp</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">8 events · 5 tools · 14 days to close · $18,400 ARR</div>
                  </div>
                  <div className="text-xs font-bold text-emerald-400 shrink-0">Closed ✓</div>
                </div>

                {/* Overlap warning */}
                <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-300">
                  <TrendingUp size={12} className="shrink-0" />
                  Overlap detected: Instantly + HeyReach both active on this contact simultaneously.
                </div>

                {/* Timeline */}
                <div className="mx-5 mb-5 rounded-xl border border-slate-800 overflow-hidden">
                  {[
                    { src: "Clay",      ev: "lead_imported",      ts: "Day 1 · 09:14", color: "text-violet-400"  },
                    { src: "PDL",       ev: "record_enriched",    ts: "Day 1 · 09:15", color: "text-fuchsia-400" },
                    { src: "HeyReach",  ev: "connection_sent",    ts: "Day 3 · 09:01", color: "text-blue-400"    },
                    { src: "Instantly", ev: "email_opened",       ts: "Day 4 · 11:42", color: "text-sky-400"     },
                    { src: "HeyReach",  ev: "reply_received",     ts: "Day 5 · 14:33", color: "text-blue-400"    },
                    { src: "HubSpot",   ev: "deal_created",       ts: "Day 6 · 10:02", color: "text-emerald-400" },
                    { src: "Stripe",    ev: "payment_succeeded",  ts: "Day 14 · 11:30", color: "text-amber-400"  },
                  ].map((ev, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 last:border-0 hover:bg-slate-900/30 transition-colors">
                      <span className={`text-[10px] font-semibold w-20 shrink-0 ${ev.color}`}>{ev.src}</span>
                      <code className="text-[10px] font-mono text-slate-400 flex-1">{ev.ev}</code>
                      <span className="text-[9px] text-slate-600 shrink-0 tabular-nums">{ev.ts}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Text */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="order-1 md:order-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                ● The 20-minute rabbit hole
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                "What happened<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
                  to this prospect?"
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Your rep asks. You open Clay. Then HubSpot. Then Instantly. Then HeyReach. 20 minutes later you have a partial answer and three browser tabs screaming at you.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                With iqpipe: type the email, see the entire cross-tool journey in 3 seconds. Every event. Every tool. In order. With timestamps.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-10">
                {[
                  { label: "Without iqpipe", val: "20 min", sub: "per manual lookup", bad: true },
                  { label: "With iqpipe",    val: "3 sec",  sub: "one search, full picture", bad: false },
                ].map((c) => (
                  <div key={c.label} className={`p-4 rounded-xl border ${c.bad ? "border-slate-800 bg-slate-900/30" : "border-indigo-500/20 bg-indigo-500/8"}`}>
                    <div className={`text-2xl font-bold mb-1 ${c.bad ? "text-slate-500" : "text-indigo-300"}`}>{c.val}</div>
                    <div className="text-[10px] text-slate-500">{c.label}</div>
                    <div className={`text-[11px] mt-1 ${c.bad ? "text-slate-600" : "text-indigo-400"}`}>{c.sub}</div>
                  </div>
                ))}
              </div>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Search your first contact free <ArrowRight size={15} />
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── VP 3: The winning stack is hidden in your data ─────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute left-0 top-1/3 w-[400px] h-[400px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            {/* Text */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                ● The winner hiding in plain sight
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                One stack closes 3×<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                  more than the others.
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                You're running Clay + HeyReach + Instantly. And also Apollo + email-only. And inbound. Which motion actually generates revenue? You don't know — you're tracking them all in the same CRM.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                iqpipe tracks every lead through every stack, then shows you which combination closes fastest, at the highest rate, with the shortest sales cycle. Double down on what works. Cut what doesn't.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Full pipeline funnel per workflow stack",
                  "Reply rate, meeting rate, and close rate per motion",
                  "See where leads are dropping out at each stage",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={17} className="text-emerald-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Find your winning stack <ArrowRight size={15} />
              </a>
            </motion.div>

            {/* Visual: Workflow health + funnel */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-emerald-500/6 blur-[60px] rounded-full pointer-events-none" />
              <div className="space-y-3">
                {/* Stack comparison */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                  <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Workflow Health · Stack Comparison</span>
                    <span className="text-[10px] text-slate-600">Last 30d</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {[
                      { name: "Clay → HeyReach → Instantly", reply: 24, close: 8.1,  rev: "$84,600", winner: true  },
                      { name: "Apollo → Email Only",          reply: 9,  close: 3.2,  rev: "$31,200", winner: false },
                      { name: "ZoomInfo → Instantly",         reply: 6,  close: 1.8,  rev: "$12,800", winner: false },
                    ].map((stack, i) => (
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

                {/* Funnel */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl p-4">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Pipeline Funnel · Winning Stack</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Sourced",   n: 300,  pct: 100, color: "from-violet-500 to-indigo-500"   },
                      { label: "Enriched",  n: 287,  pct: 96,  color: "from-indigo-500 to-blue-500"     },
                      { label: "Contacted", n: 241,  pct: 84,  color: "from-blue-500 to-sky-500"        },
                      { label: "Replied",   n: 72,   pct: 30,  color: "from-sky-500 to-cyan-500"        },
                      { label: "Meetings",  n: 29,   pct: 40,  color: "from-cyan-500 to-teal-500"       },
                      { label: "Won",       n: 24,   pct: 83,  color: "from-emerald-500 to-green-500"   },
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
            </motion.div>
          </div>
        </section>


        {/* ── Pricing ───────────────────────────────────────────────────────── */}
        <section id="pricing" className="relative bg-slate-950 py-24 border-t border-slate-900">
          <div className="mx-auto max-w-4xl text-center px-4">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Start free.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">See value in 24 hours.</span>
            </h2>
            <p className="text-slate-400 text-lg mb-12">Connect your first tool in 5 minutes. No card required.</p>

            <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto text-left">
              {/* Starter */}
              <div className="p-7 rounded-3xl border border-slate-800 bg-slate-900/30 flex flex-col">
                <div className="text-sm font-semibold text-slate-400 mb-2">Starter</div>
                <div className="text-4xl font-bold text-white mb-1">$29<span className="text-base text-slate-500 font-normal">/mo</span></div>
                <div className="text-xs text-slate-600 mb-6">1 seat · 1 workspace · 2 automations · 10K events</div>
                <ul className="space-y-2.5 text-sm text-slate-400 flex-1">
                  {["1 Seat · 1 Workspace", "2 Make.com or n8n automations", "10,000 events / month", "Live Feed + Contact Inspector", "Pipeline Health monitoring"].map((f) => (
                    <li key={f} className="flex gap-2.5"><CheckCircle2 size={15} className="text-indigo-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <a href="/signup?plan=starter" className="mt-7 block w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-sm font-bold text-white hover:bg-slate-700 transition-colors">
                  Start 30-day free trial
                </a>
              </div>

              {/* Growth */}
              <div className="p-7 rounded-3xl border border-slate-800 bg-slate-900/30 flex flex-col">
                <div className="text-sm font-semibold text-slate-400 mb-2">Growth</div>
                <div className="text-4xl font-bold text-white mb-1">$99<span className="text-base text-slate-500 font-normal">/mo</span></div>
                <div className="text-xs text-slate-600 mb-6">3 seats · 3 workspaces · 10 automations · 500K events</div>
                <ul className="space-y-2.5 text-sm text-slate-400 flex-1">
                  {["3 Seats · 3 Workspaces", "10 Make.com or n8n automations", "500,000 events / month", "All features incl. Workflow Health", "GTM Report PDF/XLSX export"].map((f) => (
                    <li key={f} className="flex gap-2.5"><CheckCircle2 size={15} className="text-indigo-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <a href="/signup?plan=growth" className="mt-7 block w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-sm font-bold text-white hover:bg-slate-700 transition-colors">
                  Start 30-day free trial
                </a>
              </div>

              {/* Agency */}
              <div className="p-7 rounded-3xl border border-slate-800 bg-slate-900/30 relative overflow-hidden flex flex-col">
                <div className="text-sm font-semibold text-slate-400 mb-2">Agency</div>
                <div className="text-4xl font-bold text-white mb-1">$299<span className="text-base text-slate-500 font-normal">/mo</span></div>
                <div className="text-xs text-slate-500 mb-6">Unlimited seats · 20 workspaces · 50 automations · 5M events</div>
                <ul className="space-y-2.5 text-sm text-slate-300 flex-1">
                  {["Unlimited Seats · 20 Workspaces", "50 Make.com or n8n automations", "5,000,000 events / month", "All features + Workflow Health", "API access + webhooks", "Priority 24/7 support", "Additional workspaces available at surcharge"].map((f) => (
                    <li key={f} className="flex gap-2.5"><CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <a href="/signup?plan=agency" className="mt-7 block w-full rounded-xl bg-white py-3 text-center text-sm font-bold text-slate-950 hover:bg-slate-100 transition-colors shadow-lg">
                  Start 30-day free trial
                </a>
              </div>
            </div>

          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────────── */}
        <section className="py-24 bg-slate-950 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06)_0%,transparent_70%)]" />
          <div className="relative mx-auto max-w-3xl px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex justify-center mb-6">
                <div className="h-14 w-14 rounded-2xl overflow-hidden">
                  <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
                </div>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
                Your stack is already generating data.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">Start reading it.</span>
              </h2>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
                Paste a webhook URL. Watch events flow in. Find your first broken tool or winning motion in the first hour — or we'll set it up with you.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <a href="/signup" className="inline-flex h-14 items-center justify-center rounded-full bg-white text-slate-950 px-10 text-base font-bold shadow-xl hover:bg-slate-100 hover:scale-105 transition-all">
                  Get started free — no card needed
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
                <a href="/demo" className="inline-flex h-14 items-center justify-center rounded-full border border-slate-700 bg-slate-900/50 px-8 text-base font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all">
                  See the demo first
                </a>
              </div>
              <p className="mt-5 text-xs text-slate-600">Connects in 5 minutes · paste a webhook · no code required</p>
            </motion.div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}