import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { XCircle, ArrowLeft, HelpCircle } from "lucide-react";

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-10 text-center shadow-2xl backdrop-blur"
      >
        <div className="flex items-center justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
            <XCircle size={32} className="text-slate-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Payment cancelled</h1>
        <p className="text-slate-400 text-sm mb-8">
          No charge was made. You can return to pricing and choose a plan whenever you're ready.
          Your trial data is still intact.
        </p>

        <div className="space-y-3">
          <Link
            to="/pricing"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Pricing
          </Link>
          <Link
            to="/feed"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
          >
            Continue with trial
          </Link>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-600">
          <HelpCircle size={12} />
          <span>Need help? Email <span className="text-slate-500">billing@iqpipe.io</span></span>
        </div>
      </motion.div>
    </div>
  );
}
