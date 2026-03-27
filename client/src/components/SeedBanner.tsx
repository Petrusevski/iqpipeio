import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, RefreshCw, CheckCircle2, AlertTriangle,
  Zap, ArrowRight, Bot, Layers,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

interface Props {
  onSeeded?: () => void;
}

export default function SeedBanner({ onSeeded }: Props) {
  const navigate = useNavigate();
  const [seedStatus, setSeedStatus] = useState<"idle" | "loading" | "done" | "skipped" | "error">("idle");
  const [seedMsg,    setSeedMsg]    = useState("");
  const [showDemo,   setShowDemo]   = useState(false);

  const seed = async () => {
    setSeedStatus("loading");
    try {
      const token = localStorage.getItem("iqpipe_token") ?? "";
      const r = await fetch(`${API_BASE_URL}/api/dev/seed?force=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.skipped) {
        setSeedStatus("skipped");
        setSeedMsg(d.message);
      } else if (d.seeded) {
        setSeedStatus("done");
        setSeedMsg(`Seeded ${d.iqLeads} contacts · ${d.touchpoints} events across ${d.integrations?.total ?? d.integrations?.tools?.length ?? "15"} tools.`);
        setTimeout(() => onSeeded?.(), 800);
      } else {
        setSeedStatus("error");
        setSeedMsg(d.error ?? "Unknown error");
      }
    } catch (e: any) {
      setSeedStatus("error");
      setSeedMsg(e.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-0">

      {/* Main CTA */}
      <div className="w-full max-w-lg">

        {/* Hero icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Zap size={28} className="text-indigo-400" />
          </div>
        </div>

        <h2 className="text-center text-lg font-bold text-slate-100 mb-2">
          Connect your first automation
        </h2>
        <p className="text-center text-sm text-slate-500 mb-8 max-w-sm mx-auto">
          Link your n8n or Make.com workflows to start tracking GTM events, contacts, and pipeline activity in real time.
        </p>

        {/* Connect buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => navigate("/my-workflow")}
            className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-orange-500/40 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                <Bot size={15} className="text-orange-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">n8n</p>
                <p className="text-[10px] text-slate-500">Connect workflows</p>
              </div>
            </div>
            <ArrowRight size={13} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
          </button>

          <button
            onClick={() => navigate("/my-workflow")}
            className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-purple-500/40 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <Layers size={15} className="text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">Make.com</p>
                <p className="text-[10px] text-slate-500">Connect scenarios</p>
              </div>
            </div>
            <ArrowRight size={13} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
          </button>
        </div>

        {/* Full-width go to setup */}
        <button
          onClick={() => navigate("/my-workflow")}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          <Zap size={14} />
          Set up automations
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 w-full max-w-lg my-7">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-[11px] text-slate-700 font-medium uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Demo data — secondary */}
      <div className="w-full max-w-lg">
        {!showDemo ? (
          <button
            onClick={() => setShowDemo(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-500 hover:text-slate-300 text-sm transition-all"
          >
            <Sparkles size={13} />
            Explore with demo data first
          </button>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 mb-3">
              Load 43 sample contacts across 15 tools to explore the UI — no real data required.
            </p>

            {seedStatus === "idle" && (
              <button
                onClick={seed}
                className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold text-slate-200 transition-colors"
              >
                <Sparkles size={13} className="text-indigo-400" />
                Load demo data
              </button>
            )}

            {seedStatus === "loading" && (
              <div className="flex items-center justify-center gap-2 text-sm text-indigo-400">
                <RefreshCw size={13} className="animate-spin" />
                Seeding 43 contacts across 15 tools…
              </div>
            )}

            {seedStatus === "done" && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 size={13} /> Done! Reloading…
                </div>
                <p className="text-[11px] text-slate-600">{seedMsg}</p>
              </div>
            )}

            {seedStatus === "skipped" && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <AlertTriangle size={13} /> Already seeded
                </div>
                <p className="text-[11px] text-slate-600 max-w-xs">{seedMsg}</p>
              </div>
            )}

            {seedStatus === "error" && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-2 text-sm text-rose-400">
                  <AlertTriangle size={13} /> Seed failed
                </div>
                <p className="text-[11px] text-slate-600">{seedMsg}</p>
                <button onClick={() => setSeedStatus("idle")} className="text-xs text-indigo-400 hover:underline mt-1">
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
