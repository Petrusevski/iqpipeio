import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../../config";
import { ArrowRight, CheckCircle2, Zap, Workflow, Copy, Check, Loader2 } from "lucide-react";
import PushConnectModal from "../components/PushConnectModal";

const SUPPORTED_TOOLS = [
  { name: "Clay",          domain: "clay.com",          category: "Prospecting"  },
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
  { name: "Lemlist",       domain: "lemlist.com",        category: "Cold Email"   },
  { name: "Instantly",     domain: "instantly.ai",       category: "Cold Email"   },
  { name: "Smartlead",     domain: "smartlead.ai",       category: "Cold Email"   },
  { name: "Mailshake",     domain: "mailshake.com",      category: "Cold Email"   },
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
  "Prospecting": "text-sky-400 bg-sky-500/10 border-sky-500/20",
  "Enrichment":  "text-violet-400 bg-violet-500/10 border-violet-500/20",
  "LinkedIn":    "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Cold Email":  "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  "Sequencer":   "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "CRM":         "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "Calling":     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "Revenue":     "text-green-400 bg-green-500/10 border-green-500/20",
};

function QuickConnectCard() {
  const [urls,    setUrls]    = useState<{ n8n: string; make: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/api/workspaces/webhook-url`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setUrls({ n8n: d.n8n, make: d.make }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-orange-400" />
            <h3 className="text-sm font-semibold text-slate-100">Quick Connect — no API key needed</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/20">2 min setup</span>
          </div>
          <p className="text-xs text-slate-400">
            Add one HTTP Request node at the end of any existing n8n or Make.com workflow. No credentials required — just paste the URL and you're live.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={12} className="animate-spin" /> Loading your webhook URLs…
        </div>
      ) : urls ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {/* n8n */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">n8n — HTTP Request node</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">
                {urls.n8n}
              </code>
              <button
                onClick={() => copy(urls.n8n, "n8n")}
                className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                {copied === "n8n" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Make.com */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Make.com — HTTP module</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">
                {urls.make}
              </code>
              <button
                onClick={() => copy(urls.make, "make")}
                className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                {copied === "make" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Sign in to see your webhook URLs.</p>
      )}

      {urls && (
        <p className="mt-3 text-[11px] text-slate-600">
          Need the payload reference?{" "}
          <NavLink to="/settings" className="text-orange-400 hover:text-orange-300 underline underline-offset-2">
            Open Settings → HTTP Push Node
          </NavLink>
        </p>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [activeFilter,  setActiveFilter]  = useState<string>("All");
  const [pushModal,     setPushModal]     = useState<"n8n" | "make" | null>(null);
  const categories = ["All", ...Array.from(new Set(SUPPORTED_TOOLS.map((t) => t.category)))];
  const filtered = activeFilter === "All" ? SUPPORTED_TOOLS : SUPPORTED_TOOLS.filter((t) => t.category === activeFilter);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      <PageHeader
        title="Integrations"
        subtitle="Connect your GTM stack via Make.com or n8n automations."
      />

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-12">

        {/* ── Quick Connect banner ── */}
        <QuickConnectCard />

        {/* ── Two platform cards ── */}
        <div className="grid md:grid-cols-2 gap-5">

          {/* Make.com */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-md shrink-0">
                <img
                  src={`${API_BASE_URL}/api/proxy/favicon?domain=make.com`}
                  width={22} height={22}
                  alt="Make.com"
                  className="object-contain"
                />
              </span>
              <div>
                <h2 className="text-base font-bold text-white">Make.com</h2>
                <p className="text-xs text-slate-500">Visual automation platform</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed flex-1">
              Build scenarios in Make.com that send events to iqpipe via HTTP webhook. Point any module's output at your iqpipe webhook URL to start tracking GTM events across every tool in your scenario.
            </p>
            <ul className="space-y-1.5 text-xs text-slate-400">
              {[
                "Drag-and-drop visual builder",
                "500+ app modules available",
                "Trigger on any tool event",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setPushModal("make")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20 transition-all"
              >
                <Zap size={12} /> Quick Setup
              </button>
              <NavLink
                to="/automation-health"
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                View health <ArrowRight size={12} />
              </NavLink>
            </div>
          </div>

          {/* n8n */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-md shrink-0">
                <img
                  src={`${API_BASE_URL}/api/proxy/favicon?domain=n8n.io`}
                  width={22} height={22}
                  alt="n8n"
                  className="object-contain"
                />
              </span>
              <div>
                <h2 className="text-base font-bold text-white">n8n</h2>
                <p className="text-xs text-slate-500">Code-friendly workflow automation</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed flex-1">
              Use n8n workflows to pipe events from any GTM tool into iqpipe. Add an HTTP Request node to any workflow and send structured event payloads to your iqpipe webhook — no custom code required.
            </p>
            <ul className="space-y-1.5 text-xs text-slate-400">
              {[
                "Self-hosted or n8n Cloud",
                "400+ native integrations",
                "Full JavaScript/Python execution",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setPushModal("n8n")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20 transition-all"
              >
                <Zap size={12} /> Quick Setup
              </button>
              <NavLink
                to="/automation-health"
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                View health <ArrowRight size={12} />
              </NavLink>
            </div>
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/20 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Zap size={14} className="text-indigo-400" />
            How it works
          </h3>
          <div className="grid sm:grid-cols-3 gap-4 text-sm text-slate-400">
            {[
              {
                step: "1",
                title: "Get your webhook URL",
                desc: "Copy your iqpipe workspace webhook URL from Settings → Connections.",
              },
              {
                step: "2",
                title: "Add an HTTP step to your automation",
                desc: "In Make.com or n8n, add an HTTP Request module and paste your webhook URL as the target.",
              },
              {
                step: "3",
                title: "Watch events flow in",
                desc: "Every run pushes structured events into iqpipe. See them in Live Feed, Contact Inspector, and Workflow Health.",
              },
            ].map((s) => (
              <div key={s.step} className="flex gap-3">
                <div className="h-6 w-6 rounded-full border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0 mt-0.5">
                  {s.step}
                </div>
                <div>
                  <div className="font-medium text-slate-200 mb-1">{s.title}</div>
                  <p className="text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Supported tools grid ── */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Workflow size={14} className="text-slate-500" />
              Supported tools ({SUPPORTED_TOOLS.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filtered.map((tool) => {
              const colorClass = CATEGORY_COLORS[tool.category] ?? "text-slate-400 bg-slate-800/50 border-slate-700";
              return (
                <div
                  key={tool.name}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900 transition-all"
                >
                  <span className="h-6 w-6 rounded bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    <img
                      src={`${API_BASE_URL}/api/proxy/favicon?domain=${tool.domain}`}
                      width={14} height={14}
                      alt={tool.name}
                      className="object-contain"
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{tool.name}</div>
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${colorClass} shrink-0 hidden sm:block`}>
                    {tool.category}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-600 text-center">
            Any tool reachable by Make.com or n8n can send events to iqpipe — this list covers common GTM tools.
          </p>
        </div>

      </div>

      {pushModal && (
        <PushConnectModal
          platform={pushModal}
          onClose={() => setPushModal(null)}
        />
      )}
    </div>
  );
}
