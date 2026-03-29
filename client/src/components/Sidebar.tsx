import { useState, useEffect, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Zap,
  Search,
  Settings,
  HeartPulse,
  GitBranch,
  Workflow,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../../config";
import PlansModal, { PLAN_LABELS } from "./PlansModal";
import SectionIntroModal from "./SectionIntroModal";
import {
  GUIDE_STEPS,
  getCompletedSteps,
  markStepDone,
  getNextStep,
} from "./OnboardingGuide";


const navGroups = [
  {
    title: "Observe",
    items: [
      { label: "Live Feed",         path: "/feed",             icon: Zap      },
      { label: "Contact Inspector", path: "/inspect",          icon: Search   },
    ],
  },
  {
    title: "Analyze",
    items: [
      { label: "Workflow Compare",  path: "/compare",          icon: BarChart3 },
    ],
  },
  {
    title: "Health",
    items: [
      { label: "Workflow Health",   path: "/workflow-health",  icon: HeartPulse },
      { label: "My Workflow",       path: "/my-workflow",      icon: GitBranch  },
    ],
  },
  {
    title: "Setup",
    items: [
      { label: "Settings",          path: "/settings",         icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceId,   setWorkspaceId]   = useState<string | null>(null);
  const [currentPlan,  setCurrentPlan]   = useState<string>("trial");
  const [showPlans,    setShowPlans]     = useState(false);

  // Guide state — starts empty; loaded once workspaceId is known
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [activeIntro, setActiveIntro]       = useState<string | null>(null);

  const nextStep = workspaceId ? getNextStep(completedSteps) : null;

  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.name) setWorkspaceName(d.name);
        if (d?.plan) setCurrentPlan(d.plan);
        if (d?.id)   setWorkspaceId(d.id);
      })
      .catch(() => {});
  }, []);

  // Load guide state once we know which workspace this user belongs to
  useEffect(() => {
    if (!workspaceId) return;
    setCompletedSteps(getCompletedSteps(workspaceId));
  }, [workspaceId]);

  const handleNavClick = useCallback((path: string) => {
    const step = GUIDE_STEPS.find(s => s.path === path);
    if (step && nextStep?.path === path) {
      // Small delay so navigation completes before modal renders
      setTimeout(() => setActiveIntro(step.key), 120);
    }
  }, [nextStep]);

  const handleIntroDone = useCallback((key: string) => {
    if (!workspaceId) return;
    const updated = markStepDone(key, workspaceId);
    setCompletedSteps(new Set(updated));
    setActiveIntro(null);
  }, [workspaceId]);

  const isPulsing = (path: string) => nextStep?.path === path;

  const displayName = workspaceName ?? "My Workspace";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const introStep = GUIDE_STEPS.find(s => s.key === activeIntro) ?? null;

  return (
    <>
      <aside className="w-full md:w-56 h-full flex flex-col bg-slate-950">

        {/* BRAND */}
        <div className="h-16 flex items-center px-5 border-b border-slate-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="iqpipe" className="h-8 w-8 rounded-lg object-contain" />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white leading-none">iqpipe</span>
              <span className="text-[10px] font-medium text-indigo-400 tracking-wide mt-0.5">GTM OBSERVABILITY</span>
            </div>
          </div>
        </div>

        {/* NAV */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto no-scrollbar">

          {/* ── AUTOMATIONS — featured section ── */}
          <div>
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="w-1 h-3 rounded-full bg-indigo-500 shrink-0" />
              <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                Automations
              </h3>
            </div>

            <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-1">
              <NavLink
                to="/automations"
                onClick={() => handleNavClick("/automations")}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isPulsing("/automations")
                      ? "bg-emerald-500/8 text-white border border-emerald-400/60 animate-pulse"
                      : isActive
                      ? "bg-indigo-500/15 text-white border border-indigo-500/25"
                      : "text-slate-400 hover:bg-indigo-500/10 hover:text-white border border-transparent"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Workflow size={15} className={`shrink-0 transition-colors ${isPulsing("/automations") ? "text-emerald-400" : isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                    <span>Automations</span>
                    {!isPulsing("/automations") && isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.9)]" />
                    )}
                  </>
                )}
              </NavLink>
            </div>
          </div>

          {/* ── Regular nav groups ── */}
          {navGroups.map((group, idx) => (
            <div key={idx}>
              <h3 className="px-3 text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-1.5">
                {group.title}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => handleNavClick(item.path)}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        isPulsing(item.path)
                          ? "bg-emerald-500/8 text-white border border-emerald-400/60 animate-pulse"
                          : isActive
                          ? "bg-indigo-500/10 text-white border border-indigo-500/20"
                          : "text-slate-500 hover:bg-slate-900 hover:text-slate-200 border border-transparent"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          size={15}
                          className={`shrink-0 transition-colors ${isPulsing(item.path) ? "text-emerald-400" : isActive ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"}`}
                        />
                        <span>{item.label}</span>
                        {!isPulsing(item.path) && isActive && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.9)]" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* UPGRADE BUTTON */}
        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={() => setShowPlans(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all group"
          >
            <Sparkles size={13} className="text-indigo-400 shrink-0" />
            <span className="flex-1 text-left text-xs font-medium text-indigo-300 group-hover:text-indigo-200">
              {currentPlan === "trial" || currentPlan === "free" ? "Upgrade plan" : "Manage plan"}
            </span>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
              {PLAN_LABELS[currentPlan] ?? currentPlan}
            </span>
          </button>
        </div>

        {/* WORKSPACE FOOTER */}
        <div className="p-3 border-t border-slate-800/50 shrink-0">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
          >
            <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-400 group-hover:text-white group-hover:border-slate-600 shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-slate-300 truncate group-hover:text-white">{displayName}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Settings</p>
            </div>
            <Settings size={12} className="text-slate-600 group-hover:text-slate-400 shrink-0" />
          </button>
        </div>

        <AnimatePresence>
          {showPlans && (
            <PlansModal currentPlan={currentPlan} onClose={() => setShowPlans(false)} />
          )}
        </AnimatePresence>
      </aside>

      {/* Section intro modal — rendered outside aside so it covers the full viewport */}
      {introStep && (
        <SectionIntroModal
          step={introStep}
          onDone={() => handleIntroDone(introStep.key)}
        />
      )}
    </>
  );
}

