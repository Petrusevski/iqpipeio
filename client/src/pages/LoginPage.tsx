import { FormEvent, useState } from "react";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { API_BASE_URL } from "../../config";

const API_BASE = API_BASE_URL;

interface LoginPageProps {
  onLoginSuccess?: (payload: { token: string; user: { id: string; email: string; fullName: string } }) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Login failed.");
        return;
      }

      localStorage.setItem("iqpipe_token", data.token);
      localStorage.setItem("iqpipe_user", JSON.stringify(data.user));

      if (onLoginSuccess) {
        onLoginSuccess(data);
      } else {
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err?.message || "Unexpected error during login.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-50 selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Left: Visual Side (Hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative items-center justify-center overflow-hidden border-r border-slate-800">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        <div className="relative z-10 max-w-md px-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300 font-medium mb-6">
              <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Revenue Intelligence
            </div>
            <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
              Stop guessing where your revenue comes from.
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              "iqpipe finally gave us a single source of truth. We cut our tool spend by 30% in the first month."
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.4 }}
            className="flex items-center gap-4 mt-8"
          >
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600" />
            <div>
              <div className="text-sm font-semibold text-white">A**** R.</div>
              <div className="text-xs text-slate-500">Head of Growth @ Acme Corp</div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right: Form Side */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 relative">
        
        {/* Back Link */}
        <a href="/" className="absolute top-8 left-8 flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </a>

        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <img src="/logo.png" alt="iqpipe" className="h-16 w-16 object-contain mx-auto mb-4 drop-shadow-lg" />
            <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
            <p className="text-sm text-slate-400 mt-2">
              Enter your credentials to access your workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="email"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-medium text-slate-300">Password</label>
                <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300">Forgot password?</a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="password"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200 text-center"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 flex justify-center items-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : "Sign in"}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-slate-500">
            Don't have an account?{" "}
            <a href="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline">
              Create an account
            </a>
          </div>
        </div>
        
        <div className="absolute bottom-6 text-[10px] text-slate-600">
          © 2025 iqpipe Inc. Privacy & Terms
        </div>
      </div>
    </div>
  );
}