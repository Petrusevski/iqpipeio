import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useSettings } from "../hooks/useSettings";
import {
  Clock, AlertTriangle, X,
  Receipt, Download, Loader2, ChevronDown, Bell, BellOff, BellRing,
  Sparkles, Trash2, RefreshCw, Bot, Copy, Check,
  CheckCircle2, Lock, ShieldCheck, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../../config";
import { usePushNotifications, PUSH_EVENT_TYPES } from "../hooks/usePushNotifications";
import PlansModal, { PLANS, PLAN_LABELS } from "../components/PlansModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trialDaysRemaining(trialEndsAt: string | null, createdAt: string): number {
  const end = trialEndsAt
    ? new Date(trialEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
          <PlansModal currentPlan={workspace.plan} onClose={() => setShowUpgrade(false)} />
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
                    {workspace.plan === "starter" && "$29 / mo · 1 seat · 2 automations · 10K events"}
                    {workspace.plan === "growth"  && "$99 / mo · 3 seats · 10 automations · 500K events"}
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

            {/* Pricing Plan */}
            <PricingPlanSection currentPlan={workspace.plan} />

            {/* AI Agent Access */}
            <AiAgentAccessPanel apiKey={workspace.publicApiKey ?? ""} />

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

            {/* Demo data */}
            <DemoDataPanel />

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Pricing Plan Section ─────────────────────────────────────────────────────

function PricingPlanSection({ currentPlan }: { currentPlan: string }) {
  const [isYearly,    setIsYearly]    = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);

  const startCheckout = async (planId: string) => {
    setCheckoutErr(null);
    setLoadingPlan(planId);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res   = await fetch(`${API_BASE_URL}/api/checkout/session`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ planId, billing: isYearly ? "yearly" : "monthly" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || "Failed to start checkout."));
      window.location.href = data.url;
    } catch (err: any) {
      setCheckoutErr(err.message);
      setLoadingPlan(null);
    }
  };

  const PLAN_ORDER = ["starter", "growth", "agency"];
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-100">Pricing plan</h2>
        {/* Billing toggle */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className={!isYearly ? "text-slate-200 font-medium" : "text-slate-500"}>Monthly</span>
          <button
            onClick={() => setIsYearly(v => !v)}
            className="w-8 h-4 bg-slate-700 rounded-full relative p-0.5 transition-colors hover:bg-slate-600 shrink-0"
          >
            <span className={`block w-3 h-3 bg-indigo-400 rounded-full transition-transform ${isYearly ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <span className={isYearly ? "text-slate-200 font-medium" : "text-slate-500"}>
            Yearly <span className="text-emerald-400 font-semibold">−20%</span>
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">Your current plan and available upgrades or downgrades.</p>

      <div className="space-y-2.5">
        {PLANS.map((plan, idx) => {
          const isCurrent = currentPlan === plan.id;
          const price     = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
          const isUpgrade = idx > currentIdx && currentIdx >= 0;
          const isDowngrade = idx < currentIdx;

          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-3.5 transition-all ${
                isCurrent
                  ? "border-indigo-500/50 bg-indigo-950/30"
                  : "border-slate-800 bg-slate-950/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isCurrent ? "bg-indigo-400" : "bg-slate-700"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-100">{plan.name}</span>
                      {plan.popular && (
                        <span className="text-[9px] font-bold uppercase tracking-wide bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                      <Zap size={9} className="text-amber-400 shrink-0" />
                      {plan.toolLimit}
                      <span className="text-slate-700">·</span>
                      <span className="font-semibold text-slate-300">${price}<span className="font-normal text-slate-500">/mo</span></span>
                    </div>
                  </div>
                </div>

                {isCurrent ? (
                  <span className="text-[11px] text-slate-600 shrink-0">Current plan</span>
                ) : (
                  <button
                    onClick={() => startCheckout(plan.id)}
                    disabled={loadingPlan !== null}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isUpgrade
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                        : isDowngrade
                          ? "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    }`}
                  >
                    {loadingPlan === plan.id
                      ? <><Loader2 size={11} className="animate-spin" /> Redirecting…</>
                      : isDowngrade ? `Downgrade` : `Upgrade`
                    }
                  </button>
                )}
              </div>

              {/* Feature highlights — only on current plan */}
              {isCurrent && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-800/60 flex flex-wrap gap-x-3 gap-y-1">
                  {plan.features.slice(0, 4).map(f => (
                    <div key={f} className="flex items-center gap-1 text-[11px] text-slate-500">
                      <CheckCircle2 size={10} className="text-indigo-400 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {checkoutErr && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle size={11} className="shrink-0" /> {checkoutErr}
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-600">
        <Lock size={10} />
        Payments via Stripe · PCI DSS Level 1
        <ShieldCheck size={10} className="text-emerald-600" />
      </div>
    </section>
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

// ─── AI Agent Access Panel ────────────────────────────────────────────────────

function AiAgentAccessPanel({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bot size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">AI Agent Access (MCP)</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Give Claude or any MCP-compatible AI agent read-only access to your IQPipe workspace — live feed, contacts, workflows, and funnel.
      </p>

      {/* API Key display */}
      <div className="mb-4">
        <label className="text-[11px] text-slate-500 mb-1.5 block">Your workspace API key</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 font-mono">
            {apiKey || "—"}
          </code>
          <button
            onClick={copyKey}
            disabled={!apiKey}
            title="Copy API key"
            className="shrink-0 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
        <p className="text-[11px] text-slate-600 mt-1.5">
          Treat this like a password — anyone with this key can read your workspace data.
        </p>
      </div>

      {/* Quick setup */}
      <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 text-[11px] text-slate-400 space-y-2">
        <p className="font-semibold text-slate-300 text-xs">Claude Desktop quick setup</p>
        <ol className="list-decimal list-inside space-y-1 text-slate-500">
          <li>Build the MCP server: <code className="text-slate-400">packages/mcp/</code> in the IQPipe repo</li>
          <li>Open Claude Desktop → Settings → Developer → Edit Config</li>
          <li>Add <code className="text-slate-400">iqpipe</code> server with your key and API URL</li>
          <li>Restart Claude Desktop — ask it to <em>"show my live feed"</em></li>
        </ol>
        <p className="text-slate-600 pt-1">
          Available tools: <span className="text-slate-500">get_live_feed · get_funnel · list_workflows · get_workflow_health · search_contacts</span>
        </p>
      </div>
    </section>
  );
}

// ─── Demo Data Panel ──────────────────────────────────────────────────────────

function DemoDataPanel() {
  const navigate = useNavigate();
  const [status, setStatus]   = useState<"checking" | "empty" | "seeded" | "loading" | "removing" | "error">("checking");
  const [info,   setInfo]     = useState<{ iqLeads: number; integrations: number } | null>(null);
  const [msg,    setMsg]      = useState("");

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  // Check status on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/dev/seed-status`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.json())
      .then(d => {
        setInfo({ iqLeads: d.iqLeads, integrations: d.integrations });
        setStatus(d.seeded ? "seeded" : "empty");
      })
      .catch(() => setStatus("empty"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setStatus("loading");
    setMsg("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/dev/seed?force=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      if (d.seeded || d.skipped) {
        setInfo({ iqLeads: d.iqLeads ?? info?.iqLeads ?? 0, integrations: d.integrations?.total ?? info?.integrations ?? 0 });
        setStatus("seeded");
        navigate("/automations?demo=1");
      } else {
        setStatus("error");
        setMsg(d.error ?? "Failed to load demo data.");
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(e.message ?? "Could not reach server.");
    }
  };

  const remove = async () => {
    setStatus("removing");
    setMsg("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/dev/seed`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      if (d.removed) {
        setInfo(null);
        setStatus("empty");
        setMsg("Demo data removed. Workspace is clean.");
      } else {
        setStatus("seeded");
        setMsg(d.error ?? "Failed to remove demo data.");
      }
    } catch (e: any) {
      setStatus("seeded");
      setMsg(e.message ?? "Could not reach server.");
    }
  };

  const busy = status === "loading" || status === "removing" || status === "checking";

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">Demo data</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Populate your workspace with realistic GTM demo data — 43 contacts, 15 integrations, 3 n8n automations, and 3 workflow stacks.
      </p>

      {/* Status indicator */}
      {status === "checking" ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <Loader2 size={12} className="animate-spin" /> Checking…
        </div>
      ) : status === "seeded" || status === "removing" ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 mb-4">
          <CheckCircle2 size={12} className="shrink-0" />
          <span>
            Demo data active
            {info && ` — ${info.iqLeads} contacts · ${info.integrations} integrations`}
          </span>
        </div>
      ) : status === "empty" || status === "loading" ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-500 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
          No demo data — workspace is clean
        </div>
      ) : null}

      {/* Feedback message */}
      {msg && (
        <p className={`text-[11px] mb-3 ${status === "error" ? "text-rose-400" : "text-emerald-400"}`}>
          {msg}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={load}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors"
        >
          {status === "loading"
            ? <><RefreshCw size={12} className="animate-spin" /> Loading demo data…</>
            : <><Sparkles size={12} /> Load demo data</>
          }
        </button>

        {(status === "seeded" || status === "removing") && (
          <button
            onClick={remove}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 disabled:cursor-not-allowed text-xs text-rose-400 transition-colors"
          >
            {status === "removing"
              ? <><RefreshCw size={12} className="animate-spin" /> Removing…</>
              : <><Trash2 size={12} /> Remove demo data</>
            }
          </button>
        )}
      </div>
    </section>
  );
}
