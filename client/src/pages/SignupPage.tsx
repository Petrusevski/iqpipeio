import { FormEvent, useState } from "react";
import { ArrowLeft, Lock, Mail, User, CheckCircle2, Zap, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { API_BASE_URL } from "../../config";
const API_BASE = API_BASE_URL;

interface SignupPageProps {
  onSignupSuccess?: (payload: { token: string; user: { id: string; email: string; fullName: string } }) => void;
}

// ── Plan definitions ────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    period: "/mo",
    tagline: "Solo operators and early teams",
    toolLimit: "2 automations",
    features: ["1 Seat · 1 Workspace", "2 Make.com or n8n automations", "10,000 events / month", "Live Feed + Contact Inspector"],
    border: "border-slate-700",
    activeBorder: "border-indigo-500",
    activeBg: "bg-indigo-500/5",
    checkColor: "text-indigo-400",
    badge: null,
  },
  {
    id: "growth",
    name: "Growth",
    price: "$99",
    period: "/mo",
    tagline: "Teams running multiple outbound motions",
    toolLimit: "10 automations",
    features: ["3 Seats · 3 Workspaces", "10 Make.com or n8n automations", "500,000 events / month", "All features + GTM Report"],
    border: "border-slate-700",
    activeBorder: "border-indigo-500",
    activeBg: "bg-indigo-500/5",
    checkColor: "text-indigo-400",
    badge: null,
  },
  {
    id: "agency",
    name: "Agency",
    price: "$299",
    period: "/mo",
    tagline: "Agencies and high-volume GTM engines",
    toolLimit: "50 automations",
    features: ["Unlimited Seats · 20 Workspaces", "50 Make.com or n8n automations", "5,000,000 events / month", "API Access & Webhooks"],
    border: "border-slate-700",
    activeBorder: "border-indigo-500",
    activeBg: "bg-indigo-500/5",
    checkColor: "text-emerald-400",
    badge: "Most Popular",
  },
];

// ── Helper: read ?plan= from URL ────────────────────────────────────────────

function getInitialPlan(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("plan");
    if (p && PLANS.find((pl) => pl.id === p)) return p;
  } catch {
    // ignore
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SignupPage({ onSignupSuccess }: SignupPageProps) {
  const [step, setStep] = useState<1 | 2>(getInitialPlan() ? 2 : 1);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(getInitialPlan());

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = PLANS.find((p) => p.id === selectedPlan);

  // Step 1 → Step 2
  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    setStep(2);
    setError(null);
  };

  // Step 2 submit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (!selectedPlan) {
      setError("No plan selected. Please go back and choose a plan.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password, plan: selectedPlan }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Signup failed.");
        return;
      }

      localStorage.setItem("iqpipe_token", data.token);
      localStorage.setItem("iqpipe_user", JSON.stringify(data.user));

      if (onSignupSuccess) {
        onSignupSuccess(data);
      } else {
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err?.message || "Unexpected error during signup.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-50 selection:bg-indigo-500/30 selection:text-indigo-200">

      {/* Top nav */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur shrink-0">
        <a href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors group">
          <ArrowLeft size={15} className="group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </a>
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`flex items-center gap-1.5 font-medium ${step === 1 ? "text-slate-200" : "text-emerald-400"}`}>
            {step > 1 ? <CheckCircle2 size={13} /> : <span className="h-4 w-4 rounded-full border border-current flex items-center justify-center text-[10px]">1</span>}
            Choose plan
          </span>
          <ChevronRight size={13} className="text-slate-700" />
          <span className={`flex items-center gap-1.5 font-medium ${step === 2 ? "text-slate-200" : "text-slate-600"}`}>
            <span className="h-4 w-4 rounded-full border border-current flex items-center justify-center text-[10px]">2</span>
            Create account
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Have an account?{" "}
          <a href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</a>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">

        <AnimatePresence mode="wait">

          {/* ── STEP 1: Plan selection ── */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-4xl"
            >
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 mb-5 text-xs font-medium text-emerald-300">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  14-day free trial · No credit card required
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Choose your plan</h1>
                <p className="text-slate-400 text-sm">Card only required on day 14 if you choose to continue.</p>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlan(p.id)}
                    className={`relative text-left p-6 rounded-2xl border transition-all duration-200 focus:outline-none group
                      ${selectedPlan === p.id
                        ? `${p.activeBorder} ${p.activeBg} ring-1 ring-indigo-500/40`
                        : `${p.border} bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/60`
                      }`}
                  >

                    {/* Tool limit pill */}
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4 bg-slate-800/70 border border-slate-700/50 rounded-full px-2 py-0.5">
                      <Zap size={9} className="text-amber-400" />
                      {p.toolLimit}
                    </div>

                    <div className="flex items-end gap-1 mb-1">
                      <span className="text-3xl font-bold text-white">{p.price}</span>
                      <span className="text-slate-400 text-sm mb-1">{p.period}</span>
                    </div>
                    <div className="text-sm font-semibold text-white mb-1">{p.name}</div>
                    <div className="text-xs text-slate-500 mb-5 leading-snug">{p.tagline}</div>

                    <ul className="space-y-2">
                      {p.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-xs text-slate-400">
                          <CheckCircle2 size={13} className={`${p.checkColor} shrink-0 mt-0.5`} />
                          {feat}
                        </li>
                      ))}
                    </ul>

                    <div className={`mt-5 w-full rounded-xl py-2.5 text-center text-xs font-bold transition-all
                      ${p.id === "scale"
                        ? "bg-white text-slate-950 group-hover:bg-slate-100"
                        : "bg-slate-800 text-white border border-slate-700 group-hover:bg-slate-700"
                      }`}
                    >
                      Select {p.name} →
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-center text-[11px] text-slate-600 mt-6">
                All plans start with a 14-day free trial. Yearly billing saves ~20%.{" "}
                <a href="/pricing" className="text-indigo-500 hover:text-indigo-400 underline">See full comparison</a>
              </p>
            </motion.div>
          )}

          {/* ── STEP 2: Account details ── */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm"
            >
              {/* Selected plan pill */}
              {plan && (
                <div className="flex items-center justify-between mb-6 p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-indigo-400" />
                    <span className="text-sm font-semibold text-white">{plan.name}</span>
                    <span className="text-xs text-slate-400">{plan.price}{plan.period}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStep(1); setError(null); }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline"
                  >
                    Change
                  </button>
                </div>
              )}

              <div className="mb-7 text-center">
                <img src="/logo.png" alt="iqpipe" className="h-16 w-16 object-contain mx-auto mb-3 drop-shadow-lg" />
                <h2 className="text-2xl font-bold text-white tracking-tight">Create your account</h2>
                <p className="text-xs text-slate-400 mt-1.5">
                  14-day free trial · No credit card required
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input
                      type="text"
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 ml-1">Work Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input
                      type="email"
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input
                      type="password"
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200 text-center"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-1 flex justify-center items-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating account...
                    </span>
                  ) : "Start free trial"}
                </button>
              </form>

              <p className="mt-5 text-center text-[10px] text-slate-600 leading-relaxed">
                By continuing you agree to our{" "}
                <a href="/terms" className="text-slate-500 hover:text-slate-300 underline">Terms</a>
                {" & "}
                <a href="/privacy" className="text-slate-500 hover:text-slate-300 underline">Privacy Policy</a>.
                No card needed until day 30.
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
