import { useState } from "react";
import { Sparkles, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "../../config";

interface Props {
  onSeeded?: () => void;
}

export default function SeedBanner({ onSeeded }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "skipped" | "error">("idle");
  const [msg, setMsg] = useState("");

  const seed = async () => {
    setStatus("loading");
    try {
      const token = localStorage.getItem("iqpipe_token") ?? "";
      const r = await fetch(`${API_BASE_URL}/api/dev/seed?force=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.skipped) {
        setStatus("skipped");
        setMsg(d.message);
      } else if (d.seeded) {
        setStatus("done");
        setMsg(`Seeded ${d.iqLeads} contacts · ${d.touchpoints} events across ${d.integrations?.total ?? d.integrations?.tools?.length ?? "15"} tools.`);
        setTimeout(() => onSeeded?.(), 800);
      } else {
        setStatus("error");
        setMsg(d.error ?? "Unknown error");
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(e.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5 text-slate-600">
      <div className="h-14 w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
        <Sparkles size={22} className="text-indigo-500/60" />
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-slate-400">No data yet</p>
        <p className="text-xs mt-1 max-w-xs">
          Connect tools in Integrations to start capturing real events, or load demo data to explore the UI.
        </p>
      </div>

      {status === "idle" && (
        <button
          onClick={seed}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
        >
          <Sparkles size={14} />
          Load demo data
        </button>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-indigo-400">
          <RefreshCw size={14} className="animate-spin" />
          Seeding 43 contacts across 15 tools…
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={14} />
            Done! Reloading…
          </div>
          <p className="text-[11px] text-slate-600">{msg}</p>
        </div>
      )}

      {status === "skipped" && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertTriangle size={14} />
            Already seeded
          </div>
          <p className="text-[11px] text-slate-600 max-w-xs text-center">{msg}</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-rose-400">
            <AlertTriangle size={14} />
            Seed failed
          </div>
          <p className="text-[11px] text-slate-600">{msg}</p>
          <button onClick={() => setStatus("idle")} className="text-xs text-indigo-400 hover:underline">Try again</button>
        </div>
      )}
    </div>
  );
}
