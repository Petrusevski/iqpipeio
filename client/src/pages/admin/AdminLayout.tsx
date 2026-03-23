import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Users, CreditCard, Mail, Activity,
  LogOut, ShieldCheck, Menu, Building2,
} from "lucide-react";

const NAV = [
  { path: "/admin36486",          label: "Dashboard",   icon: LayoutDashboard, end: true },
  { path: "/admin36486/users",    label: "Users",        icon: Users },
  { path: "/admin36486/workspaces", label: "Workspaces", icon: Building2 },
  { path: "/admin36486/billing",  label: "Billing",      icon: CreditCard },
  { path: "/admin36486/activity", label: "Activity",     icon: Activity },
  { path: "/admin36486/mailing",  label: "Mailing",      icon: Mail },
];

export default function AdminLayout() {
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    sessionStorage.removeItem("iqpipe_admin_token");
    navigate("/admin36486/login", { replace: true });
  };

  const Sidebar = ({ mobile = false }) => (
    <nav className={`flex flex-col h-full ${mobile ? "" : ""}`}>
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
        <ShieldCheck size={16} className="text-indigo-400 shrink-0" />
        <span className="text-sm font-bold text-slate-100 tracking-tight">iqpipe admin</span>
      </div>

      {/* Links */}
      <div className="flex-1 py-4 space-y-0.5 px-3">
        {NAV.map(({ path, label, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-300 font-medium"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              }`
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Logout */}
      <div className="px-3 pb-5 border-t border-slate-800 pt-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col bg-slate-900 border-r border-slate-800">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-slate-950/80" onClick={() => setOpen(false)} />
          <aside className="relative z-10 w-52 bg-slate-900 border-r border-slate-800 flex flex-col">
            <Sidebar mobile />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
          <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-slate-100">
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold text-slate-100">iqpipe admin</span>
        </div>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
