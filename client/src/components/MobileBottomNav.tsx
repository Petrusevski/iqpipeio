import { useEffect, useState, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Zap, Workflow, Search, HeartPulse, Settings } from "lucide-react";
import { API_BASE_URL } from "../../config";
import {
  GUIDE_STEPS,
  getCompletedSteps,
  markStepDone,
  getNextStep,
} from "./OnboardingGuide";
import SectionIntroModal from "./SectionIntroModal";

const tabs = [
  { label: "Feed",     path: "/feed",           icon: Zap        },
  { label: "Automate", path: "/automations",    icon: Workflow   },
  { label: "Inspect",  path: "/inspect",         icon: Search     },
  { label: "Health",   path: "/workflow-health", icon: HeartPulse },
  { label: "Settings", path: "/settings",        icon: Settings   },
];

export default function MobileBottomNav() {
  const navigate = useNavigate();

  // Guide is only active for first-login users
  const storedUser = (() => { try { return JSON.parse(localStorage.getItem("iqpipe_user") ?? "{}"); } catch { return {}; } })();
  const guideEnabled = storedUser.isNewUser === true;

  const [workspaceId,    setWorkspaceId]    = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [activeIntro,    setActiveIntro]    = useState<string | null>(null);

  // Track keyboard height so nav stays above keyboard on mobile
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setBottomOffset(Math.max(0, offset));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    if (!guideEnabled) return;
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.id) return;
        setWorkspaceId(d.id);
        setCompletedSteps(getCompletedSteps(d.id));
      })
      .catch(() => {});
  }, [guideEnabled]);

  const nextStep = (guideEnabled && workspaceId) ? getNextStep(completedSteps) : null;

  const handleTabClick = useCallback((path: string) => (e: React.MouseEvent) => {
    if (!workspaceId || !guideEnabled) return;
    const step = GUIDE_STEPS.find(s => s.path === path);
    if (step && nextStep?.path === path) {
      e.preventDefault();
      navigate(path);
      setTimeout(() => setActiveIntro(step.key), 120);
    }
  }, [workspaceId, guideEnabled, nextStep, navigate]);

  const handleIntroDone = useCallback((key: string) => {
    if (!workspaceId) return;
    const updated = markStepDone(key, workspaceId);
    setCompletedSteps(new Set(updated));
    setActiveIntro(null);
  }, [workspaceId]);

  const introStep = GUIDE_STEPS.find(s => s.key === activeIntro) ?? null;

  return (
    <>
      <nav
        className="md:hidden fixed inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800 safe-area-pb"
        style={{ bottom: bottomOffset }}
      >
        <div className="flex items-stretch h-16">
          {tabs.map(({ label, path, icon: Icon }) => {
            const isPulsing = nextStep?.path === path;
            return (
              <NavLink
                key={path}
                to={path}
                onClick={handleTabClick(path)}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                    isPulsing
                      ? "text-emerald-400"
                      : isActive
                      ? "text-indigo-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isPulsing && (
                      <span className="absolute inset-x-1 inset-y-1 rounded-lg border border-emerald-400/60 bg-emerald-500/8 animate-pulse pointer-events-none" />
                    )}
                    <Icon
                      size={20}
                      className={isPulsing ? "text-emerald-400" : isActive ? "text-indigo-400" : ""}
                    />
                    <span className="text-[10px] font-medium">{label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {introStep && (
        <SectionIntroModal
          step={introStep}
          onDone={() => handleIntroDone(introStep.key)}
        />
      )}
    </>
  );
}
