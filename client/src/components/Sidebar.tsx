import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Zap,
  Search,
  Settings,
  HeartPulse,
  GitBranch,
  Fingerprint,
  Workflow,
  BarChart3,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

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

  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.name) setWorkspaceName(d.name); })
      .catch(() => {});
  }, []);

  const displayName = workspaceName ?? "My Workspace";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="w-full md:w-56 h-full flex flex-col bg-slate-950">

      {/* BRAND */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Fingerprint size={16} />
          </div>
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
              className={({ isActive }) =>
                `group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-500/15 text-white border border-indigo-500/25"
                    : "text-slate-400 hover:bg-indigo-500/10 hover:text-white border border-transparent"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Workflow size={15} className={`shrink-0 transition-colors ${isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                  <span>Automations</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.9)]" />}
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
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                    ${isActive
                      ? "bg-indigo-500/10 text-white border border-indigo-500/20"
                      : "text-slate-500 hover:bg-slate-900 hover:text-slate-200 border border-transparent"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        size={15}
                        className={`shrink-0 transition-colors ${isActive ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"}`}
                      />
                      <span>{item.label}</span>
                      {isActive && (
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
    </aside>
  );
}
