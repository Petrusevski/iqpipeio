/**
 * MCPProtocolPage — /mcp-protocol
 *
 * Value-focused page explaining how iqpipe gives Claude live GTM intelligence.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Terminal, Copy, Check,
  ArrowRight, BookOpen, Zap,
  Lock, Shield, Network, Play,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { API_BASE_URL } from "../../config";

// ─── Sidebar nav ─────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "overview",     label: "Overview",      icon: BookOpen  },
  { id: "how-it-works", label: "How it Works",  icon: Network   },
  { id: "quickstart",   label: "Quick Start",   icon: Terminal  },
  { id: "security",     label: "Security",      icon: Shield    },
];

// ─── Copy hook ───────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }
  return { copied, copy };
}

// ─── Code block ──────────────────────────────────────────────────────────────

function CodeBlock({ code, language = "json", copyKey, onCopy, isCopied }:
  { code: string; language?: string; copyKey: string; onCopy: (t: string, k: string) => void; isCopied: boolean }) {
  return (
    <div className="relative rounded-xl border border-slate-700/60 bg-slate-900/80 overflow-hidden">
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

// ─── Flow diagram ─────────────────────────────────────────────────────────────

function FlowDiagram() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8">
      {/* Step 1 */}
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 w-44 text-center">
        <div className="text-2xl">⚡</div>
        <div className="text-xs font-semibold text-white">Your Workflows</div>
        <div className="text-[11px] text-slate-500 leading-snug">n8n or Make.com automations</div>
      </div>

      {/* Arrow */}
      <motion.div
        animate={{ x: [0, 4, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="text-indigo-500 text-xl hidden sm:block"
      >
        →
      </motion.div>
      <div className="text-indigo-500 text-xl sm:hidden">↓</div>

      {/* Step 2 */}
      <motion.div
        animate={{ boxShadow: ["0 0 16px #6366f120", "0 0 32px #6366f140", "0 0 16px #6366f120"] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="flex flex-col items-center gap-2 rounded-2xl border-2 border-indigo-500/50 bg-indigo-950/60 p-5 w-44 text-center"
      >
        <div className="text-2xl">⬡</div>
        <div className="text-xs font-bold text-indigo-300">iqpipe</div>
        <div className="flex items-center gap-1 mt-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-emerald-400">live GTM intelligence</span>
        </div>
      </motion.div>

      {/* Arrow */}
      <motion.div
        animate={{ x: [0, 4, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        className="text-indigo-500 text-xl hidden sm:block"
      >
        →
      </motion.div>
      <div className="text-indigo-500 text-xl sm:hidden">↓</div>

      {/* Step 3 */}
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 w-44 text-center">
        <div className="w-9 h-9 rounded-xl bg-[#D97706]/10 border border-[#D97706]/30 flex items-center justify-center overflow-hidden">
          <img
            src={`${API_BASE_URL}/api/proxy/favicon?domain=claude.ai`}
            alt="Claude"
            width={20}
            height={20}
            className="object-contain"
          />
        </div>
        <div className="text-xs font-semibold text-white">Claude</div>
        <div className="text-[11px] text-slate-500 leading-snug">makes informed decisions</div>
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MCPProtocolPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const { copied, copy } = useCopy();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => { window.scrollTo(0, 0); }, []);

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

  const CLAUDE_DESKTOP_JSON = `{
  "mcpServers": {
    "iqpipe": {
      "url": "https://api.iqpipe.io/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#070c18] border-b border-slate-800/60 py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-fuchsia-600/10 blur-[100px]" />
        </div>
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
            Give Claude real-time{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
              GTM intelligence
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Import your n8n or Make.com workflows. iqpipe recognizes every GTM tool they
            touch and makes that live data available to Claude &mdash; so it can make informed
            decisions instead of guesses.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-500/20">
              Connect Claude free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#quickstart" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 hover:border-slate-400 bg-slate-800/60 hover:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors">
              <Terminal className="w-4 h-4" />
              Quick Start
            </a>
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

          <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-950/40 p-4">
            <p className="text-xs text-indigo-300 font-medium mb-2">Get your API key</p>
            <p className="text-[11px] text-slate-500 mb-3 leading-snug">Available on all plans. Create your key in Settings.</p>
            <Link to="/signup" className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
              Get started free <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-20">

          {/* ── Overview ──────────────────────────────────────────────────────── */}
          <section id="overview" ref={sectionRef("overview")}>
            <SectionHeading icon={BookOpen} title="Overview" />
            <p className="text-slate-400 leading-relaxed mb-6">
              Claude is a powerful GTM co-pilot &mdash; but it operates without real-time data.
              It cannot see whether a lead is safe to contact, which sequence is converting,
              or whether a webhook actually delivered. Every decision it makes without data is a guess.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8">
              iqpipe fixes that. Connect Claude to iqpipe and it gains live access to your
              GTM stack &mdash; unified from every tool your n8n or Make.com workflows already use.
              Claude stops flying blind and starts making decisions from facts.
            </p>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Zap,
                  title: "All your tools, automatically",
                  desc: "Import a workflow and iqpipe recognizes every GTM tool it connects to. No manual integration list to configure.",
                },
                {
                  icon: Lock,
                  title: "Live data, not memory",
                  desc: "Every query Claude makes returns your actual current data — not a cached snapshot, not a hallucinated answer.",
                },
                {
                  icon: Shield,
                  title: "Five GTM blind spots solved",
                  desc: "Contact safety, sequence selection, delivery confirmation, anomaly detection, and improvement synthesis.",
                },
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
              Connect iqpipe once. Every GTM tool your automations already use becomes
              queryable by Claude &mdash; no separate integrations, no API keys per tool.
            </p>

            {/* Flow diagram */}
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 mb-10 overflow-x-auto">
              <FlowDiagram />
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {[
                {
                  n: "01",
                  title: "Import your workflows",
                  desc: "Connect your n8n or Make.com account. iqpipe reads the workflow structure and recognizes every GTM tool it touches — outreach platforms, CRMs, enrichment tools, billing systems.",
                },
                {
                  n: "02",
                  title: "Claude queries iqpipe",
                  desc: "When Claude runs a GTM task, it calls iqpipe to get the data it needs — lead status, best sequence, delivery confirmation, anomalies, performance reports.",
                },
                {
                  n: "03",
                  title: "Claude acts on facts",
                  desc: "With real data, Claude gates unsafe contacts before they go out, picks the sequence with the highest conversion rate for the ICP, confirms webhooks delivered, and surfaces exactly what to fix.",
                },
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

            {/* What Claude can do */}
            <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">What Claude can do with iqpipe</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "Contact safety gate",     desc: "Check whether leads are safe to contact before outreach runs" },
                  { label: "Sequence selection",      desc: "Pick the sequence with the best conversion rate for a given ICP" },
                  { label: "Delivery confirmation",   desc: "Verify that webhooks and events actually reached downstream tools" },
                  { label: "Anomaly detection",       desc: "Surface silent pipelines, over-touched leads, and stale enrichment" },
                  { label: "Improvement synthesis",   desc: "Rank what to fix and generate workflow-specific recommendations" },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-white mb-0.5">{label}</div>
                      <div className="text-[11px] text-slate-500 leading-snug">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Quick Start ───────────────────────────────────────────────────── */}
          <section id="quickstart" ref={sectionRef("quickstart")}>
            <SectionHeading icon={Terminal} title="Quick Start" />
            <p className="text-slate-400 leading-relaxed mb-8">
              Get Claude connected in under 5 minutes. Generate your API key from{" "}
              <Link to="/settings" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Settings</Link>{" "}
              and choose your connection path.
            </p>

            <div className="space-y-6">

              {/* ── Featured: Claude.ai ───────────────────────────────────────── */}
              <div className="relative rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-950/60 to-slate-900/80 p-6 overflow-hidden">
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl" />

                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 px-3 py-1 text-xs font-semibold text-indigo-300">
                    Easiest &mdash; no config files
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" /> Live
                  </span>
                </div>

                <div className="flex items-start gap-4 mb-5">
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
                    <h3 className="text-base font-bold text-white mb-1">{"Connect via Claude.ai"}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {"Claude.ai's native integrations let you add iqpipe directly inside the Claude interface — no terminal, no config files. Your entire GTM data layer becomes available to Claude in under 60 seconds."}
                    </p>
                  </div>
                </div>

                <ol className="space-y-2.5 mb-5">
                  {[
                    { n: "1", text: <><strong className="text-slate-300">{"Claude.ai"}</strong>{" → Settings → "}<strong className="text-slate-300">Integrations</strong></> },
                    { n: "2", text: <>{"Click "}<strong className="text-slate-300">Add integration</strong>{" and paste the iqpipe MCP URL"}</> },
                    { n: "3", text: <>{"Enter your iqpipe API key when prompted"}</> },
                    { n: "4", text: <>{"Hit "}<strong className="text-slate-300">Connect</strong>{" — iqpipe tools appear in Claude instantly"}</> },
                  ].map(({ n, text }) => (
                    <li key={n} className="flex items-start gap-3 text-sm text-slate-400">
                      <span className="flex-none w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[11px] font-bold text-indigo-300 mt-0.5">{n}</span>
                      <span className="leading-snug">{text}</span>
                    </li>
                  ))}
                </ol>

                <div className="rounded-lg border border-indigo-500/20 bg-slate-900/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-indigo-500/10 bg-indigo-950/30">
                    <span className="text-[11px] font-mono text-slate-500">iqpipe MCP Server URL</span>
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
              </div>

              {/* ── Option B: Claude Desktop ──────────────────────────────── */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=claude.ai`} alt="Claude" width={14} height={14} className="object-contain" />
                  </div>
                  Claude Desktop
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  {"Add to your Claude Desktop config file. Paste your API key where shown."}
                </p>
                <CodeBlock code={CLAUDE_DESKTOP_JSON} language="json" copyKey="claude-desktop-json" onCopy={copy} isCopied={copied === "claude-desktop-json"} />
              </div>

            </div>
          </section>

          {/* ── Security ──────────────────────────────────────────────────────── */}
          <section id="security" ref={sectionRef("security")}>
            <SectionHeading icon={Shield} title="Security" />
            <p className="text-slate-400 leading-relaxed mb-8">
              Claude never receives your integration credentials or raw contact data &mdash; only
              the normalized, scoped output of what it asks for.
            </p>

            <div className="grid sm:grid-cols-2 gap-5 mb-8">
              {[
                {
                  icon: Lock,
                  title: "API keys, not credentials",
                  desc: "Claude authenticates with an iqpipe API key. Your HubSpot, n8n, or outreach tool credentials are never exposed to Claude or stored outside your workspace.",
                },
                {
                  icon: Shield,
                  title: "Scoped access",
                  desc: "Each key grants access to specific capabilities only. A key for outreach intelligence cannot access billing data unless you explicitly allow it.",
                },
                {
                  icon: Zap,
                  title: "Audit log",
                  desc: "Every query Claude makes is logged with timestamp, tool name, and key ID. Exportable from Settings at any time.",
                },
                {
                  icon: Lock,
                  title: "GDPR compliant",
                  desc: "Erasing a contact removes them from all Claude-accessible data immediately. Right to erasure is enforced at the intelligence layer.",
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

          {/* ── CTA ─────────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 to-slate-900/60 p-10 text-center">
            <div className="text-3xl font-bold text-white mb-3">{"Ready to connect Claude?"}</div>
            <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm leading-relaxed">
              Sign up, grab your API key, and wire iqpipe into Claude in minutes.
              Available on all plans including free trial.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-colors shadow-lg shadow-indigo-500/20">
                Connect Claude free <ArrowRight className="w-4 h-4" />
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
