import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "../../config";

export default function CheckoutSuccessPage() {
  const [params]  = useSearchParams();
  const sessionId = params.get("session_id");

  const [status, setStatus] = useState<"loading" | "confirmed" | "error">("loading");
  const [plan,   setPlan]   = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    // Poll the backend to confirm the session and get the plan name.
    // The webhook may process slightly after the redirect, so we retry briefly.
    let attempts = 0;
    const maxAttempts = 8;

    async function poll() {
      attempts++;
      try {
        const token = localStorage.getItem("iqpipe_token");
        const res   = await fetch(
          `${API_BASE_URL}/api/checkout/confirm?session_id=${encodeURIComponent(sessionId!)}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : {}
        );
        const data = await res.json();

        if (res.ok && data.confirmed) {
          setPlan(data.plan ?? null);
          setStatus("confirmed");

          // Refresh cached workspace plan in localStorage if present
          const userRaw = localStorage.getItem("iqpipe_user");
          if (userRaw) {
            try {
              const user = JSON.parse(userRaw);
              localStorage.setItem("iqpipe_user", JSON.stringify({ ...user, plan: data.plan }));
            } catch { /* ignore */ }
          }
          return;
        }
      } catch { /* network error — keep retrying */ }

      if (attempts < maxAttempts) {
        setTimeout(poll, 1500);
      } else {
        // Webhook may be slightly delayed — still show success, just without plan name
        setStatus("confirmed");
      }
    }

    poll();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {status === "loading" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-4"
          >
            <Loader2 size={40} className="text-indigo-400 animate-spin mx-auto" />
            <p className="text-slate-300 text-sm">Confirming your payment…</p>
          </motion.div>
        )}

        {status === "confirmed" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0.3 }}
            className="rounded-3xl border border-emerald-500/20 bg-slate-900/80 p-10 text-center shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-center mb-6">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">You're all set!</h1>

            {plan && (
              <p className="text-slate-400 text-sm mb-1">
                <span className="text-emerald-400 font-semibold capitalize">{plan}</span> plan activated.
              </p>
            )}

            <p className="text-slate-500 text-xs mb-8">
              A receipt has been sent to your billing email by Stripe. You can view invoices any time in Settings → Billing.
            </p>

            <div className="space-y-3">
              <Link
                to="/feed"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
              >
                Open iqpipe
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/settings"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
              >
                Go to Settings
              </Link>
            </div>

            <p className="mt-6 text-[11px] text-slate-600">
              Questions? Email <span className="text-slate-500">billing@iqpipe.io</span>
            </p>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-rose-500/20 bg-slate-900/80 p-10 text-center"
          >
            <AlertCircle size={36} className="text-rose-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-6">
              We couldn't confirm your session. If payment was charged, it will appear in Settings → Billing within a few minutes.
            </p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
            >
              Back to Pricing
            </Link>
          </motion.div>
        )}

      </div>
    </div>
  );
}
