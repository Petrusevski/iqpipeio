import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, ChevronDown, Bot, BookOpen } from 'lucide-react';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const mcpRef = useRef<HTMLDivElement>(null);

  // Close MCP dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (mcpRef.current && !mcpRef.current.contains(e.target as Node)) {
        setMcpOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="iqpipe" className="h-8 w-8 rounded-lg object-contain" />
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

          {/* MCP dropdown */}
          <div ref={mcpRef} className="relative">
            <button
              onClick={() => setMcpOpen(v => !v)}
              className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-slate-50 transition-colors"
            >
              MCP
              <ChevronDown size={11} className={`transition-transform duration-200 ${mcpOpen ? 'rotate-180' : ''}`} />
            </button>
            {mcpOpen && (
              <div className="absolute left-0 top-full mt-2 w-52 rounded-xl border border-slate-700/60 bg-slate-900 shadow-xl shadow-black/40 overflow-hidden z-50">
                <Link
                  to="/mcp-protocol"
                  onClick={() => setMcpOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors group"
                >
                  <BookOpen size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">MCP Protocol</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">How Claude connects to iqpipe</div>
                  </div>
                </Link>
                <div className="h-px bg-slate-800" />
                <Link
                  to="/claude-gtm"
                  onClick={() => setMcpOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors group"
                >
                  <Bot size={13} className="text-fuchsia-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">Claude + iqpipe</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">See Claude making GTM decisions</div>
                  </div>
                </Link>
              </div>
            )}
          </div>

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
              to="/mcp-protocol"
              className="text-sm font-medium text-slate-300 hover:text-slate-50"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              MCP Protocol
            </Link>
            <Link
              to="/claude-gtm"
              className="text-sm font-medium text-slate-300 hover:text-slate-50 flex items-center gap-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Bot size={13} className="text-fuchsia-400" />
              Claude + iqpipe
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