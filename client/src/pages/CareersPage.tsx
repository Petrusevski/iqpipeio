import Header from "../components/Header";
import Footer from "../components/Footer";
import { Users } from "lucide-react";

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="border-b border-slate-900 bg-slate-950">
          <div className="mx-auto max-w-4xl px-4 pt-10 pb-12 md:pt-14 md:pb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-slate-950/80 px-3 py-1 mb-4 text-sm text-emerald-200">
              Careers at iqpipe
            </div>

            <h1 className="text-3xl md:text-4xl font-semibold leading-tight mb-4">
              Help GTM teams{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400">
                understand their revenue engine
              </span>
              .
            </h1>

            <p className="text-base text-slate-300 mb-6">
              We're a small, product-led team working on a big problem:
              connecting the tools that run modern GTM teams into one coherent
              view. If you enjoy messy data, sharp strategy and thoughtful UX,
              you'll feel at home here.
            </p>

            <div className="grid md:grid-cols-3 gap-4 text-sm mb-12">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-slate-400 mb-1">Remote-first</div>
                <p className="text-slate-200">
                  Work from where you're most productive. We optimise for focus
                  time and deep work.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-slate-400 mb-1">Product over politics</div>
                <p className="text-slate-200">
                  Short feedback loops, real customer conversations and
                  dashboards that show impact.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-slate-400 mb-1">Ownership</div>
                <p className="text-slate-200">
                  Own outcomes, not tickets. Ship meaningful pieces of the
                  intelligence layer powering Claude GTM execution.
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-slate-100 mb-4">Open roles</h2>

            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-800 text-center mb-8">
              <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                <Users size={22} className="text-slate-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-300 mb-1">No open roles right now</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                We're heads-down building. When we hire, we'll post here first.
              </p>
            </div>

            <div className="text-sm text-slate-300">
              The mission resonates but no role fits?{" "}
              <a
                href="mailto:hello@iqpipe.io"
                className="text-emerald-300 underline underline-offset-4 hover:text-emerald-200"
              >
                Email us your story
              </a>{" "}
              and how you'd like to help.
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
