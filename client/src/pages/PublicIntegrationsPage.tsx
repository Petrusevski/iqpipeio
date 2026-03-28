import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Fingerprint,
  CheckCircle2,
  Zap,
  ChevronRight,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";

const MAKE_COLOR = "#6d28d9";
const N8N_COLOR  = "#ea580c";

// ── Supported tools (reachable via Make.com / n8n) ────────────────────────────
const TOOLS = [
  { name: "Clay",          domain: "clay.com",           category: "Prospecting"  },
  { name: "Apollo",        domain: "apollo.io",          category: "Prospecting"  },
  { name: "PhantomBuster", domain: "phantombuster.com",  category: "Prospecting"  },
  { name: "Clearbit",      domain: "clearbit.com",       category: "Enrichment"   },
  { name: "ZoomInfo",      domain: "zoominfo.com",       category: "Enrichment"   },
  { name: "PDL",           domain: "peopledatalabs.com", category: "Enrichment"   },
  { name: "Lusha",         domain: "lusha.com",          category: "Enrichment"   },
  { name: "Hunter",        domain: "hunter.io",          category: "Enrichment"   },
  { name: "HeyReach",      domain: "heyreach.io",        category: "LinkedIn"     },
  { name: "Expandi",       domain: "expandi.io",         category: "LinkedIn"     },
  { name: "Dripify",       domain: "dripify.io",         category: "LinkedIn"     },
  { name: "Waalaxy",       domain: "waalaxy.com",        category: "LinkedIn"     },
  { name: "Lemlist",       domain: "lemlist.com",        category: "Email"        },
  { name: "Instantly",     domain: "instantly.ai",       category: "Email"        },
  { name: "Smartlead",     domain: "smartlead.ai",       category: "Email"        },
  { name: "Mailshake",     domain: "mailshake.com",      category: "Email"        },
  { name: "Outreach",      domain: "outreach.io",        category: "Sequencer"    },
  { name: "Salesloft",     domain: "salesloft.com",      category: "Sequencer"    },
  { name: "Reply.io",      domain: "reply.io",           category: "Sequencer"    },
  { name: "HubSpot",       domain: "hubspot.com",        category: "CRM"          },
  { name: "Pipedrive",     domain: "pipedrive.com",      category: "CRM"          },
  { name: "Salesforce",    domain: "salesforce.com",     category: "CRM"          },
  { name: "Aircall",       domain: "aircall.io",         category: "Calling"      },
  { name: "Kixie",         domain: "kixie.com",          category: "Calling"      },
  { name: "Stripe",        domain: "stripe.com",         category: "Revenue"      },
  { name: "Chargebee",     domain: "chargebee.com",      category: "Revenue"      },
];

const CATEGORY_COLORS: Record<string, string> = {
  Prospecting: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  Enrichment:  "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  LinkedIn:    "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Email:       "text-sky-400 bg-sky-500/10 border-sky-500/20",
  Sequencer:   "text-orange-400 bg-orange-500/10 border-orange-500/20",
  CRM:         "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Calling:     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Revenue:     "text-green-400 bg-green-500/10 border-green-500/20",
};

function ToolLogo({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) return (
    <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">{name[0]}</div>
  );
  return (
    <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
      <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={name} width={16} height={16} className="object-contain" onError={() => setErr(true)} />
    </div>
  );
}

// ── Animated flow connector ───────────────────────────────────────────────────
function FlowConnector({ color }: { color: string }) {
  return (
    <div className="relative flex items-center justify-center w-16 shrink-0">
      <div className="h-px w-full bg-slate-800" />
      {[0, 0.6, 1.2].map((delay) => (
        <motion.div
          key={delay}
          className="absolute w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ left: "0%", opacity: 0 }}
          animate={{ left: ["0%", "100%"], opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
      <ChevronRight size={12} className="absolute right-0 text-slate-700" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PublicIntegrationsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const categories = ["All", ...Array.from(new Set(TOOLS.map((t) => t.category)))];
  const filtered = activeFilter === "All" ? TOOLS : TOOLS.filter((t) => t.category === activeFilter);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative border-b border-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[280px] bg-indigo-500/8 blur-[100px] pointer-events-none" />

          <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-20 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-medium text-indigo-300 mb-7">
                <Zap size={11} className="fill-current" /> Connect via Make.com or n8n
              </div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-5">
                Connect your GTM stack<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-amber-400">
                  through your automations.
                </span>
              </h1>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
                iqpipe doesn't connect to your tools directly. You use Make.com or n8n — which already run your GTM workflows — to send events to iqpipe via a single HTTP step. Every tool reachable by your automation platform can flow data into iqpipe.
              </p>

              {/* Visual flow diagram */}
              <div className="flex items-center justify-center gap-0 flex-wrap md:flex-nowrap mb-10">

                {/* Make.com */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-violet-500/30 bg-violet-500/5 w-48"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-violet-500/10">
                    <img src="https://www.google.com/s2/favicons?domain=make.com&sz=64" alt="Make.com" width={32} height={32} className="object-contain" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">Make.com</div>
                    <div className="text-[10px] text-violet-400 mt-0.5">OAuth connect · workflows imported</div>
                  </div>
                </motion.div>

                <FlowConnector color={MAKE_COLOR} />

                {/* iqpipe hub */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 }}
                  className="relative flex flex-col items-center gap-3 p-6 rounded-2xl border border-indigo-500/40 bg-indigo-500/8 w-52 z-10 shadow-[0_0_60px_-15px_rgba(99,102,241,0.3)]"
                >
                  <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-indigo-500/50">
                    <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-indigo-200">iqpipe</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">event layer · universal schema</div>
                  </div>
                  <motion.div
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center"
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <span className="text-[7px] font-bold text-white">●</span>
                  </motion.div>
                </motion.div>

                <FlowConnector color={N8N_COLOR} />

                {/* n8n */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-orange-500/30 bg-orange-500/5 w-48"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-orange-500/10">
                    <img src="https://www.google.com/s2/favicons?domain=n8n.io&sz=64" alt="n8n" width={32} height={32} className="object-contain" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">n8n</div>
                    <div className="text-[10px] text-orange-400 mt-0.5">OAuth connect · workflows imported</div>
                  </div>
                </motion.div>

              </div>

              <div className="flex items-center justify-center gap-4 flex-wrap">
                <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-7 py-3 rounded-full font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                  Connect your automations <ArrowRight size={15} />
                </a>
                <a href="/gtm-stack" className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 px-6 py-3 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all">
                  See how it works
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── How connection works ── */}
        <section className="border-b border-slate-900 py-16 px-4 bg-slate-950/60">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-3">Connect your account. Pick your events.</h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">iqpipe reads your existing Make.com or n8n workflows and lets you configure event recording per app node — no changes to your automation required.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  step: "1",
                  color: "indigo",
                  title: "OAuth-connect your platform",
                  body: "Connect your Make.com or n8n account in iqpipe Settings. iqpipe immediately fetches all your existing workflows — no manual steps, no copying URLs.",
                  code: "Settings → Connections\n→ Connect Make.com or n8n\n→ Workflows imported automatically",
                },
                {
                  step: "2",
                  color: "fuchsia",
                  title: "See your workflow as a visual flow",
                  body: "iqpipe displays your automation as a node graph. Each app in the flow is a clickable node. Click any node to see the events that app offers and select which to record.",
                  code: "Clay → Clearbit → HeyReach\n  → HubSpot → Stripe\n[click node → pick events]",
                },
                {
                  step: "3",
                  color: "emerald",
                  title: "Analytics appear automatically",
                  body: "As your automation runs, only selected events flow into iqpipe. Live Feed, Contact Inspector, Pipeline Health, and GTM Report populate automatically.",
                  code: "iq_4f2a9c · 8 events · 5 steps\nClay → HeyReach → Stripe $18,400",
                },
              ].map((card) => (
                <motion.div
                  key={card.step}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col gap-3"
                >
                  <div className={`text-xs font-bold text-${card.color}-400 flex items-center gap-2`}>
                    <span className={`w-6 h-6 rounded-full bg-${card.color}-500/10 border border-${card.color}-500/20 flex items-center justify-center text-[11px]`}>{card.step}</span>
                    Step {card.step}
                  </div>
                  <h3 className="text-sm font-bold text-white">{card.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed flex-1">{card.body}</p>
                  <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-lg whitespace-pre leading-relaxed overflow-x-auto">
                    {card.code}
                  </pre>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform deep-dives ── */}
        <section className="border-b border-slate-900 py-16 px-4">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-3">Supported automation platforms</h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">Both platforms work exactly the same way — add one HTTP Request step to your workflow and point it at your iqpipe webhook.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">

              {/* Make.com */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-7 flex flex-col gap-5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-md shrink-0">
                    <img src="https://www.google.com/s2/favicons?domain=make.com&sz=64" alt="Make.com" width={26} height={26} className="object-contain" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Make.com</h3>
                    <p className="text-xs text-violet-400">Visual scenario builder · 500+ app modules</p>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  OAuth-connect your Make.com account and iqpipe imports your scenarios automatically. Your flows are shown as visual node graphs — click any module to see its available events and choose which ones iqpipe should record. No changes to your scenarios required.
                </p>
                <div className="space-y-2 text-xs">
                  {["OAuth connect — no manual setup", "Workflows imported and visualised automatically", "Click any module node to configure event recording"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-slate-300">
                      <CheckCircle2 size={13} className="text-violet-400 shrink-0" />{f}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-slate-950/60 p-4 space-y-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">What iqpipe shows after connecting</div>
                  {["Clay scenario imported · 4 events available", "HeyReach module · 3 events available", "HubSpot module · 4 events available"].map((line) => (
                    <div key={line} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <CheckCircle2 size={11} className="text-violet-400 shrink-0" />{line}
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* n8n */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-7 flex flex-col gap-5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-md shrink-0">
                    <img src="https://www.google.com/s2/favicons?domain=n8n.io&sz=64" alt="n8n" width={26} height={26} className="object-contain" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">n8n</h3>
                    <p className="text-xs text-orange-400">Code-friendly workflows · self-hosted or cloud</p>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  OAuth-connect your n8n account and iqpipe pulls in your existing workflows. Each workflow is displayed as a visual graph of nodes. Click any app node — Clay, HeyReach, HubSpot — to see the events it emits and select which ones to record. Works on n8n Cloud and self-hosted.
                </p>
                <div className="space-y-2 text-xs">
                  {["Works on n8n Cloud, self-hosted, and desktop", "Workflows imported and visualised automatically", "Click any node to configure event recording per app"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-slate-300">
                      <CheckCircle2 size={13} className="text-orange-400 shrink-0" />{f}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-orange-500/20 bg-slate-950/60 p-4 space-y-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">What iqpipe shows after connecting</div>
                  {["Enrichment workflow imported · 3 events available", "HeyReach node · 4 events available", "Stripe node · 3 events available"].map((line) => (
                    <div key={line} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <CheckCircle2 size={11} className="text-orange-400 shrink-0" />{line}
                    </div>
                  ))}
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* ── Supported tools grid ── */}
        <section className="py-16 px-4">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-white mb-2">Tools reachable via your automations</h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">Any tool in your Make.com or n8n workflow can send events to iqpipe. These are the most common GTM tools our customers track.</p>
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-7">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    activeFilter === cat
                      ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                      : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {filtered.map((tool) => {
                const colorClass = CATEGORY_COLORS[tool.category] ?? "text-slate-400 bg-slate-800/50 border-slate-700";
                return (
                  <motion.div
                    key={tool.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    layout
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900 transition-all"
                  >
                    <ToolLogo domain={tool.domain} name={tool.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{tool.name}</div>
                      <div className={`text-[9px] font-semibold mt-0.5 ${colorClass.split(" ")[0]}`}>{tool.category}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <p className="mt-5 text-xs text-slate-600 text-center">
              Any tool reachable by Make.com or n8n can send events to iqpipe — not just the tools listed here.
            </p>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-slate-900 py-20 px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="flex justify-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                <img src="https://www.google.com/s2/favicons?domain=make.com&sz=64" alt="Make" width={24} height={24} className="object-contain" />
              </div>
              <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                <img src="https://www.google.com/s2/favicons?domain=n8n.io&sz=64" alt="n8n" width={24} height={24} className="object-contain" />
              </div>
              <div className="h-12 w-12 rounded-2xl overflow-hidden ring-1 ring-indigo-500/40">
                <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Your automations are already running.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">Start recording what they do.</span>
            </h2>
            <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto leading-relaxed">
              Add one HTTP step to your first automation. Watch the first event appear in Live Feed. Full journey tracking and revenue attribution from that moment on.
            </p>
            <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-8 py-4 rounded-full font-bold hover:bg-slate-100 transition-all shadow-xl">
              Start free — no card needed <ArrowRight size={16} />
            </a>
          </motion.div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
