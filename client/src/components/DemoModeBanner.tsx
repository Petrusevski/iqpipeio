import { useNavigate } from "react-router-dom";
import { FlaskConical, ArrowRight } from "lucide-react";

/**
 * Sticky banner shown at the top of pages when the workspace is in demo mode.
 * Informs the user that the data is read-only and nudges them to connect real automations.
 */
export default function DemoModeBanner() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs shrink-0">
      <div className="flex items-center gap-2 text-amber-400 min-w-0">
        <FlaskConical size={12} className="shrink-0" />
        <span className="font-semibold">Demo mode</span>
        <span className="text-amber-500/70 hidden sm:inline">
          — this workspace contains sample data. Editing, deleting, and connecting automations are disabled.
        </span>
      </div>
      <button
        onClick={() => navigate("/my-workflow")}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold whitespace-nowrap transition-colors shrink-0"
      >
        Connect real automations
        <ArrowRight size={10} />
      </button>
    </div>
  );
}
