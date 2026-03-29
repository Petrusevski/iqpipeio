import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  ArrowRight,
  CheckCircle2,
  Lock,
  CreditCard,
  ShieldCheck,
  Zap,
  X,
  Loader2,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { API_BASE_URL } from "../../config";

const PRICING_TIERS = [
  {
    id: "starter",
    name: "Starter",
    description: "For solo GTM operators getting their first pipeline visibility.",
    monthlyPrice: 29,
    yearlyPrice: 23,
    toolLimit: "2 automations",
    features: [
      "1 Seat",
      "1 Workspace",
      "2 Make.com or n8n automations",
      "10,000 events / month",
      "Live Feed + Contact Inspector",
      "Pipeline Health monitoring",
      "Email support",
    ],
    notIncluded: [
      "Multiple workspaces",
      "Workflow Health scoring",
      "API access & webhooks",
    ],
    cta: "Start free — no card needed",
    popular: false,
    gradient: "from-slate-900 to-slate-950",
    border: "border-slate-800",
    checkColor: "text-indigo-400",
  },
  {
    id: "growth",
    name: "Growth",
    description: "For teams running multiple outbound motions who need full attribution.",
    monthlyPrice: 99,
    yearlyPrice: 79,
    toolLimit: "10 automations",
    features: [
      "3 Seats",
      "3 Workspaces",
      "10 Make.com or n8n automations",
      "500,000 events / month",
      "All features incl. Workflow Health",
      "GTM Report with PDF/XLSX export",
      "Chat + Email support",
    ],
    notIncluded: [
      "Unlimited workspaces & seats",
      "API access & webhooks",
    ],
    cta: "Start free — no card needed",
    popular: false,
    gradient: "from-slate-900 to-slate-950",
    border: "border-slate-800",
    checkColor: "text-indigo-400",
  },
  {
    id: "agency",
    name: "Agency",
    description: "For agencies and high-volume GTM engines running complex automation stacks.",
    monthlyPrice: 299,
    yearlyPrice: 239,
    toolLimit: "50 automations",
    features: [
      "Unlimited Seats",
      "20 Workspaces",
      "50 Make.com or n8n automations",
      "5,000,000 events / month",
      "All features + Workflow Health",
      "GTM Report with PDF/XLSX export",
      "API Access & Webhooks",
      "Priority 24/7 Support",
      "Additional workspaces available at surcharge",
    ],
    notIncluded: [],
    cta: "Start free — no card needed",
    popular: true,
    highlight: "Most Popular",
    gradient: "from-slate-900 to-slate-950",
    border: "border-slate-800",
    checkColor: "text-emerald-400",
  },
];

const FAQS = [
  {
    q: "Do I need a credit card to start?",
    a: "No. You get a full 14-day free trial on any plan with zero payment details required. On day 14, we'll ask you to add a card only if you want to continue. No gotchas.",
  },
  {
    q: "What happens on day 14?",
    a: "You'll get an email reminder on day 12. On day 14, we ask for a payment method to continue. If you choose not to upgrade, data ingestion pauses but your data stays exportable for another 30 days.",
  },
  {
    q: "How is payment processed securely?",
    a: "All payments are handled by Stripe, a PCI DSS Level 1 certified processor. iqpipe never stores card numbers on our servers — only a Stripe customer token. Payments use 3D Secure / SCA where required.",
  },
  {
    q: "What counts as an 'automation'?",
    a: "Each connected Make.com scenario or n8n workflow counts as one automation. Starter supports 2 automations; Growth supports 10; Agency supports 50. You can mix Make.com and n8n automations freely within your limit.",
  },
  {
    q: "Can I change plans mid-trial?",
    a: "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades take effect at the next billing cycle.",
  },
  {
    q: "Is historical data included?",
    a: "On the Scale plan, yes. We can backfill data if your connected tools support historical API exports.",
  },
];

const SECURITY_BADGES = [
  { icon: Lock, label: "TLS 1.3 in transit" },
  { icon: ShieldCheck, label: "AES-256 at rest" },
  { icon: CreditCard, label: "PCI DSS via Stripe" },
  { icon: Shield, label: "SOC2 Type II ready" },
];

async function startCheckout(planId: string, billing: "monthly" | "yearly") {
  const token = localStorage.getItem("iqpipe_token");
  if (!token) {
    // Not logged in — send to signup with plan pre-selected
    window.location.href = `/signup?plan=${planId}&billing=${billing}`;
    return;
  }

  const res = await fetch(`${API_BASE_URL}/api/checkout/session`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ planId, billing }),
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data?.error || "Could not start checkout. Please try again.");
    return;
  }

  if (data.url) {
    window.location.href = data.url; // redirect to Stripe-hosted checkout
  }
}

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(true);
  const [loading,  setLoading]  = useState<string | null>(null); // planId being processed

  async function handleCTA(planId: string) {
    setLoading(planId);
    try {
      await startCheckout(planId, isYearly ? "yearly" : "monthly");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans selection:bg-indigo-500/30">
      <Header />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="pt-20 pb-12 md:pt-32 md:pb-16 px-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-indigo-500/8 blur-[120px] rounded-full pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 mb-6 text-xs font-medium text-emerald-300"
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            No credit card required to start
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-4xl md:text-6xl font-bold mb-4 tracking-tight"
          >
            Simple pricing,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              massive ROI.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-400 max-w-xl mx-auto mb-3"
          >
            14-day free trial on every plan. Card only required on day 14 if you choose to continue.
          </motion.p>

          {/* Billing Toggle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-center gap-4 mt-8 mb-14"
          >
            <span className={`text-sm font-medium ${!isYearly ? "text-slate-50" : "text-slate-400"}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className="w-14 h-7 bg-slate-800 rounded-full relative p-1 transition-colors hover:bg-slate-700"
            >
              <motion.div
                animate={{ x: isYearly ? 28 : 0 }}
                className="w-5 h-5 bg-indigo-500 rounded-full shadow-lg"
              />
            </button>
            <span className={`text-sm font-medium flex items-center gap-2 ${isYearly ? "text-slate-50" : "text-slate-400"}`}>
              Yearly{" "}
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
                Save ~20%
              </span>
            </span>
          </motion.div>

          {/* Pricing Cards */}
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 px-2">
            {PRICING_TIERS.map((tier, index) => (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 + 0.2 }}
                className={`relative flex flex-col rounded-3xl border ${tier.border} bg-gradient-to-b ${tier.gradient} p-7 shadow-2xl backdrop-blur-sm text-left`}
              >

                {/* Tool limit badge */}
                <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4 bg-slate-800/60 border border-slate-700/50 rounded-full px-2.5 py-1 w-fit">
                  <Zap size={10} className="text-amber-400" />
                  {tier.toolLimit}
                </div>

                <h3 className="text-xl font-bold mb-1 text-white">{tier.name}</h3>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed min-h-[48px]">{tier.description}</p>

                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-slate-50">
                      ${isYearly ? tier.yearlyPrice : tier.monthlyPrice}
                    </span>
                    <span className="text-slate-400 mb-1.5 text-sm">/mo</span>
                  </div>
                  {isYearly ? (
                    <div className="text-xs text-slate-500 mt-1">
                      Billed ${(isYearly ? tier.yearlyPrice : tier.monthlyPrice) * 12}/yr
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 mt-1">Billed monthly</div>
                  )}
                </div>

                <button
                  onClick={() => handleCTA(tier.id)}
                  disabled={loading === tier.id}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 text-center flex items-center justify-center gap-2 mb-7 disabled:opacity-60 disabled:cursor-not-allowed ${
                    tier.popular
                      ? "bg-white text-slate-950 hover:bg-slate-100 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                  }`}
                >
                  {loading === tier.id
                    ? <><Loader2 size={14} className="animate-spin" /> Opening checkout…</>
                    : tier.cta
                  }
                </button>

                {/* Features */}
                <div className="space-y-3 flex-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Included</p>
                  {tier.features.map((feat) => (
                    <div key={feat} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 size={15} className={`${tier.checkColor} shrink-0 mt-0.5`} />
                      <span>{feat}</span>
                    </div>
                  ))}
                  {tier.notIncluded.length > 0 && (
                    <>
                      <div className="pt-2 border-t border-slate-800/60" />
                      {tier.notIncluded.map((feat) => (
                        <div key={feat} className="flex items-start gap-2.5 text-sm text-slate-600">
                          <X size={15} className="text-slate-700 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* No card callout */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-xs text-slate-500 flex items-center justify-center gap-2"
          >
            <Lock size={11} className="text-slate-600" />
            No credit card required to start. Card collected securely via Stripe on day 14 only if you continue.
          </motion.p>
        </section>

        {/* ── Payment Security Strip ── */}
        <section className="border-y border-slate-900 bg-slate-950/60 py-10 px-4">
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider mb-8">
              Payment security
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SECURITY_BADGES.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-800 bg-slate-900/40 text-center"
                >
                  <Icon size={20} className="text-indigo-400" />
                  <span className="text-xs text-slate-400 font-medium">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/30 p-6 flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-1">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  Secure checkout, powered by Stripe
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  iqpipe never stores your card number. When you enter payment details on day 14, they go directly to Stripe over TLS 1.3 — Stripe handles tokenization, PCI DSS Level 1 compliance, and 3D Secure authentication. We only receive a non-reversible customer token.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  Stripe Verified
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust logos ── */}
        <section className="py-16 bg-slate-950">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-8">
              Trusted by modern revenue teams
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 opacity-40">
              {["Acme Corp", "NorthStar", "LaunchPad", "Velocity"].map((name) => (
                <div
                  key={name}
                  className="text-sm font-bold text-slate-500 flex items-center justify-center h-10 border border-dashed border-slate-800 rounded-xl"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-20 max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-10 text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <h3 className="text-sm font-semibold text-slate-200 mb-2">{faq.q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-20 text-center border-t border-slate-900">
          <h2 className="text-2xl font-bold mb-3">Stop guessing where revenue comes from.</h2>
          <p className="text-slate-400 text-sm mb-8">14 days free. No card needed. Cancel anytime.</p>
          <a
            href="/signup"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-full font-semibold text-base hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20"
          >
            Start your free trial <ArrowRight size={18} />
          </a>
        </section>

      </main>
      <Footer />
    </div>
  );
}
