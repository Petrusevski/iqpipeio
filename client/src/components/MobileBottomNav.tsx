import { NavLink } from "react-router-dom";
import { Zap, GitMerge, Activity, Plug, Settings } from "lucide-react";

const tabs = [
  { label: "Feed",    path: "/feed",         icon: Zap      },
  { label: "Funnel",  path: "/funnel",       icon: GitMerge },
  { label: "Health",  path: "/health",       icon: Activity },
  { label: "Connect", path: "/integrations", icon: Plug     },
  { label: "Settings",path: "/settings",     icon: Settings },
];

export default function MobileBottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800 safe-area-pb">
      <div className="flex items-stretch h-16">
        {tabs.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive
                  ? "text-indigo-400"
                  : "text-slate-500 hover:text-slate-300"
              }`
            }
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
