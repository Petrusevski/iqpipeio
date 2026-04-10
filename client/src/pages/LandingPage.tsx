import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Database,
  Search,
  Mail,
  Briefcase,
  ArrowRight,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Target,
  Radio,
  Bell,
  BarChart3,
  Bot,
  Cpu,
  AlertTriangle,
  Activity,
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

        {/* ── Context bridge ───────────────────────────────────────────────── */}
        <section className="bg-slate-950 py-20 relative overflow-hidden border-t border-slate-900/60">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:48px_48px]" />
          <div className="relative mx-auto max-w-5xl px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 mb-8 text-xs font-semibold text-indigo-300 uppercase tracking-widest">
                <Bot size={12} />
                Built for Claude-powered GTM execution
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 leading-tight">
                GTM engineers rely on Claude to run their outbound.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
                  Claude relies on IQPipe to not fly blind.
                </span>
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-12">
                Claude can write sequences, trigger workflows, and orchestrate campaigns through n8n and Make.com. But it has no memory between sessions, no feedback loop after execution, and no access to your historical performance data. IQPipe fixes all five of those gaps.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-3xl mx-auto">
                {[
                  { icon: ShieldCheck, label: "Safe-to-contact gate", color: "text-emerald-400" },
                  { icon: Target,      label: "Sequence selection",   color: "text-indigo-400"  },
                  { icon: Radio,       label: "Execution confirmation",color: "text-sky-400"    },
                  { icon: Bell,        label: "Proactive alerting",   color: "text-amber-400"  },
                  { icon: BarChart3,   label: "Campaign evaluation",  color: "text-fuchsia-400" },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
                    <Icon size={18} className={color} />
                    <span className="text-[11px] text-slate-400 text-center leading-snug">{label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Argument 1: check_lead_status ────────────────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 relative overflow-hidden border-t border-slate-900">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-slate-800 to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:48px_48px]" />
          <div className="absolute left-0 top-1/3 w-[500px] h-[500px] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                <ShieldCheck size={12} /> Gap 1 of 5 · Safe-to-contact gate
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                Claude doesn't know<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                  who you already contacted.
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Every session, Claude starts fresh. Hand it 200 leads and it has no idea that 40 were already contacted last week, 3 opted out, and 2 already have meetings booked. It will enroll all 200.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                IQPipe gives Claude a cross-session memory. Before any enrollment, Claude calls <code className="text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded text-sm font-mono">check_lead_status</code> on the full batch and receives a per-lead verdict — <span className="text-white font-semibold">safe or blocked, with the exact reason</span>. Only the safe leads reach n8n.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Blocks re-contact within 3-day cooldown window",
                  "Flags leads already active in another sequence",
                  "Prevents outreach to opted-out or meeting-booked leads",
                  "Batch of up to 200 emails — one call, instant result",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Give Claude a memory <ArrowRight size={15} />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-emerald-500/6 blur-[60px] rounded-full pointer-events-none" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                  <Bot size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-300">Claude → IQPipe · check_lead_status</span>
                </div>
                <div className="px-5 py-3 border-b border-slate-800/50 bg-indigo-500/5">
                  <div className="text-[10px] text-slate-500 mb-1 font-mono">→ request</div>
                  <code className="text-[11px] font-mono text-indigo-300">emails: ["john@acme.com", "sara@corp.io", "mike@vc.com", "+197 more"]</code>
                </div>
                <div className="divide-y divide-slate-800/40">
                  {[
                    { email: "john@acme.com",  safe: false, reason: "Active in sequence seq_442 since 3 days ago",       color: "text-rose-400",   icon: XCircle    },
                    { email: "sara@corp.io",   safe: false, reason: "Opted out via Lemlist on Apr 1",                    color: "text-rose-400",   icon: XCircle    },
                    { email: "mike@vc.com",    safe: false, reason: "Meeting booked — escalate to sales",                color: "text-amber-400",  icon: AlertTriangle },
                    { email: "anna@fund.io",   safe: true,  reason: "No prior contact found",                            color: "text-emerald-400", icon: CheckCircle2 },
                    { email: "dan@seed.com",   safe: true,  reason: "Last contacted 22 days ago — cooldown passed",      color: "text-emerald-400", icon: CheckCircle2 },
                  ].map(({ email, safe, reason, color, icon: Icon }) => (
                    <div key={email} className={`flex items-start gap-3 px-5 py-3 ${safe ? "" : "bg-rose-500/3"}`}>
                      <Icon size={13} className={`${color} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-slate-200 truncate">{email}</div>
                        <div className={`text-[10px] ${color} mt-0.5`}>{reason}</div>
                      </div>
                      <span className={`text-[10px] font-bold shrink-0 ${safe ? "text-emerald-400" : "text-rose-400"}`}>{safe ? "SAFE" : "BLOCKED"}</span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">153 safe to enroll · 47 blocked</span>
                  <span className="text-[10px] font-mono text-emerald-400">safeToContact: 153</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Argument 2: get_sequence_recommendation ────────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute right-0 top-1/4 w-[500px] h-[500px] bg-indigo-500/6 blur-[120px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative order-2 md:order-1"
            >
              <div className="absolute -inset-4 bg-indigo-500/6 blur-[60px] rounded-full pointer-events-none" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                  <Target size={13} className="text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-300">Claude → IQPipe · get_sequence_recommendation</span>
                </div>
                <div className="px-5 py-3 border-b border-slate-800/50 bg-indigo-500/5">
                  <div className="text-[10px] text-slate-500 mb-1 font-mono">→ request</div>
                  <code className="text-[11px] font-mono text-indigo-300">title: "VP of Sales" · source_tool: "apollo" · channel: "linkedin"</code>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { rank: 1, seq: "seq_linkedin_vp_outbound", tool: "HeyReach", reply: "18.4%", meeting: "6.2%", score: 94, reasons: ["High reply rate (18.4%)", "14 VP-titled leads converted here", "Matches linkedin channel"] },
                    { rank: 2, seq: "seq_apollo_sr_email",      tool: "Instantly", reply: "11.2%", meeting: "3.8%", score: 61, reasons: ["Strong meeting rate (3.8%)", "8 apollo-sourced leads converted"] },
                    { rank: 3, seq: "seq_warm_linkedin",         tool: "HeyReach", reply: "7.1%",  meeting: "2.1%", score: 38, reasons: ["Moderate reply rate (7.1%)"] },
                  ].map((rec) => (
                    <div key={rec.seq} className={`p-3 rounded-xl border ${rec.rank === 1 ? "border-indigo-500/30 bg-indigo-500/5" : "border-slate-800 bg-slate-900/30"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${rec.rank === 1 ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-500"}`}>#{rec.rank}</span>
                          <code className={`text-[10px] font-mono ${rec.rank === 1 ? "text-indigo-300" : "text-slate-500"}`}>{rec.seq}</code>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rec.rank === 1 ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300" : "text-slate-600 border border-slate-800"}`}>score {rec.score}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                        <div><div className="text-slate-600">Tool</div><div className={`font-bold ${rec.rank === 1 ? "text-white" : "text-slate-500"}`}>{rec.tool}</div></div>
                        <div><div className="text-slate-600">Reply</div><div className={`font-bold ${rec.rank === 1 ? "text-emerald-400" : "text-slate-500"}`}>{rec.reply}</div></div>
                        <div><div className="text-slate-600">Meeting</div><div className={`font-bold ${rec.rank === 1 ? "text-emerald-400" : "text-slate-500"}`}>{rec.meeting}</div></div>
                      </div>
                      {rec.rank === 1 && (
                        <div className="flex flex-wrap gap-1">
                          {rec.reasons.map(r => (
                            <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="order-1 md:order-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                <Target size={12} /> Gap 2 of 5 · Sequence selection
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                Claude picks sequences<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
                  by name, not by data.
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                When a GTM engineer tells Claude "enroll these VP-level leads," Claude picks a sequence based on its name or whatever context was in the prompt. It has never seen your reply rates, your meeting rates, or which sequences historically convert similar titles.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                IQPipe gives Claude that performance history. Claude calls <code className="text-indigo-400 bg-slate-900 px-1.5 py-0.5 rounded text-sm font-mono">get_sequence_recommendation</code> with the lead's title, source tool, and preferred channel — and gets back a ranked list with the reasons why each sequence scored higher for this specific ICP.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Ranks sequences by historical reply and meeting rate",
                  "Matches leads to sequences that converted similar titles",
                  "Filters by channel (LinkedIn, email, phone)",
                  "Explains the recommendation — Claude can justify the choice",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={16} className="text-indigo-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Let Claude pick smarter <ArrowRight size={15} />
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── Argument 3: confirm_event_received ────────────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute left-0 top-1/3 w-[400px] h-[400px] bg-sky-500/5 blur-[100px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                <Radio size={12} /> Gap 3 of 5 · Execution confirmation
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                Claude fires n8n.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400">
                  Did it actually work?
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Claude triggers an n8n workflow. That workflow sends a lead to HeyReach. HeyReach sends a LinkedIn message. At every step, things can silently fail — a misconfigured webhook, a missing email field in the payload, a paused node. Claude has no way to know.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                IQPipe closes the loop. Claude calls <code className="text-sky-400 bg-slate-900 px-1.5 py-0.5 rounded text-sm font-mono">confirm_event_received</code> and within minutes knows if the event arrived, was processed, or was dropped — and why. If it failed, Claude acts immediately instead of the engineer finding out the next morning.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Checks webhook delivery within any time window",
                  "Returns processed vs. dropped vs. error count",
                  "Explains drop reason — missing email, quota, auth failure",
                  "Closes the execution loop without human review",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={16} className="text-sky-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Close Claude's execution loop <ArrowRight size={15} />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-sky-500/6 blur-[60px] rounded-full pointer-events-none" />
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                    <Radio size={13} className="text-sky-400" />
                    <span className="text-xs font-semibold text-slate-300">confirm_event_received · HeyReach</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Success case */}
                    <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity size={12} className="text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wide">Pipeline healthy</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                        <div><div className="text-slate-600">arrived</div><div className="font-bold text-emerald-400">true</div></div>
                        <div><div className="text-slate-600">processed</div><div className="font-bold text-emerald-400">47</div></div>
                        <div><div className="text-slate-600">window</div><div className="font-bold text-slate-300">10 min</div></div>
                      </div>
                      <p className="text-[10px] text-emerald-400/80 leading-relaxed">47 of 47 events from HeyReach were successfully processed by IQPipe. The pipeline is working.</p>
                    </div>
                    {/* Failure case */}
                    <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={12} className="text-rose-400" />
                        <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wide">Pipeline broken</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                        <div><div className="text-slate-600">arrived</div><div className="font-bold text-rose-400">false</div></div>
                        <div><div className="text-slate-600">processed</div><div className="font-bold text-rose-400">0</div></div>
                        <div><div className="text-slate-600">window</div><div className="font-bold text-slate-300">10 min</div></div>
                      </div>
                      <p className="text-[10px] text-rose-400/80 leading-relaxed">No events from HeyReach received. The n8n node may not have executed, or the webhook URL is misconfigured.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 flex items-start gap-3">
                  <Bot size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Claude reads the verdict and acts immediately: <span className="text-white">if arrived is false after 5 minutes, Claude flags the failure and tells the engineer exactly what to check</span> — no morning log review needed.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Argument 4: Proactive anomaly detection ───────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute right-0 top-1/4 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative order-2 md:order-1"
            >
              <div className="absolute -inset-4 bg-amber-500/5 blur-[60px] rounded-full pointer-events-none" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                  <div className="flex items-center gap-2">
                    <Bell size={13} className="text-amber-400" />
                    <span className="text-xs font-semibold text-slate-300">Active anomalies · get_anomalies</span>
                  </div>
                  <span className="text-[10px] text-slate-600">detected 4m ago</span>
                </div>
                <div className="divide-y divide-slate-800/40">
                  {[
                    { sev: "critical", tool: "HeyReach", title: "Tool went silent — 14 hours, 0 events", detail: "Expected connection_sent events based on 30-day baseline. Last good event: 14h ago.", color: "border-rose-500/30 bg-rose-500/5", badge: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
                    { sev: "warning",  tool: "Instantly", title: "Reply rate dropped 61% vs last week", detail: "Sequence seq_cold_outbound: was 12.4%, now 4.8%. Possible: spam filter or subject line change.", color: "border-amber-500/20 bg-amber-500/4", badge: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
                    { sev: "warning",  tool: "Webhooks",  title: "47 events dropped — no identity found", detail: "HubSpot payload missing 'email' field. Leads not being tracked in IQPipe.", color: "border-amber-500/20 bg-amber-500/4", badge: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
                  ].map((a) => (
                    <div key={a.title} className={`p-4 border-l-2 ${a.color} ml-0`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${a.badge}`}>{a.sev}</span>
                        <span className="text-xs font-semibold text-slate-200">{a.tool}</span>
                      </div>
                      <div className="text-[11px] text-white font-medium mb-1">{a.title}</div>
                      <div className="text-[10px] text-slate-500 leading-relaxed">{a.detail}</div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500">apply_fix · workflow_not_triggering</span>
                    <span className="text-[9px] font-bold text-emerald-400 uppercase">Auto-executed</span>
                  </div>
                  <div className="text-[11px] text-emerald-300">HeyReach scenario re-activated via Make API. Watch recovery initiated.</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="order-1 md:order-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                <Bell size={12} /> Gap 4 of 5 · Proactive alerting
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                Campaigns break<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
                  while Claude isn't watching.
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Claude only knows what happens in the current session. If a webhook stops firing at 2am, a sequence stalls, or reply rates drop 60% mid-campaign — Claude finds out when the engineer notices the numbers are wrong. Days later.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                IQPipe scans continuously. When Claude is next invoked, it calls <code className="text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded text-sm font-mono">get_anomalies</code> first — surfaces active issues, diagnoses root causes, and can re-activate a paused n8n or Make scenario automatically. Claude goes from reactive to proactive.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Continuous silence detection per tool — alerts within 30 minutes",
                  "Reply rate drops flagged vs. 30-day baseline",
                  "Webhook identity failures surfaced before leads are lost",
                  "apply_fix re-activates paused workflows via API without human input",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Make Claude proactive <ArrowRight size={15} />
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── Argument 5: get_improvement_report ───────────────────────────── */}
        <section className="bg-slate-950 py-24 md:py-36 border-t border-slate-900 relative overflow-hidden">
          <div className="absolute left-0 top-1/3 w-[500px] h-[500px] bg-fuchsia-500/5 blur-[120px] rounded-full pointer-events-none" />

          <div className="relative mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-xs font-semibold mb-6 uppercase tracking-widest">
                <BarChart3 size={12} /> Gap 5 of 5 · Campaign evaluation
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
                Claude runs the campaign.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-400">
                  IQPipe tells it what to change.
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed mb-6">
                Without IQPipe, Claude executes campaigns but can never evaluate them. It doesn't know which funnel stage dropped leads, which sequence underperformed, which branch had zero conversion. It depends entirely on what the engineer reports back — which is always late and always incomplete.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                IQPipe closes the loop. Claude calls <code className="text-fuchsia-400 bg-slate-900 px-1.5 py-0.5 rounded text-sm font-mono">get_improvement_report</code> after a campaign runs and gets a structured list of issues and specific suggestions — with n8n and Make.com instructions ready to pass back into the next workflow iteration.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  "Synthesizes webhook health, stuck leads, funnel bottlenecks, branch gaps",
                  "Ranks issues by severity — critical before warning",
                  "Each suggestion includes n8n and Make.com implementation hints",
                  "Claude can plan the next iteration without asking the engineer for data",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 size={16} className="text-fuchsia-400 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                Close the execution loop <ArrowRight size={15} />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-fuchsia-500/5 blur-[60px] rounded-full pointer-events-none" />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/60">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={13} className="text-fuchsia-400" />
                    <span className="text-xs font-semibold text-slate-300">get_improvement_report · Last 30d</span>
                  </div>
                  <span className="text-[10px] text-slate-600">3 critical · 2 warning</span>
                </div>
                <div className="divide-y divide-slate-800/40">
                  {[
                    {
                      priority: 1, impact: "high", sev: "critical",
                      action: "Fix failing workflow nodes",
                      detail: "2 workflows have <70% reliability. Failed events mean lost pipeline signals.",
                      n8n: "Add Error Trigger node. Re-authenticate expired credentials in Settings.",
                      color: "text-rose-400", badge: "bg-rose-500/15 border-rose-500/30 text-rose-300",
                    },
                    {
                      priority: 2, impact: "high", sev: "critical",
                      action: "Recover ~$18,400 in pipeline leakage",
                      detail: "meeting_booked events failing at $5,000 ACV. Top leak: 8 failed meeting_booked.",
                      n8n: "Add Retry node after CRM HTTP Request. Use IF node to alert on error.",
                      color: "text-amber-400", badge: "bg-amber-500/15 border-amber-500/30 text-amber-300",
                    },
                    {
                      priority: 3, impact: "medium", sev: "warning",
                      action: "Follow up on 34 silent leads (8+ days)",
                      detail: "Received outreach, never replied. A timed follow-up recovers 10–20% of these.",
                      n8n: "Add Wait node (5d) → check reply via IQPipe → conditional follow-up.",
                      color: "text-indigo-400", badge: "bg-indigo-500/15 border-indigo-500/30 text-indigo-300",
                    },
                  ].map((s) => (
                    <div key={s.priority} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${s.badge}`}>{s.sev}</span>
                        <span className="text-xs font-semibold text-white">#{s.priority} · {s.action}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">{s.detail}</p>
                      <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                        <Cpu size={10} className="text-indigo-400 shrink-0 mt-0.5" />
                        <span className="text-[9px] text-slate-400 leading-relaxed"><span className="text-indigo-400 font-semibold">n8n hint:</span> {s.n8n}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ── MCP: 37 tools, one connection ────────────────────────────────── */}
        <section className="relative bg-[#0a0f1e] py-24 border-t border-slate-800/60 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
            <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full bg-fuchsia-600/8 blur-[120px]" />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-xs font-medium text-indigo-300 tracking-wide uppercase">Model Context Protocol · 37 tools</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-5">
                One MCP connection.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
                  Everything Claude needs.
                </span>
              </h2>

              <p className="text-slate-400 text-lg leading-relaxed mb-8 max-w-md">
                Connect Claude to IQPipe's MCP server and it gains access to 37 tools covering every gap in GTM execution — from safe-to-contact checks to sequence recommendations to live webhook confirmation. No custom integration. One API key.
              </p>

              <div className="grid grid-cols-2 gap-2 mb-10">
                {[
                  { label: "check_lead_status",           color: "text-emerald-400" },
                  { label: "get_sequence_recommendation", color: "text-indigo-400"  },
                  { label: "confirm_event_received",      color: "text-sky-400"     },
                  { label: "get_anomalies",               color: "text-amber-400"   },
                  { label: "get_improvement_report",      color: "text-fuchsia-400" },
                  { label: "compare_workflows",           color: "text-violet-400"  },
                  { label: "get_stuck_leads",             color: "text-rose-400"    },
                  { label: "get_outcome_attribution",     color: "text-cyan-400"    },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/40">
                    <span className={`text-[9px] font-bold ${color}`}>fn</span>
                    <code className={`text-[10px] font-mono ${color}`}>{label}</code>
                  </div>
                ))}
              </div>

              <Link
                to="/mcp-protocol"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-6 py-3 text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-500/20"
              >
                See all 37 tools
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10 blur-xl -z-10" />
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 backdrop-blur overflow-hidden shadow-2xl">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-700/60 bg-slate-800/60">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                  <span className="ml-3 text-xs text-slate-500 font-mono">claude  →  iqpipe MCP</span>
                </div>
                <div className="p-5 font-mono text-[12px] leading-relaxed overflow-x-auto space-y-4">
                  <div>
                    <div className="text-slate-500 mb-1.5">{"// 1. Gate: are these leads safe to contact?"}</div>
                    <div><span className="text-fuchsia-400">await </span><span className="text-amber-300">check_lead_status</span><span className="text-slate-300">{"({ "}</span><span className="text-indigo-300">emails</span><span className="text-slate-400">{": ["}</span><span className="text-emerald-400">...200leads</span><span className="text-slate-300">{"]})"}</span></div>
                    <div className="mt-1 pl-3 text-emerald-400">{"→ { safeToContact: 153, blocked: 47 }"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-1.5">{"// 2. Which sequence converts VP of Sales best?"}</div>
                    <div><span className="text-fuchsia-400">await </span><span className="text-amber-300">get_sequence_recommendation</span><span className="text-slate-300">{"({"}</span></div>
                    <div className="pl-5"><span className="text-indigo-300">title</span><span className="text-slate-400">{": "}</span><span className="text-emerald-400">"VP of Sales"</span><span className="text-slate-300">{", "}</span><span className="text-indigo-300">channel</span><span className="text-slate-400">{": "}</span><span className="text-emerald-400">"linkedin"</span></div>
                    <div><span className="text-slate-300">{"});"}</span></div>
                    <div className="mt-1 pl-3 text-emerald-400">{"→ seq_linkedin_vp_outbound (score 94, reply 18.4%)"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-1.5">{"// 3. After n8n fires — did HeyReach get it?"}</div>
                    <div><span className="text-fuchsia-400">await </span><span className="text-amber-300">confirm_event_received</span><span className="text-slate-300">{"({ "}</span><span className="text-indigo-300">tool</span><span className="text-slate-400">{": "}</span><span className="text-emerald-400">"HeyReach"</span><span className="text-slate-300">{"});"}</span></div>
                    <div className="mt-1 pl-3 text-emerald-400">{"→ { arrived: true, processed: 47 }"}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-700/60 bg-slate-800/40">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] text-emerald-400 font-medium">Connected · 37 tools active</span>
                  </div>
                  <span className="text-[11px] text-slate-600 font-mono">MCP/1.0</span>
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
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">Claude gets smarter from day one.</span>
            </h2>
            <p className="text-slate-400 text-lg mb-12">Connect your first workflow in 5 minutes. No card required.</p>

            <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto text-left">
              {/* Starter */}
              <div className="p-7 rounded-3xl border border-slate-800 bg-slate-900/30 flex flex-col">
                <div className="text-sm font-semibold text-slate-400 mb-2">Starter</div>
                <div className="text-4xl font-bold text-white mb-1">$29<span className="text-base text-slate-500 font-normal">/mo</span></div>
                <div className="text-xs text-slate-600 mb-6">1 seat · 1 workspace · 2 automations · 10K events</div>
                <ul className="space-y-2.5 text-sm text-slate-400 flex-1">
                  {[
                    "1 Seat · 1 Workspace",
                    "2 Make.com or n8n workflows",
                    "10,000 events / month",
                    "Claude AI Agent (MCP) — all 37 tools",
                    "Live Feed + Contact Inspector",
                    "Pipeline health monitoring",
                  ].map((f) => (
                    <li key={f} className="flex gap-2.5"><CheckCircle2 size={15} className="text-indigo-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <a href="/signup?plan=starter" className="mt-7 block w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-center text-sm font-bold text-white hover:bg-slate-700 transition-colors">
                  Start 14-day free trial
                </a>
              </div>

              {/* Growth */}
              <div className="p-7 rounded-3xl border border-indigo-500/30 bg-indigo-500/5 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-500 text-white text-[10px] font-bold uppercase rounded-bl-xl">Most popular</div>
                <div className="text-sm font-semibold text-indigo-400 mb-2">Growth</div>
                <div className="text-4xl font-bold text-white mb-1">$99<span className="text-base text-slate-500 font-normal">/mo</span></div>
                <div className="text-xs text-slate-600 mb-6">3 seats · 3 workspaces · 10 automations · 500K events</div>
                <ul className="space-y-2.5 text-sm text-slate-300 flex-1">
                  {[
                    "3 Seats · 3 Workspaces",
                    "10 Make.com or n8n workflows",
                    "500,000 events / month",
                    "Claude AI Agent (MCP) — all 37 tools",
                    "Workflow Health + Improvement Report",
                    "GTM Report PDF/XLSX export",
                    "API Access & Webhooks",
                  ].map((f) => (
                    <li key={f} className="flex gap-2.5"><CheckCircle2 size={15} className="text-indigo-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <a href="/signup?plan=growth" className="mt-7 block w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 text-center text-sm font-bold text-white transition-colors shadow-lg">
                  Start 14-day free trial
                </a>
              </div>

              {/* Agency */}
              <div className="p-7 rounded-3xl border border-slate-800 bg-slate-900/30 relative overflow-hidden flex flex-col">
                <div className="text-sm font-semibold text-slate-400 mb-2">Agency</div>
                <div className="text-4xl font-bold text-white mb-1">$299<span className="text-base text-slate-500 font-normal">/mo</span></div>
                <div className="text-xs text-slate-500 mb-6">Unlimited seats · 20 workspaces · 50 automations · 5M events</div>
                <ul className="space-y-2.5 text-sm text-slate-300 flex-1">
                  {[
                    "Unlimited Seats · 20 Workspaces",
                    "50 Make.com or n8n workflows",
                    "5,000,000 events / month",
                    "Claude AI Agent (MCP) — all 37 tools",
                    "Full API Access & Webhooks",
                    "GTM Report PDF/XLSX export",
                    "Priority 24/7 support",
                    "Additional workspaces at surcharge",
                  ].map((f) => (
                    <li key={f} className="flex gap-2.5"><CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <a href="/signup?plan=agency" className="mt-7 block w-full rounded-xl bg-white py-3 text-center text-sm font-bold text-slate-950 hover:bg-slate-100 transition-colors shadow-lg">
                  Start 14-day free trial
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
                Your Claude agent is already capable.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">Give it the context to prove it.</span>
              </h2>
              <p className="text-slate-400 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
                Connect IQPipe to your Claude account via MCP. From the next session, Claude will check lead safety before enrolling, pick sequences by performance, confirm every webhook landed, and tell you what to fix when campaigns stall.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <a href="/signup" className="inline-flex h-14 items-center justify-center rounded-full bg-white text-slate-950 px-10 text-base font-bold shadow-xl hover:bg-slate-100 hover:scale-105 transition-all">
                  Connect Claude to IQPipe free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
                <a href="/mcp-protocol" className="inline-flex h-14 items-center justify-center rounded-full border border-slate-700 bg-slate-900/50 px-8 text-base font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-all">
                  See the MCP tools
                </a>
              </div>
              <p className="mt-5 text-xs text-slate-600">One API key · connects in 5 minutes · no code required</p>
            </motion.div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}