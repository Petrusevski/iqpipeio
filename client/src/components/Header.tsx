import { useState } from 'react'; // Added import
import { Link } from 'react-router-dom';
import { Fingerprint, Menu, X } from 'lucide-react'; // Added Menu, X imports

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 ring-1 ring-indigo-500/40">
            <Fingerprint size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">iqpipe</div>
            <div className="text-[11px] text-slate-400">GTM Intelligence</div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/demo"
            className="text-xs font-medium text-slate-300 hover:text-slate-50 transition-colors"
          >
            How it works
          </Link>
          <Link 
            to="/gtm-stack" 
            className="text-xs font-medium text-slate-300 hover:text-slate-50 transition-colors"
          >
            GTM Stack
          </Link>
          <Link 
            to="/pricing" 
            className="text-xs font-medium text-slate-300 hover:text-slate-50 transition-colors"
          >
            Pricing
          </Link>
        </nav>

        {/* Right actions (Desktop) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Link
            to="/login"
            className="text-xs text-slate-300 hover:text-slate-50"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-1 rounded-full bg-slate-50 text-slate-950 text-xs font-medium px-3 py-1.5 hover:bg-slate-200"
          >
            Start free
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden p-2 text-slate-400 hover:text-white"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-slate-950 border-b border-slate-800 p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
          <nav className="flex flex-col gap-4">
            <Link
              to="/demo"
              className="text-sm font-medium text-slate-300 hover:text-slate-50"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              How it works
            </Link>
            <Link 
              to="/gtm-stack" 
              className="text-sm font-medium text-slate-300 hover:text-slate-50"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              GTM Stack
            </Link>
            <Link 
              to="/pricing" 
              className="text-sm font-medium text-slate-300 hover:text-slate-50"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Pricing
            </Link>
          </nav>
          <div className="h-px bg-slate-800" />
          <div className="flex flex-col gap-3">
             <Link
              to="/login"
              className="text-sm text-slate-300 hover:text-slate-50"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="flex justify-center items-center gap-1 rounded-lg bg-slate-50 text-slate-950 text-sm font-medium px-4 py-2 hover:bg-slate-200"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}