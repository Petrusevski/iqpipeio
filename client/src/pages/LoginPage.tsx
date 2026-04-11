import { FormEvent, useState } from "react";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { API_BASE_URL } from "../../config";

const API_BASE = API_BASE_URL;

// ─── Static MCP Visual ────────────────────────────────────────────────────────

function MCPVisual() {
  return (
    <div className="w-full rounded-2xl border border-slate-700/60 bg-slate-900/80 overflow-hidden shadow-2xl">
      {/* Mock browser chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-800 bg-slate-950/60">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        <div className="flex-1 mx-3 px-3 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40 text-[10px] text-slate-500 font-mono">
          claude.ai
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span className="text-[10px] text-indigo-400 font-medium">iqpipe MCP</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </div>
      </div>

      {/* Chat area */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-indigo-600/80 text-xs text-white leading-snug">
            Why did this deal stall after the first reply?
          </div>
        </div>

        {/* Tool call badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/60 text-[10px] text-slate-400 font-mono">
            <span className="text-violet-400">▶</span> iqpipe
            <span className="text-slate-600">·</span>
            <span className="text-amber-400/80">get_lead_journey</span>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400">done</span>
          </div>
        </div>

        {/* Claude reply */}
        <div className="flex items-start gap-2">
          <div className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L12 22M2 12L22 12M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="flex-1 text-[11px] text-slate-300 leading-relaxed">
            The contact replied on day 3 but no follow-up was triggered — the sequence step has a 0-event gap for 11 days. Apollo shows the task as complete, but iqpipe has no matching outbound event after that point.
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/40">
          <span className="flex-1 text-[11px] text-slate-600">Ask Claude about your GTM pipeline…</span>
          <div className="h-5 w-5 rounded-lg bg-orange-500/80 flex items-center justify-center">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── What's New bullets ───────────────────────────────────────────────────────

const WHATS_NEW = [
  { label: "Ask Claude anything about your pipeline", sub: "Real-time GTM context, no tab switching" },
  { label: "Works on Claude.ai and Claude Desktop", sub: "One MCP URL, connected in under 60 seconds" },
  { label: "Your workflows, automatically recognized", sub: "Import from n8n or Make.com — Claude sees them all" },
];

// ─── Component ────────────────────────────────────────────────────────────────

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
    if (!email || !password) { setError("Please provide both email and password."); return; }
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Login failed."); return; }
      localStorage.setItem("iqpipe_token", data.token);
      localStorage.setItem("iqpipe_user", JSON.stringify(data.user));
      if (onLoginSuccess) { onLoginSuccess(data); } else { window.location.href = "/"; }
    } catch (err: any) {
      setError(err?.message || "Unexpected error during login.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-50 selection:bg-indigo-500/30 selection:text-indigo-200">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative items-center justify-center overflow-hidden border-r border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute top-[-80px] left-[-80px] h-[360px] w-[360px] rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-[380px] px-10 py-12 flex flex-col gap-8">

          {/* Header */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-xs text-violet-300 font-semibold mb-4 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              What's new
            </div>
            <h2 className="text-2xl font-bold tracking-tight leading-snug text-white mb-2">
              Claude now speaks<br />your GTM stack.
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Connect iqpipe to Claude via MCP and ask anything about your pipeline — live data, no hallucinations.
            </p>
          </div>

          {/* Static Claude simulator */}
          <MCPVisual />

          {/* Bullet list */}
          <ul className="space-y-3">
            {WHATS_NEW.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4.5 7.5L8 3" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">{item.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.sub}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <a
            href="/mcp-protocol"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors w-fit"
          >
            Learn how MCP works →
          </a>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 relative">
        <a href="/" className="absolute top-8 left-8 flex items-center gap-2 text-sm text-slate-500 hover:text-white transition-colors group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </a>

        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <img src="/logo.png" alt="iqpipe" className="h-16 w-16 object-contain mx-auto mb-4 drop-shadow-lg" />
            <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
            <p className="text-sm text-slate-400 mt-2">Enter your credentials to access your workspace.</p>
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
                  onChange={e => setEmail(e.target.value)}
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
                  onChange={e => setPassword(e.target.value)}
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
