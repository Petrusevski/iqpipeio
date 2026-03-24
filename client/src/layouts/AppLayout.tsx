import { ReactNode, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import MobileBottomNav from "../components/MobileBottomNav";
import SetupWizard, { SETUP_KEY } from "../components/SetupWizard";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Auto-show setup wizard on first login
  useEffect(() => {
    const complete = localStorage.getItem(SETUP_KEY);
    if (!complete) {
      const t = setTimeout(() => setWizardOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  // Automatically close sidebar when route changes (improves mobile UX)
  const location = useLocation();
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-screen flex overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">

      {/* Setup Wizard */}
      {wizardOpen && <SetupWizard onClose={() => setWizardOpen(false)} />}

      {/* 1. Desktop Sidebar — fixed height, always visible */}
      <div className="hidden md:flex flex-col shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-950 shadow-xl z-30">
        <Sidebar />
      </div>

      {/* 2. Mobile Sidebar - Controlled by Framer Motion */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 md:hidden"
            />
            
            {/* Sliding Drawer */}
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-950 border-r border-slate-800 z-50 md:hidden shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800">
                 <span className="font-semibold text-slate-100 tracking-tight">Menu</span>
                 <button 
                   onClick={() => setMobileSidebarOpen(false)}
                   className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                 >
                   <X size={20} />
                 </button>
              </div>
              
              {/* Sidebar Content Container */}
              <div className="flex-1 overflow-y-auto">
                <Sidebar />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area — scrolls independently */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Topbar
          onMenuClick={() => setMobileSidebarOpen(true)}
          onOpenSetup={() => setWizardOpen(true)}
        />
        <main className="flex-1 px-4 md:px-8 py-6 pb-20 md:pb-6 relative">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

    </div>
  );
}