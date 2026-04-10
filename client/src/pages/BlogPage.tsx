import Header from "../components/Header";
import Footer from "../components/Footer";
import { BookOpen } from "lucide-react";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="border-b border-slate-900 bg-slate-950">
          <div className="mx-auto max-w-4xl px-4 pt-10 pb-12 md:pt-14 md:pb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 mb-4 text-sm text-slate-200">
              iqpipe Blog
            </div>

            <h1 className="text-3xl md:text-4xl font-semibold leading-tight mb-3">
              Thoughts on GTM data, revenue engines{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400">
                and the tools in between
              </span>
              .
            </h1>

            <p className="text-base text-slate-300 mb-12">
              Deep dives, playbooks and behind-the-scenes notes on Claude-powered GTM execution and the intelligence layer behind it.
            </p>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-800 text-center">
              <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                <BookOpen size={22} className="text-slate-500" />
              </div>
              <h2 className="text-base font-semibold text-slate-300 mb-1">No posts yet</h2>
              <p className="text-sm text-slate-500 max-w-xs">
                We're focused on building right now. First articles coming soon — subscribe below to be notified.
              </p>
              <a
                href="mailto:hello@iqpipe.io?subject=Blog updates"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
              >
                Notify me when articles drop
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
