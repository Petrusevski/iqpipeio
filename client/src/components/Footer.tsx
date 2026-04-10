import { Fingerprint } from "lucide-react"; // Added import

export default function Footer() {
  return (
    <footer className="border-t border-slate-900 bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-8 grid gap-6 md:grid-cols-4 text-[11px] text-slate-400">
        {/* Brand blurb */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            {/* UPDATED LOGO */}
            <img src="/logo.png" alt="iqpipe" className="h-7 w-7 rounded-lg object-contain" />
            <div className="leading-tight">
              <div className="text-xs font-semibold text-slate-50">
                iqpipe
              </div>
              <div className="text-[10px] text-slate-500">
                GTM intelligence for Claude
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            The intelligence layer that gives Claude real-time GTM data — so every automation decision is precise, not a guess.
          </p>
        </div>

        {/* Product links */}
        <div>
          <div className="text-[11px] font-semibold text-slate-200 mb-2">
            Product
          </div>
          <ul className="space-y-1">
            <li>
              <a href="/demo" className="hover:text-slate-200">
                Demo
              </a>
            </li>
            <li>
              <a href="/gtm-stack" className="hover:text-slate-200">
                GTM Stack
              </a>
            </li>
            <li>
              <a href="/integrations" className="hover:text-slate-200">
                Integrations
              </a>
            </li>
            <li>
              <a href="/pricing" className="hover:text-slate-200">
                Pricing
              </a>
            </li>
          </ul>
        </div>

        {/* Company links */}
        <div>
          <div className="text-[11px] font-semibold text-slate-200 mb-2">
            Company
          </div>
          <ul className="space-y-1">
            <li>
              <a href="/about" className="hover:text-slate-200">
                About
              </a>
            </li>
            <li>
              <a href="/careers" className="hover:text-slate-200">
                Careers
              </a>
            </li>
            <li>
              <a href="/blog" className="hover:text-slate-200">
                Blog
              </a>
            </li>
          </ul>
        </div>

        {/* Legal & social */}
        <div>
          <div className="text-[11px] font-semibold text-slate-200 mb-2">
            Legal & contact
          </div>
          <ul className="space-y-1 mb-3">
            <li>
              <a href="/privacy" className="hover:text-slate-200">
                Privacy Policy
              </a>
            </li>
            <li>
              <a href="/terms" className="hover:text-slate-200">
                Terms of Use
              </a>
            </li>
            <li>
              <a
                href="mailto:hello@iqpipe.io"
                className="hover:text-slate-200"
              >
                hello@iqpipe.io
              </a>
            </li>
          </ul>

          <div className="flex items-center gap-3 text-[13px]">
            <a
              href="https://www.linkedin.com"
              target="_blank"
              rel="noreferrer"
              className="h-7 w-7 rounded-full border border-slate-700 flex items-center justify-center hover:border-slate-400"
            >
              in
            </a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noreferrer"
              className="h-7 w-7 rounded-full border border-slate-700 flex items-center justify-center hover:border-slate-400"
            >
              X
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <div>
            © {new Date().getFullYear()} iqpipe. All rights reserved.
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline">Made for GTM teams.</span>
            <span className="text-slate-600">
              From first list import to closed won.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}