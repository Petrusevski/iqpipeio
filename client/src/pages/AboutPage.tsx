import Header from "../components/Header";
import Footer from "../components/Footer";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="border-b border-slate-900 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.25),_transparent_55%)]">
          <div className="mx-auto max-w-4xl px-4 pt-10 pb-12 md:pt-14 md:pb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-slate-950/80 px-3 py-1 mb-4 text-sm text-indigo-200">
              About iqpipe
            </div>

            <h1 className="text-3xl md:text-4xl font-semibold leading-tight mb-4">
              {"We're building the intelligence layer "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400">
                that makes Claude GTM execution precise
              </span>
              .
            </h1>

            <p className="text-base text-slate-300 mb-6">
              GTM engineers now rely on Claude to run outbound &mdash; writing sequences,
              triggering n8n and Make.com workflows, and orchestrating campaigns end to end.
              But Claude operates{" "}
              <span className="font-medium text-slate-100">
                without real-time data
              </span>
              . It cannot see whether a lead is safe to contact, whether a webhook
              actually delivered, or which sequence is converting. Every decision is a guess.
            </p>

            <p className="text-base text-slate-300 mb-4">
              iqpipe was built to fix that. We sit between Claude and your GTM stack &mdash;
              unifying signals from Clay, outbound tools, CRMs and billing into{" "}
              <span className="font-medium text-slate-100">
                one queryable intelligence layer
              </span>
              {" "}Claude can call before, during and after every automation run.
            </p>

            <p className="text-base text-slate-300 mb-4">
              The result: Claude stops flying blind. It gates unsafe contacts, picks the
              right sequence, confirms execution, surfaces anomalies, and synthesizes
              improvement reports &mdash; all from{" "}
              <span className="font-medium text-slate-100">
                live data, not memory
              </span>
              .
            </p>

            <div className="mt-8 grid md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-slate-400 mb-1">What we believe</div>
                <p className="text-slate-200">
                  Claude is the best GTM co-pilot ever built.{" "}
                  <span className="font-medium">Real-time GTM data</span> is what
                  makes it reliable enough to trust with live campaigns.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-slate-400 mb-1">Who we serve</div>
                <p className="text-slate-200">
                  GTM engineers and RevOps teams running automation stacks in
                  n8n or Make.com who use Claude to direct and improve them.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-slate-400 mb-1">How we work</div>
                <p className="text-slate-200">
                  Remote-first, product-obsessed and close to our customers,
                  with fast iteration and clear feedback loops.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
