import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  Settings,
  User,
  Menu,
  BookOpen,
} from "lucide-react";
import { SETUP_KEY } from "./SetupWizard";
import { API_BASE_URL } from "../../config";

const API_BASE = API_BASE_URL;

interface TopbarProps {
  onMenuClick?: () => void;
  onOpenSetup?: () => void;
}

type Notification = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | string;
  isRead: boolean;
  createdAt: string;
};

export default function Topbar({ onMenuClick, onOpenSetup }: TopbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Derived state
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  
  // Get user info safely
  const userString = localStorage.getItem("iqpipe_user");
  const user = userString ? JSON.parse(userString) : { fullName: "User" };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch notifications
  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;

    const fetchNotifications = async () => {
      try {
        setLoadingNotifs(true);
        const res = await fetch(`${API_BASE}/api/notifications`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (res.status === 401) return;

        if (!res.ok) return;
        const data = await res.json();
        setNotifications(data.notifications || []);
      } catch (e) {
        console.error("Failed to fetch notifications", e);
      } finally {
        setLoadingNotifs(false);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    
    if (next && unreadCount > 0) {
      const token = localStorage.getItem("iqpipe_token");
      if (!token) return;
      try {
        await fetch(`${API_BASE}/api/notifications/mark-read`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}), 
        });
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true }))
        );
      } catch (e) {
        console.error("Failed to mark notifications as read", e);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("iqpipe_token");
    localStorage.removeItem("iqpipe_user");
    window.location.replace("/login");
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 flex items-center px-4 md:px-6 bg-slate-950/80 backdrop-blur z-40 sticky top-0">
      
      {/* Mobile Sidebar Toggle */}
      <button 
        onClick={onMenuClick}
        className="md:hidden mr-3 text-slate-400 hover:text-white"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      {/* Right Actions */}
      <div className="flex items-center gap-3 md:gap-4">

        {/* Setup Guide */}
        <button
          onClick={onOpenSetup}
          title="Setup Guide"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            localStorage.getItem(SETUP_KEY)
              ? "border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 bg-transparent"
              : "border-indigo-700/50 text-indigo-400 hover:text-indigo-300 hover:border-indigo-600 bg-indigo-500/5"
          }`}
        >
          <BookOpen size={13} />
          <span className="hidden sm:inline">Guide</span>
          {!localStorage.getItem(SETUP_KEY) && (
            <span className="hidden sm:flex h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          )}
        </button>

        {/* Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            className="relative p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            onClick={handleOpenNotifications}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-h-[0.75rem] min-w-[0.75rem] px-0.5 flex items-center justify-center bg-rose-500 rounded-full border-2 border-slate-950 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-3 w-[min(20rem,calc(100vw-2rem))] max-h-96 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur sticky top-0 z-10">
                <span className="font-semibold text-slate-100">
                  Notifications
                </span>
                {loadingNotifs && (
                  <span className="text-[10px] text-slate-500">Syncing...</span>
                )}
              </div>

              {notifications.length === 0 && (
                <div className="px-4 py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                  <Bell size={24} className="opacity-20" />
                  <span>You’re all caught up.</span>
                </div>
              )}

              <div className="divide-y divide-slate-800/50">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={
                      "px-4 py-3 transition-colors hover:bg-slate-800/50 " +
                      (n.isRead ? "bg-slate-900 opacity-70" : "bg-slate-900/30")
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${n.isRead ? 'text-slate-400' : 'text-slate-200'}`}>
                              {n.title}
                            </span>
                            {n.severity === "warning" && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Warning
                              </span>
                            )}
                            {n.severity === "error" && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                Alert
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                            {formatTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          {n.body}
                        </p>
                      </div>
                      {!n.isRead && (
                         <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div
          className="relative"
          ref={profileRef}
        >
          <button 
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700 transition-all"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-semibold text-xs">
               {user.fullName ? user.fullName[0].toUpperCase() : "U"}
            </div>
            <div className="text-xs text-left hidden sm:block">
              <div className="font-medium text-slate-200 max-w-[80px] truncate">{user.fullName}</div>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-[min(12rem,calc(100vw-2rem))] rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-2 border-b border-slate-800 mb-1">
                 <p className="text-xs font-medium text-slate-200 truncate">{user.fullName}</p>
                 <p className="text-[10px] text-slate-500 truncate">{user.email || "user@iqpipe.io"}</p>
              </div>
              
              <button
                onClick={() => {
                  navigate("/settings");
                  setProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition-colors"
              >
                <Settings size={14} />
                Settings
              </button>
              
              <button
                onClick={() => {
                  navigate("/profile");
                  setProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 transition-colors"
              >
                <User size={14} />
                Profile
              </button>
              
              <div className="h-px bg-slate-800 my-1 mx-2" />
              
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2 transition-colors"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}