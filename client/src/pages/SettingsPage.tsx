import { useState, useCallback } from "react";
import PageHeader from "../components/PageHeader";
import { useSettings } from "../hooks/useSettings";
import {
  Clock, AlertTriangle, CheckCircle2, X, Zap, Lock, ShieldCheck,
  Receipt, Download, Loader2, ChevronDown, Bell, BellOff, BellRing,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../../config";
import { usePushNotifications, PUSH_EVENT_TYPES } from "../hooks/usePushNotifications";

// ─── Plan definitions (mirrors PricingPage) ───────────────────────────────────

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    yearlyPrice: 23,
    toolLimit: "5 apps connected",
    seats: "1 Seat",
    features: [
      "1 Seat",
      "1 Workspace",
      "5 apps simultaneously",
      "10,000 events / month",
      "Live Feed + Contact Inspector",
      "Pipeline Health monitoring",
      "Email support",
    ],
    border: "border-slate-700",
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPrice: 99,
    yearlyPrice: 79,
    toolLimit: "15 apps connected",
    seats: "3 Seats",
    features: [
      "3 Seats",
      "3 Workspaces",
      "15 apps simultaneously",
      "500,000 events / month",
      "All features incl. Workflow Health",
      "GTM Report (PDF/XLSX)",
      "Chat + Email support",
    ],
    border: "border-slate-700",
    popular: false,
  },
  {
    id: "agency",
    name: "Agency",
    monthlyPrice: 299,
    yearlyPrice: 239,
    toolLimit: "All apps · unlimited",
    seats: "Unlimited",
    features: [
      "Unlimited Seats & Workspaces",
      "All apps connected",
      "5,000,000 events / month",
      "All features + Workflow Health",
      "GTM Report (PDF/XLSX)",
      "API Access & Webhooks",
      "Priority 24/7 Support",
    ],
    border: "border-slate-700",
    popular: true,
  },
];

const PLAN_LABELS: Record<string, string> = {
  trial: "Free Trial",
  starter: "Starter",
  growth: "Growth",
  agency: "Agency",
  pro: "Pro",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trialDaysRemaining(trialEndsAt: string | null, createdAt: string): number {
  const end = trialEndsAt
    ? new Date(trialEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Upgrade Modal ────────────────────────────────────────────────────────────

function UpgradeModal({
  currentPlan,
  onClose,
}: {
  currentPlan: string;
  onClose: () => void;
}) {
  const [isYearly, setIsYearly] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">Upgrade your plan</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              30-day free trial on every plan. No credit card required to start.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Billing toggle */}
            <div className="flex items-center gap-2 text-xs">
              <span className={!isYearly ? "text-slate-100" : "text-slate-500"}>Monthly</span>
              <button
                onClick={() => setIsYearly(!isYearly)}
                className="w-10 h-5 bg-slate-700 rounded-full relative p-0.5 transition-colors hover:bg-slate-600"
              >
                <motion.div
                  animate={{ x: isYearly ? 20 : 0 }}
                  className="w-4 h-4 bg-indigo-500 rounded-full shadow"
                />
              </button>
              <span className={isYearly ? "text-slate-100" : "text-slate-500"}>
                Yearly{" "}
                <span className="text-emerald-400 font-semibold">−20%</span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-5 ${
                  plan.popular
                    ? "border-indigo-500/50 bg-indigo-950/30"
                    : "border-slate-800 bg-slate-950/50"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap shadow-lg shadow-indigo-500/30">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 bg-slate-800/60 border border-slate-700/50 rounded-full px-2.5 py-1 w-fit">
                  <Zap size={9} className="text-amber-400" />
                  {plan.toolLimit}
                </div>

                <div className="text-sm font-bold text-white mb-1">{plan.name}</div>

                <div className="flex items-end gap-1 mb-4">
                  <span className="text-3xl font-bold text-slate-50">${price}</span>
                  <span className="text-slate-400 text-xs mb-1">/mo</span>
                </div>

                <div className="space-y-2 mb-5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="w-full py-2 rounded-xl text-center text-xs font-semibold text-slate-500 bg-slate-800/60 border border-slate-700">
                    Current plan
                  </div>
                ) : (
                  <button
                    onClick={() => window.alert(`To upgrade to ${plan.name}, please contact support@iqpipe.io`)}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                      plan.popular
                        ? "bg-white text-slate-950 hover:bg-slate-100 shadow-lg shadow-indigo-500/10"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    }`}
                  >
                    Upgrade to {plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-5 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <Lock size={11} />
          Payments processed securely via Stripe · PCI DSS Level 1 · No card required today
          <ShieldCheck size={11} className="text-emerald-500" />
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, setSettings, loading, saving, error, saveSettings } = useSettings();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const workspace = settings?.workspace;
  const membership = settings?.membership;

  const updateWorkspace = (patch: Partial<typeof workspace>) => {
    if (!settings || !workspace) return;
    setSettings({ ...settings, workspace: { ...workspace, ...patch } });
  };

  const handleSave = async () => {
    await saveSettings();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const fetchInvoices = useCallback(async () => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    setInvoicesLoading(true);
    try {
      const wsRes = await fetch(`${API_BASE_URL}/api/workspaces/primary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { id: workspaceId } = await wsRes.json();
      const res = await fetch(`${API_BASE_URL}/api/invoices?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const handleToggleInvoices = () => {
    if (!showInvoices && invoices.length === 0) fetchInvoices();
    setShowInvoices(v => !v);
  };

  function buildInvoiceHTML(inv: any): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${inv.invoiceNumber}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#fff;color:#111;padding:48px;max-width:720px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  .brand{font-size:22px;font-weight:800;letter-spacing:-.5px}
  .badge{display:inline-block;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;margin-top:6px}
  h2{font-size:13px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#777;padding:8px 0;border-bottom:2px solid #eee}
  td{padding:12px 0;border-bottom:1px solid #f0f0f0;font-size:13px}
  .total-row td{font-weight:700;font-size:15px;border-top:2px solid #111;border-bottom:none;padding-top:16px}
  .footer{margin-top:40px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:16px}
  @media print{body{padding:24px}}
</style></head><body>
<div class="header">
  <div>
    <div class="brand">iqpipe</div>
    <div style="font-size:12px;color:#555;margin-top:4px">${inv.issuer.company} · Reg ${inv.issuer.registry}</div>
    <div style="font-size:12px;color:#555">${inv.issuer.address}</div>
    <div style="font-size:12px;color:#555">${inv.issuer.email}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:800">INVOICE</div>
    <div style="font-size:13px;font-weight:600;color:#555;margin-top:4px">${inv.invoiceNumber}</div>
    <div style="font-size:12px;color:#888;margin-top:2px">${inv.dateFormatted}</div>
    <div class="badge">PAID</div>
  </div>
</div>
<h2>Bill To</h2>
<div style="font-size:14px;font-weight:600">${inv.customerName}</div>
${inv.customerCompany ? `<div style="font-size:13px;color:#555">${inv.customerCompany}</div>` : ""}
${inv.customerEmail ? `<div style="font-size:12px;color:#888">${inv.customerEmail}</div>` : ""}
<table>
  <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>
    <tr><td>${inv.description}</td><td style="text-align:right">${inv.currency} ${inv.amount.toFixed(2)}</td></tr>
  </tbody>
  <tfoot>
    <tr class="total-row"><td>Total</td><td style="text-align:right">${inv.currency} ${inv.amount.toFixed(2)}</td></tr>
  </tfoot>
</table>
<div class="footer">
  Charge ID: ${inv.chargeId || "—"} · Source: ${inv.source} · Issued by ${inv.issuer.company}, ${inv.issuer.country}
</div>
</body></html>`;
  }

  function downloadInvoice(inv: any) {
    const html = buildInvoiceHTML(inv);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) setTimeout(() => win.print(), 600);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage workspace details, billing, and developer access." />
        <div className="mt-4 text-xs text-slate-400">Loading settings…</div>
      </div>
    );
  }

  if (error || !workspace || !membership) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage workspace details, billing, and developer access." />
        <div className="mt-4 rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error || "Failed to load settings."}
        </div>
      </div>
    );
  }

  const days = trialDaysRemaining(workspace.trialEndsAt ?? null, workspace.createdAt ?? new Date().toISOString());
  const trialExpired = workspace.plan === "trial" && days <= 0;
  const trialActive = workspace.plan === "trial" && days > 0;

  return (
    <>
      <AnimatePresence>
        {showUpgrade && (
          <UpgradeModal currentPlan={workspace.plan} onClose={() => setShowUpgrade(false)} />
        )}
      </AnimatePresence>

      <div>
        <PageHeader title="Settings" subtitle="Manage workspace details, billing, and developer access." />

        <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ── Left column ── */}
          <div className="space-y-6 xl:col-span-2">

            {/* Workspace profile */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1">Workspace profile</h2>
              <p className="text-xs text-slate-400 mb-4">
                Used for invoices, GTM reports, and shared dashboards.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Workspace name</label>
                  <input
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.workspaceName ?? ""}
                    onChange={(e) => updateWorkspace({ workspaceName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Company / Brand</label>
                  <input
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.companyName ?? ""}
                    onChange={(e) => updateWorkspace({ companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Primary domain</label>
                  <input
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.primaryDomain ?? ""}
                    placeholder="yourcompany.com"
                    onChange={(e) => updateWorkspace({ primaryDomain: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Default currency</label>
                  <select
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.defaultCurrency}
                    onChange={(e) => updateWorkspace({ defaultCurrency: e.target.value })}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Timezone</label>
                  <select
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.timezone}
                    onChange={(e) => updateWorkspace({ timezone: e.target.value })}
                  >
                    <option value="UTC">UTC</option>
                    <option value="Europe/London">Europe/London (GMT+0/+1)</option>
                    <option value="Europe/Berlin">Europe/Berlin (GMT+1/+2)</option>
                    <option value="Europe/Prague">Europe/Prague (GMT+1/+2)</option>
                    <option value="America/New_York">America/New_York (ET)</option>
                    <option value="America/Chicago">America/Chicago (CT)</option>
                    <option value="America/Denver">America/Denver (MT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Industry</label>
                  <select
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.industry}
                    onChange={(e) => updateWorkspace({ industry: e.target.value })}
                  >
                    <option value="SaaS">SaaS</option>
                    <option value="Fintech">Fintech</option>
                    <option value="E-commerce">E-commerce</option>
                    <option value="Agency / Services">Agency / Services</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                {saveSuccess && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 size={12} /> Saved
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 text-xs font-medium text-white disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </section>

            {/* Billing & plan */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1">Billing & plan</h2>
              <p className="text-xs text-slate-400 mb-4">
                Manage your iqpipe subscription, seats, and invoices.
              </p>

              {/* Trial banner */}
              {(trialActive || trialExpired) && (
                <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs ${
                  trialExpired
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : days <= 7
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"
                }`}>
                  {trialExpired
                    ? <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    : <Clock size={14} className="shrink-0 mt-0.5" />
                  }
                  <div>
                    {trialExpired ? (
                      <><span className="font-semibold">Your trial has ended.</span> Upgrade to keep your data and integrations.</>
                    ) : (
                      <><span className="font-semibold">{days} day{days !== 1 ? "s" : ""} left in your free trial.</span> After that, upgrade to keep your data and integrations.</>
                    )}
                    <button
                      onClick={() => setShowUpgrade(true)}
                      className="ml-2 underline font-semibold hover:opacity-80"
                    >
                      Upgrade now →
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-4">
                {/* Current plan */}
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3">
                  <div className="text-slate-400 mb-1">Current plan</div>
                  <div className="text-slate-100 font-bold text-sm">
                    {PLAN_LABELS[workspace.plan] ?? workspace.plan}
                  </div>
                  <div className="text-slate-500 mt-1">
                    {workspace.plan === "trial" && (days > 0 ? `${days} days remaining` : "Expired")}
                    {workspace.plan === "starter" && "$29 / mo · 1 seat · 5 apps · 10K events"}
                    {workspace.plan === "growth"  && "$99 / mo · 3 seats · 15 apps · 500K events"}
                    {workspace.plan === "agency"  && "$299 / mo · unlimited"}
                  </div>
                </div>

                {/* Seats */}
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3">
                  <div className="text-slate-400 mb-1">Seats</div>
                  <div className="text-slate-100 font-bold text-sm">
                    {workspace.seatsUsed} of{" "}
                    {workspace.plan === "starter" ? "1" :
                     workspace.plan === "growth"  ? "3" :
                     workspace.plan === "agency"  ? "∞" :
                     workspace.seatsTotal} used
                  </div>
                  <div className="text-slate-500 mt-1">
                    {workspace.plan === "trial"   && "1 seat during trial"}
                    {workspace.plan === "starter" && "1 seat included"}
                    {workspace.plan === "growth"  && "3 seats included"}
                    {workspace.plan === "agency"  && "Unlimited seats"}
                  </div>
                </div>

                {/* Billing email */}
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3">
                  <div className="text-slate-400 mb-2">Billing email</div>
                  <input
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={workspace.billingEmail ?? ""}
                    onChange={(e) => updateWorkspace({ billingEmail: e.target.value })}
                    placeholder="billing@company.com"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition-colors"
                >
                  Upgrade plan
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs text-slate-200 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving…" : "Save billing email"}
                </button>
                <button
                  onClick={handleToggleInvoices}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
                >
                  <Receipt size={12} />
                  View invoices
                  <ChevronDown size={12} className={`transition-transform ${showInvoices ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Inline invoice table */}
              {showInvoices && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-x-auto">
                  {invoicesLoading ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-slate-500 text-xs">
                      <Loader2 size={14} className="animate-spin" /> Loading invoices…
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="py-8 text-center">
                      <Receipt size={22} className="mx-auto text-slate-700 mb-2" />
                      <div className="text-xs text-slate-500">No invoices yet.</div>
                      <div className="text-[11px] text-slate-600 mt-1">Subscription invoices will appear here once a payment has been processed.</div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        <span>#</span>
                        <span>Customer</span>
                        <span className="text-right">Date</span>
                        <span className="text-right">Amount</span>
                        <span />
                      </div>
                      <ul className="divide-y divide-slate-800/60">
                        {invoices.map(inv => (
                          <li key={inv.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-slate-900/40 transition-colors">
                            <span className="text-[11px] font-mono text-indigo-300 whitespace-nowrap">{inv.invoiceNumber}</span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-100 truncate">{inv.customerName}</div>
                              <div className="text-[10px] text-slate-500 truncate">{inv.customerEmail}</div>
                            </div>
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">{inv.dateFormatted}</span>
                            <span className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                              {inv.currency} {inv.amount.toFixed(2)}
                            </span>
                            <button
                              onClick={() => downloadInvoice(inv)}
                              title="Download invoice"
                              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition-colors"
                            >
                              <Download size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Team & roles */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1">Team & roles</h2>
              <p className="text-xs text-slate-400 mb-4">
                Control who has access to iqpipe and what they can change.
              </p>

              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 text-xs">
                <table className="min-w-full">
                  <thead className="bg-slate-950/80">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-400 font-normal">Member</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-normal">Role</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-normal">Billing owner</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-800/80">
                      <td className="px-3 py-2 text-slate-100">
                        <div className="font-medium">{membership.userFullName}</div>
                        <div className="text-[11px] text-slate-500">{membership.userEmail}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] capitalize">
                          {membership.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {membership.isBillingOwner ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-slate-600 text-[11px]">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex justify-between items-center text-xs">
                <span className="text-slate-500">
                  Multi-seat access available on{" "}
                  <button onClick={() => setShowUpgrade(true)} className="text-indigo-400 hover:text-indigo-300 underline">
                    Growth & Agency plans
                  </button>
                </span>
                <button
                  onClick={() => window.alert("To invite team members, please upgrade to a Growth or Agency plan.")}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 transition-colors"
                >
                  Invite member
                </button>
              </div>
            </section>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-6">

            {/* Data & privacy */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1">Data & privacy</h2>
              <p className="text-xs text-slate-400 mb-4">
                Control retention and how much PII iqpipe stores.
              </p>

              <div className="space-y-4 text-xs">
                {/* Anonymize toggle */}
                <button
                  type="button"
                  onClick={() => updateWorkspace({ dataAnonymization: !workspace.dataAnonymization })}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-900 transition-colors"
                >
                  <span className="text-left">
                    <span className="block text-slate-200">Anonymize PII in analytics</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">Store emails and names as hashed IDs in reports.</span>
                  </span>
                  <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3 ${workspace.dataAnonymization ? "bg-indigo-500" : "bg-slate-600"}`}>
                    <span className={`h-4 w-4 rounded-full bg-white transform transition-transform ${workspace.dataAnonymization ? "translate-x-4" : "translate-x-1"}`} />
                  </span>
                </button>

                {/* Retention */}
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Data retention for raw events</label>
                  <select
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={workspace.dataRetentionMonths}
                    onChange={(e) => updateWorkspace({ dataRetentionMonths: Number(e.target.value) })}
                  >
                    <option value={3}>3 months</option>
                    <option value={6}>6 months</option>
                    <option value={12}>12 months</option>
                    <option value={24}>24 months</option>
                  </select>
                  <p className="text-[11px] text-slate-500">Aggregated metrics kept indefinitely.</p>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 text-[11px] font-medium text-white disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving…" : "Save privacy settings"}
                </button>

                <button
                  onClick={() => window.alert("To request a workspace export or deletion, contact privacy@iqpipe.io")}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  Request export / deletion
                </button>
              </div>
            </section>

            {/* Push notifications */}
            <PushNotificationsPanel />

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Push Notifications Panel ─────────────────────────────────────────────────

function PushNotificationsPanel() {
  const [pushState, pushActions] = usePushNotifications();
  const [testSent, setTestSent] = useState(false);

  const handleTest = async () => {
    await pushActions.sendTest();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const toggleEventType = async (key: string, enabled: boolean) => {
    const current = pushState.eventTypes ?? PUSH_EVENT_TYPES.map((e) => e.key);
    const updated  = enabled
      ? [...new Set([...current, key])]
      : current.filter((k) => k !== key);
    // If all events selected, use null (means "all")
    const next = updated.length === PUSH_EVENT_TYPES.length ? null : updated;
    await pushActions.updateEventTypes(next);
  };

  const enabledSet = new Set(
    pushState.eventTypes ?? PUSH_EVENT_TYPES.map((e) => e.key)
  );

  if (!pushState.supported) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-1">
          <BellOff size={14} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-100">Push notifications</h2>
        </div>
        <p className="text-xs text-slate-500">
          Your browser does not support Web Push notifications.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">Push notifications</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Get alerted even when the app is closed — deal events, billing, and GTM signals.
      </p>

      {/* Permission / subscribe state */}
      {!pushState.subscribed ? (
        <div className="space-y-3">
          {pushState.permission === "denied" && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Notifications are blocked in your browser. Enable them in your browser settings, then try again.
            </div>
          )}
          <button
            onClick={pushActions.requestAndSubscribe}
            disabled={pushState.loading || pushState.permission === "denied"}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-[11px] font-medium text-white transition-colors"
          >
            {pushState.loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <BellRing size={12} />
            )}
            Enable push notifications
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <CheckCircle2 size={12} />
              Notifications active on this device
            </div>
            <button
              onClick={pushActions.unsubscribe}
              disabled={pushState.loading}
              className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
            >
              Disable
            </button>
          </div>

          {/* Event type toggles */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Alert me for
            </p>
            {PUSH_EVENT_TYPES.map((evt) => {
              const on = enabledSet.has(evt.key);
              return (
                <button
                  key={evt.key}
                  type="button"
                  disabled={pushState.loading}
                  onClick={() => toggleEventType(evt.key, !on)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-900 transition-colors disabled:cursor-not-allowed"
                >
                  <span className="text-left">
                    <span className="block text-xs text-slate-200">{evt.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{evt.description}</span>
                  </span>
                  <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3 ${on ? "bg-indigo-500" : "bg-slate-600"}`}>
                    <span className={`h-4 w-4 rounded-full bg-white transform transition-transform ${on ? "translate-x-4" : "translate-x-1"}`} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Test button */}
          <button
            onClick={handleTest}
            disabled={pushState.loading || testSent}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:cursor-not-allowed text-[11px] text-slate-300 transition-colors"
          >
            {testSent ? (
              <><CheckCircle2 size={12} className="text-emerald-400" /> Test notification sent</>
            ) : pushState.loading ? (
              <><Loader2 size={12} className="animate-spin" /> Sending…</>
            ) : (
              <><BellRing size={12} /> Send test notification</>
            )}
          </button>
        </div>
      )}

      {/* Error */}
      {pushState.error && (
        <p className="mt-2 text-[11px] text-rose-400">{pushState.error}</p>
      )}
    </section>
  );
}
