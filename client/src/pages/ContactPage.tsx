import Header from "../components/Header";
import Footer from "../components/Footer";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="border-b border-slate-900 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.32),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.2),_transparent_55%)]">
          <div className="mx-auto max-w-3xl px-4 pt-10 pb-12 md:pt-14 md:pb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-slate-950/80 px-3 py-1 mb-4 text-[11px] text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Talk to the iqpipe team
            </div>

            <h1 className="text-3xl md:text-4xl font-semibold leading-tight mb-3">
              Tell us about your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400">
                GTM stack
              </span>{" "}
              and we’ll show you what iqpipe can do.
            </h1>

            <p className="text-sm md:text-[13px] text-slate-300 mb-8 max-w-2xl">
              Share how you prospect, run outbound and track revenue today. We’ll
              map it to iqpipe’s schema, set up a tailored live demo, and
              help you estimate ROI for your team.
            </p>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:p-6 shadow-xl shadow-slate-900/70">
              <form
                className="space-y-4 text-[11px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  // Hook up to your backend / form provider here
                  alert("Thanks! We’ll get back to you shortly.");
                }}
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-200">Full name</label>
                    <input
                      type="text"
                      required
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-200">Work email</label>
                    <input
                      type="email"
                      required
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-200">Company</label>
                    <input
                      type="text"
                      required
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      placeholder="Your Company"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-200">Team size</label>
                    <select
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 focus:outline-none focus:border-indigo-400"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select team size
                      </option>
                      <option value="1-5">1–5 GTM people</option>
                      <option value="6-15">6–15 GTM people</option>
                      <option value="16-40">16–40 GTM people</option>
                      <option value="40+">40+ GTM people</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-200">
                    Which tools are in your GTM stack?
                  </label>
                  <textarea
                    rows={3}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                    placeholder="Clay, HeyReach, Lemlist, HubSpot, Salesforce, Stripe, Paddle..."
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-200">
                    What do you want to see in the demo?
                  </label>
                  <textarea
                    rows={4}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                    placeholder="E.g. compare Clay vs Apollo motions, see outbound leaks, unify MRR across tools..."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-cyan-400 text-slate-950 px-4 py-2 text-[11px] font-semibold shadow-lg shadow-indigo-500/30 hover:opacity-90"
                  >
                    Request live demo
                    <span className="text-[10px]">→</span>
                  </button>
                  <p className="text-slate-500">
                    We typically reply within one business day.
                  </p>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
