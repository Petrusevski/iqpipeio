import { motion } from "framer-motion";
import DataLifecycleVertical from "../components/DataLifecycleVertical";
import {
  Database,
  Mail,
  Users,
  ArrowRight,
  BarChart3,
  Activity,
  Layers,
  Zap,
  Fingerprint, // Added Import
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

// --- Components for the Animation Section ---

const ToolNode = ({
  icon: Icon,
  label,
  color,
  delay,
}: {
  icon: any;
  label: string;
  color: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg p-2 pr-4 shadow-lg backdrop-blur-sm z-10 w-48"
  >
    <div className={`p-1.5 rounded-md ${color} text-slate-950`}>
      <Icon size={14} />
    </div>
    <span className="text-xs font-medium text-slate-300 truncate">{label}</span>
  </motion.div>
);

// Lines connecting Left Tools -> Center Hub
const LeftConnectionLines = () => (
  <div className="absolute right-full top-1/2 -translate-y-1/2 w-12 md:w-24 h-24 pointer-events-none">
    {/* Top Line */}
    <div className="absolute top-0 right-0 w-full h-[1px] bg-slate-800 origin-right -rotate-[15deg]">
      <motion.div
        className="w-8 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
        animate={{ x: [-50, 100] }}
        transition={{
          repeat: Infinity,
          duration: 2,
          delay: 0,
          ease: "linear",
        }}
      />
    </div>
    
    {/* Middle Line */}
    <div className="absolute top-1/2 right-0 w-full h-[1px] bg-slate-800 -translate-y-1/2">
        <motion.div
        className="w-8 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
        animate={{ x: [-50, 100] }}
        transition={{
          repeat: Infinity,
          duration: 2,
          delay: 0.5,
          ease: "linear",
        }}
      />
    </div>

    {/* Bottom Line */}
    <div className="absolute bottom-0 right-0 w-full h-[1px] bg-slate-800 origin-right rotate-[15deg]">
       <motion.div
        className="w-8 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
        animate={{ x: [-50, 100] }}
        transition={{
          repeat: Infinity,
          duration: 2,
          delay: 1,
          ease: "linear",
        }}
      />
    </div>
  </div>
);

// Line connecting Center Hub -> Right Chart
const RightConnectionLine = () => (
  <div className="absolute left-full top-1/2 -translate-y-1/2 w-12 md:w-24 h-[1px] bg-slate-800 overflow-hidden pointer-events-none">
    <motion.div
      className="w-8 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
      animate={{ x: [-50, 100] }}
      transition={{
        repeat: Infinity,
        duration: 1.5,
        delay: 1,
        ease: "linear",
      }}
    />
  </div>
);

const CentralHub = () => (
  <motion.div
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ delay: 0.5, duration: 0.5 }}
    className="relative z-20 h-24 w-24 rounded-full border border-slate-700 bg-slate-900 flex flex-col items-center justify-center shadow-2xl shadow-indigo-500/10 shrink-0"
  >
    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/20 to-sky-400/20 blur-md animate-pulse" />
    
    {/* UPDATED LOGO CONTAINER */}
    <div className="h-10 w-10 rounded-xl overflow-hidden shadow-inner mb-1">
      <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
    </div>
    
    <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">
      ID Engine
    </div>
  </motion.div>
);

const OutputChart = () => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 1, duration: 0.5 }}
    className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 w-40 h-28 flex flex-col justify-between shadow-lg backdrop-blur-sm shrink-0"
  >
    <div className="flex justify-between items-start">
      <div className="text-[10px] text-slate-400">Revenue Attr.</div>
      <Activity size={12} className="text-emerald-400" />
    </div>
    <div className="flex items-end gap-1.5 h-12">
      {[40, 65, 35, 85].map((h, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${h}%` }}
          transition={{
            delay: 1.5 + i * 0.1,
            duration: 1,
            repeat: Infinity,
            repeatType: "reverse",
            repeatDelay: 2,
          }}
          className="flex-1 rounded-sm bg-gradient-to-t from-indigo-500/50 to-cyan-400/80"
        />
      ))}
    </div>
  </motion.div>
);

// --- Main Page Component ---

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans selection:bg-indigo-500/30">
      <Header />

      <main className="flex-1 flex flex-col">
        {/* Hero / Diagram Section */}
        <section className="border-b border-slate-900 bg-gradient-to-b from-slate-950 to-slate-900/50 relative overflow-hidden">
          {/* Background Grid */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light pointer-events-none"></div>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

          <div className="mx-auto max-w-7xl px-4 py-16 md:py-24 grid lg:grid-cols-2 gap-16 items-center relative z-10">
            {/* Left: Text Content */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6"
              >
                <Zap size={12} className="fill-current" />
                <span>The Logic Layer</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-5xl font-bold leading-tight mb-6 tracking-tight"
              >
                Stop connecting tools. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-sky-400">
                  Start connecting data.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-slate-400 mb-8 max-w-lg leading-relaxed"
              >
                Tools speak different languages. iqpipe acts as the universal
                translator, assigning a single{" "}
                <span className="text-slate-200 font-medium mx-1">
                  Identity ID
                </span>{" "}
                that persists from cold email to closed deal.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-4"
              >
                <a
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-6 py-3 text-sm font-semibold hover:bg-indigo-500 transition-all shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]"
                >
                  Start building your schema
                  <ArrowRight size={16} />
                </a>
              </motion.div>
            </div>

            {/* Right: Animated Diagram */}
            <div className="w-full flex items-center justify-center">
              {/* This container uses flex gap to ensure spacing, preventing overlap */}
              <div className="relative flex items-center justify-center gap-8 md:gap-16 select-none py-10">
                
                {/* Column 1: Inputs */}
                <div className="flex flex-col gap-6 z-10">
                  <ToolNode
                    icon={Mail}
                    label="Instantly / SmartLead"
                    color="bg-blue-400"
                    delay={0.2}
                  />
                  <ToolNode
                    icon={Users}
                    label="Clay / Apollo"
                    color="bg-orange-400"
                    delay={0.4}
                  />
                  <ToolNode
                    icon={Database}
                    label="HubSpot / Salesforce"
                    color="bg-emerald-400"
                    delay={0.6}
                  />
                </div>

                {/* Column 2: Hub (Anchor for lines) */}
                <div className="relative flex items-center justify-center">
                    <LeftConnectionLines />
                    <CentralHub />
                    <RightConnectionLine />
                </div>

                {/* Column 3: Output */}
                <div className="z-10">
                  <OutputChart />
                </div>
                
              </div>
            </div>
          </div>
        </section>

        {/* Detailed Steps Section */}
        <section className="py-20 bg-slate-950 relative">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* Connecting Line for Desktop */}
              <div className="hidden md:block absolute top-8 left-[16%] right-[16%] h-[2px] bg-slate-800 -z-0"></div>

              {/* Step 1 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="relative group"
              >
                <div className="w-16 h-16 mx-auto bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 relative z-10 shadow-xl group-hover:border-indigo-500/50 group-hover:scale-110 transition-all duration-300">
                  <Layers className="text-indigo-400" size={28} />
                  <div className="absolute -inset-2 bg-indigo-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-lg font-semibold text-center mb-3">
                  1. Unify Sources
                </h3>
                <p className="text-sm text-slate-400 text-center leading-relaxed">
                  Connect webhooks from Clay, Instantly, or Apollo. We capture
                  the raw payload and standardize it instantly.
                </p>
              </motion.div>

              {/* Step 2 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="relative group"
              >
                <div className="w-16 h-16 mx-auto bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 relative z-10 shadow-xl group-hover:border-fuchsia-500/50 group-hover:scale-110 transition-all duration-300">
                  <div className="font-mono font-bold text-fuchsia-400 text-xl">
                    ID
                  </div>
                  <div className="absolute -inset-2 bg-fuchsia-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-lg font-semibold text-center mb-3">
                  2. Trace The Identity
                </h3>
                <p className="text-sm text-slate-400 text-center leading-relaxed">
                  iqpipe assigns a unique ID to every prospect. When they
                  reply or book a meeting, the ID updates the state.
                </p>
              </motion.div>

              {/* Step 3 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="relative group"
              >
                <div className="w-16 h-16 mx-auto bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 relative z-10 shadow-xl group-hover:border-sky-500/50 group-hover:scale-110 transition-all duration-300">
                  <BarChart3 className="text-sky-400" size={28} />
                  <div className="absolute -inset-2 bg-sky-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-lg font-semibold text-center mb-3">
                  3. Revenue Truth
                </h3>
                <p className="text-sm text-slate-400 text-center leading-relaxed">
                  See exactly which campaign, script, or data source generated
                  the revenue, visualized in real-time.
                </p>
              </motion.div>
            </div>
            <section className="py-24 bg-slate-950">
              <div className="mx-auto max-w-6xl px-4 mb-12 text-center">
                <h2 className="text-3xl font-bold mb-4">The Journey of a Record</h2>
                <p className="text-slate-400">Watch how iqpipe standardizes chaos into a unified thread.</p>
              </div>
              
              <DataLifecycleVertical />
            </section>
            <div className="mt-20 p-8 rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/50 to-slate-950/50 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
              <h2 className="text-2xl font-semibold mb-4">
                Ready to verify your stack?
              </h2>
              <p className="text-slate-400 mb-6">
                Join the revenue leaders moving from "guessing" to "knowing."
              </p>
              <div className="flex items-center justify-center gap-4">
                <a
                  href="/contact"
                  className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
                >
                  Book Demo
                </a>
                <a
                  href="/signup"
                  className="bg-slate-50 text-slate-950 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  Get Started Free
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}