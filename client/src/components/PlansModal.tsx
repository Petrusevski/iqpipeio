import { useState } from "react";
import {
  X, Zap, CheckCircle2, Loader2, Lock, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import { API_BASE_URL } from "../../config";

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    yearlyPrice: 23,
    toolLimit: "2 automations",
    seats: "1 Seat",
    features: [
      "1 Seat",
      "1 Workspace",
      "2 Make.com or n8n automations",
      "10,000 events / month",
      "Live Feed + Contact Inspector",
      "Pipeline Health monitoring",
      "Email support",
    ],
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPrice: 99,
    yearlyPrice: 79,
    toolLimit: "10 automations",
    seats: "3 Seats",
    features: [
      "3 Seats",
      "3 Workspaces",
      "10 Make.com or n8n automations",
      "500,000 events / month",
      "All features incl. Workflow Health",
      "GTM Report (PDF/XLSX)",
      "Chat + Email support",
    ],
    popular: false,
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 299,
    yearlyPrice: 239,
    toolLimit: "50 automations",
    seats: "Unlimited",
    features: [
      "Unlimited Seats · 20 Workspaces",
      "50 Make.com or n8n automations",
      "5,000,000 events / month",
      "All features + Workflow Health",
      "GTM Report (PDF/XLSX)",
      "API Access & Webhooks",
      "Priority 24/7 Support",
    ],
    popular: true,
  },
];

export const PLAN_LABELS: Record<string, string> = {
  trial:   "Free Trial",
  free:    "Free",
  starter: "Starter",
  growth:  "Growth",
  agency:  "Agency",
  pro:     "Pro",
};

// ─── PlansModal ───────────────────────────────────────────────────────────────

interface PlansModalProps {
  currentPlan: string;
  onClose: () => void;
}

export default function PlansModal({ currentPlan, onClose }: PlansModalProps) {
  const [isYearly,    setIsYearly]    = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);

  const startCheckout = async (planId: string) => {
    setCheckoutErr(null);
    setLoadingPlan(planId);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res   = await fetch(`${API_BASE_URL}/api/checkout/session`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ planId, billing: isYearly ? "yearly" : "monthly" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || "Failed to start checkout."));
      window.location.href = data.url;
    } catch (err: any) {
      setCheckoutErr(err.message);
      setLoadingPlan(null);
    }
  };

  const isTrial = currentPlan === "trial" || currentPlan === "free";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">
              {isTrial ? "Choose a plan" : "Manage your plan"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isTrial
                ? "Activate immediately. Cancel any time."
                : `Current plan: ${PLAN_LABELS[currentPlan] ?? currentPlan}. Switch plans below.`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Billing toggle */}
            <div className="flex items-center gap-2 text-xs">
              <span className={!isYearly ? "text-slate-100" : "text-slate-500"}>Monthly</span>
              <button
                onClick={() => setIsYearly(!isYearly)}
                className="w-10 h-5 bg-slate-700 rounded-full relative p-0.5 transition-colors hover:bg-slate-600"
              >
                <motion.div
                  animate={{ x: isYearly ? 20 : 0 }}
                  className="w-4 h-4 bg-indigo-500 rounded-full shadow"
                />
              </button>
              <span className={isYearly ? "text-slate-100" : "text-slate-500"}>
                Yearly <span className="text-emerald-400 font-semibold">−20%</span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isDowngrade = !isCurrent && PLANS.findIndex(p => p.id === currentPlan) > PLANS.findIndex(p => p.id === plan.id);
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                  isCurrent
                    ? "border-indigo-500/60 bg-indigo-950/30 ring-1 ring-indigo-500/20"
                    : plan.popular
                    ? "border-indigo-500/30 bg-indigo-950/20"
                    : "border-slate-800 bg-slate-950/50"
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap shadow-lg shadow-indigo-500/30">
                    Current Plan
                  </div>
                )}
                {!isCurrent && plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-700 text-slate-200 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 bg-slate-800/60 border border-slate-700/50 rounded-full px-2.5 py-1 w-fit">
                  <Zap size={9} className="text-amber-400" />
                  {plan.toolLimit}
                </div>

                <div className="text-sm font-bold text-white mb-1">{plan.name}</div>

                <div className="flex items-end gap-1 mb-4">
                  <span className="text-3xl font-bold text-slate-50">${price}</span>
                  <span className="text-slate-400 text-xs mb-1">/mo</span>
                </div>

                <div className="space-y-2 mb-5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="w-full py-2 rounded-xl text-center text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30">
                    Active
                  </div>
                ) : (
                  <button
                    onClick={() => startCheckout(plan.id)}
                    disabled={loadingPlan !== null}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed ${
                      isDowngrade
                        ? "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600"
                        : plan.popular
                        ? "bg-white text-slate-950 hover:bg-slate-100 shadow-lg shadow-indigo-500/10"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    }`}
                  >
                    {loadingPlan === plan.id
                      ? <><Loader2 size={12} className="animate-spin" /> Redirecting…</>
                      : isDowngrade
                      ? `Downgrade to ${plan.name}`
                      : `Upgrade to ${plan.name}`
                    }
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {checkoutErr && (
          <div className="mx-6 mb-3 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle size={12} className="shrink-0" /> {checkoutErr}
          </div>
        )}

        <div className="px-6 pb-5 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <Lock size={11} />
          Payments processed securely via Stripe · PCI DSS Level 1
          <ShieldCheck size={11} className="text-emerald-500" />
        </div>
      </motion.div>
    </div>
  );
}
