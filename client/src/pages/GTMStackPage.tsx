import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Database,
  Mail,
  Briefcase,
  CreditCard,
  ArrowRight,
  ChevronRight,
  Fingerprint,
  CheckCircle2,
  Zap,
  Eye,
  GitMerge,
  AlertTriangle,
  Workflow,
  Code2,
  Play,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { API_BASE_URL } from "../../config";

function PlatformLogo({ domain, name, size = 8 }: { domain: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const px = size * 4;
  if (err) return (
    <div style={{ width: px, height: px }} className="rounded-xl bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">{name[0]}</div>
  );
  return (
    <div style={{ width: px, height: px }} className="rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-md">
      <img src={`${API_BASE_URL}/api/proxy/favicon?domain=${domain}`} alt={name} width={px * 0.55} height={px * 0.55} className="object-contain" onError={() => setErr(true)} />
    </div>
  );
}

// ── Automation flow stages ──────────────────────────────────────────────────
const FLOW_STEPS = [
  {
    id: "source",
    step: "01",
    label: "Source",
    icon: Search,
    color: "violet",
    accent: "#8b5cf6",
    tagline: "Your automation pulls leads — iqpipe logs every import",
    description: "The first node in your Make.com scenario or n8n workflow fetches leads from Clay, Apollo, or a CSV upload. As each row is processed, a single HTTP Request step sends a `lead_imported` event to iqpipe — minting a Universal ID for that contact before any outreach begins.",
    events: ["lead_imported", "prospect_created", "list_uploaded", "row_scraped"],
    exampleStep: "HTTP Request → POST iqpipe webhook",
    examplePayload: `{
  "event": "lead_imported",
  "source": "clay",
  "email": "alex@k1e7d4.com",
  "properties": { "company": "Acme Corp" }
}`,
    insight: "iqpipe mints a Universal ID at first import. Every downstream event from enrichment, outreach, CRM, and billing is automatically linked to that same identity — no manual tagging.",
  },
  {
    id: "enrich",
    step: "02",
    label: "Enrich",
    icon: Database,
    color: "fuchsia",
    accent: "#d946ef",
    tagline: "Data appended in your automation — iqpipe tracks freshness",
    description: "Your automation calls Clearbit, PDL, or Hunter to append emails, phone numbers, and firmographics. Add one HTTP step after the enrichment module to push a `record_enriched` event to iqpipe — so staleness is tracked per contact, per source, automatically.",
    events: ["record_enriched", "email_verified", "phone_appended", "company_matched"],
    exampleStep: "Clearbit module → HTTP Request → POST iqpipe webhook",
    examplePayload: `{
  "event": "record_enriched",
  "source": "clearbit",
  "email": "alex@k1e7d4.com",
  "properties": { "title": "VP Growth" }
}`,
    insight: "Pipeline Health surfaces enrichment staleness alerts when a contact hasn't been re-enriched in 90+ days — before you reach out with bad data.",
  },
  {
    id: "activate",
    step: "03",
    label: "Outreach",
    icon: Mail,
    color: "sky",
    accent: "#0ea5e9",
    tagline: "Sequences fire in your automation — iqpipe captures every signal",
    description: "Your automation triggers HeyReach, Instantly, or Lemlist to start a sequence. Log a `sequence_started` event to iqpipe when the sequence begins, then route reply and meeting webhooks from those tools through your automation to iqpipe — giving you a complete outreach timeline per contact.",
    events: ["sequence_started", "email_sent", "connection_sent", "reply_received", "meeting_booked"],
    exampleStep: "HeyReach module → HTTP Request → POST iqpipe webhook",
    examplePayload: `{
  "event": "sequence_started",
  "source": "heyreach",
  "email": "alex@k1e7d4.com",
  "properties": { "campaign": "Q2-LinkedIn" }
}`,
    insight: "iqpipe detects when two automation paths are running outreach on the same contact simultaneously and raises an overlap alarm in Pipeline Health.",
  },
  {
    id: "qualify",
    step: "04",
    label: "CRM",
    icon: Briefcase,
    color: "emerald",
    accent: "#10b981",
    tagline: "Deal events from your automation — iqpipe stitches the journey",
    description: "Your automation creates or updates deals in HubSpot, Pipedrive, or Salesforce. Route a `deal_created` or `stage_changed` event to iqpipe alongside the CRM call — linking every stage change back to the sourcing import, enrichment data, and outreach sequence that generated the opportunity.",
    events: ["deal_created", "stage_changed", "deal_won", "deal_lost"],
    exampleStep: "HubSpot module → HTTP Request → POST iqpipe webhook",
    examplePayload: `{
  "event": "deal_created",
  "source": "hubspot",
  "email": "alex@k1e7d4.com",
  "properties": { "deal_value": 18400 }
}`,
    insight: "Every deal is automatically attributed to the full upstream automation — which Clay table, which outreach sequence, which enrichment provider. Attribution without UTMs or spreadsheets.",
  },
  {
    id: "close",
    step: "05",
    label: "Revenue",
    icon: CreditCard,
    color: "amber",
    accent: "#f59e0b",
    tagline: "Payment events close the loop — iqpipe traces every dollar",
    description: "Route Stripe or Chargebee payment events through your automation to iqpipe. A `payment_succeeded` event with the contact email is all it takes — iqpipe traces that revenue all the way back through CRM stage changes, outreach sequences, enrichment, and sourcing in a single chain.",
    events: ["payment_succeeded", "subscription_created", "invoice_paid", "mrr_updated"],
    exampleStep: "Stripe webhook → n8n trigger → POST iqpipe webhook",
    examplePayload: `{
  "event": "payment_succeeded",
  "source": "stripe",
  "email": "alex@k1e7d4.com",
  "properties": { "amount": 18400, "currency": "usd" }
}`,
    insight: "The GTM Report attributes every closed payment to the exact automation motion that earned it — Clay + HeyReach drove $84K, Apollo + email drove $31K.",
  },
];

const COLOR_CLASSES: Record<string, { text: string; bg: string; border: string; pill: string }> = {
  violet:  { text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  pill: "bg-violet-500/10 border-violet-500/20 text-violet-300"  },
  fuchsia: { text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", pill: "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-300" },
  sky:     { text: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30",     pill: "bg-sky-500/10 border-sky-500/20 text-sky-300"             },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", pill: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" },
  amber:   { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   pill: "bg-amber-500/10 border-amber-500/20 text-amber-300"       },
};

function AnimatedDot({ color, delay }: { color: string; delay: number }) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full shadow-lg"
      style={{ backgroundColor: color, left: "50%", translateX: "-50%", top: 0 }}
      animate={{ top: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.4, delay, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
    />
  );
}

export default function GTMStackPage() {
  const [active, setActive] = useState(0);

  const step = FLOW_STEPS[active];
  const c = COLOR_CLASSES[step.color];
  const Icon = step.icon;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative border-b border-slate-900 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[250px] bg-indigo-500/8 blur-[100px] pointer-events-none" />
          <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-20 text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-5">
                Your automations run the workflow.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-amber-400">
                  iqpipe records everything.
                </span>
              </h1>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
                Connect your Make.com scenarios or n8n workflows to iqpipe. As each automation step runs — sourcing, enriching, outreaching, closing — events flow into iqpipe and build a complete, attributed picture of your GTM motion in real time.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
                <a href="/signup" className="inline-flex items-center gap-2 bg-white text-slate-950 px-6 py-3 rounded-full font-bold text-sm hover:bg-slate-100 transition-all shadow-lg">
                  Connect your automations <ArrowRight size={15} />
                </a>
                <a href="/claude-gtm" className="inline-flex items-center gap-2 border border-slate-700 text-slate-300 px-6 py-3 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all">
                  View automation health
                </a>
              </div>
              {/* Platform badges */}
              <div className="flex items-center justify-center gap-6">
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60">
                  <PlatformLogo domain="make.com" name="Make" size={5} />
                  <span className="text-sm font-semibold text-slate-200">Make.com</span>
                </div>
                <div className="text-slate-700 text-lg font-thin">+</div>
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60">
                  <PlatformLogo domain="n8n.io" name="n8n" size={5} />
                  <span className="text-sm font-semibold text-slate-200">n8n</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Architecture explainer ── */}
        <section className="border-b border-slate-900 py-16 px-4 bg-slate-950/60">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-xl font-bold text-white mb-2">How iqpipe fits into your automation</h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">Connect your Make.com or n8n account. iqpipe reads your workflows, shows them visually, and lets you pick which events to record per app node.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 items-center">
              {/* Left: automation platforms */}
              <div className="space-y-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4 text-center md:text-left">Your automation platform</div>
                {[
                  { platform: "Make.com", domain: "make.com", step: "OAuth connect → workflows imported" },
                  { platform: "n8n",      domain: "n8n.io",   step: "OAuth connect → workflows imported" },
                ].map((p) => (
                  <motion.div
                    key={p.platform}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="flex items-center gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/50"
                  >
                    <PlatformLogo domain={p.domain} name={p.platform} size={6} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-300">{p.platform}</div>
                      <div className="text-[10px] text-slate-500">{p.step}</div>
                    </div>
                    <ArrowRight size={12} className="text-indigo-400 shrink-0" />
                  </motion.div>
                ))}
                <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-800 text-center justify-center">
                  <span className="text-[10px] text-slate-600">Workflows read automatically — no manual steps</span>
                </div>
              </div>

              {/* Center: iqpipe */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center gap-4"
              >
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden ring-2 ring-indigo-500/40">
                    <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
                  </div>
                  <motion.div
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Play size={8} className="text-white ml-0.5" />
                  </motion.div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-indigo-300">iqpipe</div>
                  <div className="text-[11px] text-slate-500">event layer · universal schema</div>
                </div>
                <div className="space-y-1.5 text-center">
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider">receives events from automations</div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider">normalizes to one schema</div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider">resolves identity across tools</div>
                </div>
              </motion.div>

              {/* Right: outputs */}
              <div className="space-y-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4 text-center md:text-left">What you get in return</div>
                {[
                  { icon: Zap,           label: "Live Feed",         desc: "Every event as it fires" },
                  { icon: GitMerge,      label: "Contact Inspector",  desc: "Full journey per contact" },
                  { icon: AlertTriangle, label: "Pipeline Health",    desc: "Automation health & overlap alarms" },
                  { icon: CheckCircle2,  label: "GTM Report",         desc: "Revenue attributed per automation" },
                ].map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: 12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50"
                    >
                      <ItemIcon size={14} className="text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-300">{item.label}</div>
                        <div className="text-[10px] text-slate-500">{item.desc}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── Setup steps ── */}
        <section className="border-b border-slate-900 py-16 px-4">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-white mb-3">Three steps to connect your automations</h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">No code. No changes to your workflows. iqpipe reads your flows and lets you configure event recording per app node.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: "1",
                  color: "indigo",
                  icon: null,
                  title: "Connect your Make.com or n8n account",
                  body: "OAuth-connect your automation platform in iqpipe Settings. iqpipe immediately fetches all your existing workflows — no copying, no manual steps.",
                  code: "Settings → Connections\n→ Connect Make.com or n8n\n→ Workflows imported automatically",
                },
                {
                  step: "2",
                  color: "fuchsia",
                  icon: Workflow,
                  title: "iqpipe visualises your workflow",
                  body: "Your automation is shown as a visual node graph — one node per app. Click any app node to see the events it offers and select which ones iqpipe should record.",
                  code: "Clay → Clearbit → HeyReach\n  → HubSpot → Stripe\n[click node → pick events]",
                },
                {
                  step: "3",
                  color: "emerald",
                  icon: Eye,
                  title: "Analytics appear automatically",
                  body: "As your automation runs, only the events you selected flow into iqpipe. Live Feed, Contact Inspector, Pipeline Health, and GTM Report all populate automatically.",
                  code: "iq_4f2a9c → 8 events across 5 steps\nSource: Clay → Close: Stripe $18,400",
                },
              ].map((card) => {
                const CardIcon = card.icon;
                return (
                  <motion.div
                    key={card.step}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col gap-4"
                  >
                    <div className={`flex items-center gap-2 text-xs font-bold text-${card.color}-400`}>
                      <span className={`w-6 h-6 rounded-full bg-${card.color}-500/10 border border-${card.color}-500/20 flex items-center justify-center text-[11px]`}>{card.step}</span>
                      Step {card.step}
                    </div>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-${card.color}-500/10 border border-${card.color}-500/20`}>
                      {card.icon
                        ? <CardIcon size={16} className={`text-${card.color}-400`} />
                        : <img src="/logo.png" alt="iqpipe" className="h-6 w-6 object-contain" />
                      }
                    </div>
                    <h3 className="text-sm font-bold text-white">{card.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed flex-1">{card.body}</p>
                    <code className="block text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg whitespace-pre leading-relaxed">
                      {card.code}
                    </code>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Interactive flow steps ── */}
        <section className="py-20 px-4">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">What to track at each stage of your automation</h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto">Select a stage to see which event to send, the exact payload format, and what iqpipe surfaces from those signals.</p>
            </div>

            {/* Step selector */}
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {FLOW_STEPS.map((s, i) => {
                const sc = COLOR_CLASSES[s.color];
                const SIcon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(i)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
                      active === i
                        ? `${sc.bg} ${sc.border} ${sc.text}`
                        : "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-[10px] font-mono opacity-60">{s.step}</span>
                    <SIcon size={13} />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Step detail panel */}
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="grid lg:grid-cols-[1fr_360px] gap-8"
              >
                {/* Left: detail */}
                <div className={`rounded-2xl border ${c.border} ${c.bg} p-8 flex flex-col gap-6`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${c.border} ${c.bg}`}>
                      <Icon size={18} className={c.text} />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Stage {step.step}</div>
                      <div className="text-lg font-bold text-white">{step.label}</div>
                    </div>
                  </div>

                  <p className="text-slate-300 text-sm leading-relaxed">{step.description}</p>

                  {/* Events to track */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Events to send at this stage</div>
                    <div className="flex flex-wrap gap-2">
                      {step.events.map((ev) => (
                        <code key={ev} className={`text-[11px] px-2 py-1 rounded-lg border font-mono ${c.pill}`}>{ev}</code>
                      ))}
                    </div>
                  </div>

                  {/* Payload example */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Code2 size={12} className="text-slate-500" />
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Example payload — {step.exampleStep}</div>
                    </div>
                    <pre className={`text-[11px] font-mono leading-relaxed p-4 rounded-xl border ${c.border} bg-slate-950/60 text-slate-300 overflow-x-auto`}>
                      {step.examplePayload}
                    </pre>
                  </div>

                  {/* iqpipe insight */}
                  <div className={`flex gap-3 p-4 rounded-xl border ${c.border} ${c.bg}`}>
                    <Zap size={15} className={`${c.text} shrink-0 mt-0.5`} />
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">What iqpipe surfaces from these events</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{step.insight}</p>
                    </div>
                  </div>
                </div>

                {/* Right: pipeline overview */}
                <div className="space-y-3">
                  {FLOW_STEPS.map((s, i) => {
                    const sc = COLOR_CLASSES[s.color];
                    const SIcon = s.icon;
                    const isActive = i === active;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActive(i)}
                        className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${
                          isActive ? `${sc.border} ${sc.bg}` : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex flex-col items-center self-stretch shrink-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${isActive ? `${sc.border} ${sc.bg}` : "border-slate-800 bg-slate-900"}`}>
                            <SIcon size={14} className={isActive ? sc.text : "text-slate-600"} />
                          </div>
                          {i < FLOW_STEPS.length - 1 && (
                            <div className="relative w-px flex-1 bg-slate-800 mt-2 overflow-hidden" style={{ minHeight: 16 }}>
                              {isActive && <AnimatedDot color={s.accent} delay={0} />}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono text-slate-600">{s.step}</span>
                            <span className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-400"}`}>{s.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.tagline}</p>
                          {isActive && (
                            <div className="mt-2">
                              <code className={`text-[9px] font-mono px-2 py-0.5 rounded border ${sc.pill}`}>{s.events[0]}</code>
                            </div>
                          )}
                        </div>
                        {isActive && <ChevronRight size={14} className={sc.text} />}
                      </button>
                    );
                  })}

                  {/* iqpipe hub */}
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 mt-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-indigo-500/40 shrink-0">
                      <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-indigo-300">iqpipe — across every stage</div>
                      <div className="text-[10px] text-slate-500">One Universal ID. One neutral schema. Full picture.</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* ── Benefits grid ── */}
        <section className="border-t border-slate-900 py-16 px-4 bg-slate-950/60">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold text-white text-center mb-3">What you unlock when your automations are connected</h2>
            <p className="text-slate-400 text-sm text-center max-w-lg mx-auto mb-10">No dashboards to build. No tracking code to write. These surface automatically as events flow in.</p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  icon: Zap,
                  color: "indigo",
                  title: "Real-time event stream",
                  body: "Every event your automations fire appears in Live Feed the moment it's received. See exactly which step ran, which contact it touched, and which automation triggered it.",
                },
                {
                  icon: GitMerge,
                  color: "fuchsia",
                  title: "One identity across all your automations",
                  body: "iqpipe resolves contact identity across every automation path. A contact sourced in Make.com, enriched in n8n, and closed in HubSpot is tracked as one person — one Universal ID from import to revenue.",
                },
                {
                  icon: AlertTriangle,
                  color: "amber",
                  title: "Automation health monitoring",
                  body: "iqpipe learns what event volume to expect from each automation. When a scenario or workflow stops firing events during normal run times, Pipeline Health surfaces a silence alarm — before you lose pipeline.",
                },
                {
                  icon: CheckCircle2,
                  color: "emerald",
                  title: "Source-to-close attribution",
                  body: "Every closed deal traces back to the exact automation sequence that generated it. GTM Report shows which combination of automation steps produced revenue — and what to double down on.",
                },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-4 bg-${item.color}-500/10 border border-${item.color}-500/20`}>
                      <ItemIcon size={15} className={`text-${item.color}-400`} />
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
          <div className="mx-auto max-w-3xl text-center">
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="flex justify-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=make.com`} width={22} height={22} alt="Make" className="object-contain" />
                  </div>
                  <div className="text-slate-700 text-xl">+</div>
                  <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=n8n.io`} width={22} height={22} alt="n8n" className="object-contain" />
                  </div>
                  <div className="text-slate-700 text-xl">→</div>
                  <div className="h-12 w-12 rounded-2xl overflow-hidden ring-1 ring-indigo-500/40">
                    <img src="/logo.png" alt="iqpipe" className="h-full w-full object-contain" />
                  </div>
                </div>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Your automations are already running.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">Start recording what they do.</span>
              </h2>
              <p className="text-slate-400 text-base mb-8 max-w-xl mx-auto leading-relaxed">
                Add one HTTP step to your first Make.com or n8n automation. Watch the first event appear in Live Feed. Full journey tracking from that moment on.
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
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
