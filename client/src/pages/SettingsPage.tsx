import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useSettings } from "../hooks/useSettings";
import {
  Clock, AlertTriangle, X,
  Receipt, Download, Loader2, ChevronDown,
  Sparkles, Trash2, RefreshCw, Bot, Copy, Check,
  CheckCircle2, Lock, ShieldCheck, Zap, Plus, Tag, GitMerge,
  Building2, CreditCard, Users, Cpu, Database, FlaskConical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../../config";
import PlansModal, { PLANS, PLAN_LABELS } from "../components/PlansModal";
import CustomEventTypesPanel from "../components/CustomEventTypesPanel";
import SourceMappingsPanel from "../components/SourceMappingsPanel";
import UsageDashboardPanel from "../components/UsageDashboardPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trialDaysRemaining(trialEndsAt: string | null, createdAt: string): number {
  const end = trialEndsAt
    ? new Date(trialEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SettingsTab = "workspace" | "billing" | "team" | "claude" | "data" | "developer";

export default function SettingsPage() {
  const { settings, setSettings, loading, saving, error, saveSettings } = useSettings();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");

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
  const trialActive  = workspace.plan === "trial" && days > 0;

  const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "workspace",  label: "Workspace",  icon: <Building2 size={14} /> },
    { id: "billing",    label: "Billing",    icon: <CreditCard size={14} /> },
    { id: "team",       label: "Team",       icon: <Users size={14} /> },
    { id: "claude",     label: "Claude",     icon: <Cpu size={14} /> },
    { id: "data",       label: "Data",       icon: <Database size={14} /> },
    { id: "developer",  label: "Developer",  icon: <FlaskConical size={14} /> },
  ];

  return (
    <>
      <AnimatePresence>
        {showUpgrade && (
          <PlansModal currentPlan={workspace.plan} onClose={() => setShowUpgrade(false)} />
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto bg-slate-950">
        {/* Page header */}
        <div className="px-6 pt-6 pb-0">
          <h1 className="text-xl font-bold text-slate-100">Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage workspace details, billing, and developer access.</p>
        </div>

        {/* Tab nav */}
        <div className="px-6 mt-5 border-b border-slate-800">
          <nav className="flex gap-1" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-indigo-300 bg-indigo-500/5"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="px-6 py-6 max-w-4xl space-y-6">

          {/* ── Workspace ── */}
          {activeTab === "workspace" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-1">Workspace profile</h2>
              <p className="text-xs text-slate-400 mb-4">Used for invoices, GTM reports, and shared dashboards.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Workspace name</label>
                  <input className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.workspaceName ?? ""} onChange={e => updateWorkspace({ workspaceName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Company / Brand</label>
                  <input className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.companyName ?? ""} onChange={e => updateWorkspace({ companyName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Primary domain</label>
                  <input className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.primaryDomain ?? ""} placeholder="yourcompany.com" onChange={e => updateWorkspace({ primaryDomain: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Default currency</label>
                  <select className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.defaultCurrency} onChange={e => updateWorkspace({ defaultCurrency: e.target.value })}>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Timezone</label>
                  <select className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.timezone} onChange={e => updateWorkspace({ timezone: e.target.value })}>
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
                  <select className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.industry} onChange={e => updateWorkspace({ industry: e.target.value })}>
                    <option value="SaaS">SaaS</option>
                    <option value="Fintech">Fintech</option>
                    <option value="E-commerce">E-commerce</option>
                    <option value="Agency / Services">Agency / Services</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                {saveSuccess && <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={12} /> Saved</span>}
                <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 text-xs font-medium text-white disabled:cursor-not-allowed transition-colors">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </section>
          )}

          {/* ── Billing ── */}
          {activeTab === "billing" && (
            <div className="space-y-6">
              <UsageDashboardPanel />

              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-sm font-semibold text-slate-100 mb-1">Billing & plan</h2>
                <p className="text-xs text-slate-400 mb-4">Manage your iqpipe subscription, seats, and invoices.</p>

                {(trialActive || trialExpired) && (
                  <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs ${trialExpired ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : days <= 7 ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"}`}>
                    {trialExpired ? <AlertTriangle size={14} className="shrink-0 mt-0.5" /> : <Clock size={14} className="shrink-0 mt-0.5" />}
                    <div>
                      {trialExpired
                        ? <><span className="font-semibold">Your trial has ended.</span> Upgrade to keep your data and integrations.</>
                        : <><span className="font-semibold">{days} day{days !== 1 ? "s" : ""} left in your free trial.</span> After that, upgrade to keep your data and integrations.</>}
                      <button onClick={() => setShowUpgrade(true)} className="ml-2 underline font-semibold hover:opacity-80">Upgrade now →</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-4">
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3">
                    <div className="text-slate-400 mb-1">Current plan</div>
                    <div className="text-slate-100 font-bold text-sm">{PLAN_LABELS[workspace.plan] ?? workspace.plan}</div>
                    <div className="text-slate-500 mt-1">
                      {workspace.plan === "trial"   && (days > 0 ? `${days} days remaining` : "Expired")}
                      {workspace.plan === "starter" && "$29 / mo · 1 seat · 2 automations · 10K events"}
                      {workspace.plan === "growth"  && "$99 / mo · 3 seats · 10 automations · 500K events"}
                      {workspace.plan === "agency"  && "$299 / mo · unlimited"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3">
                    <div className="text-slate-400 mb-1">Seats</div>
                    <div className="text-slate-100 font-bold text-sm">
                      {workspace.seatsUsed} of {workspace.plan === "starter" ? "1" : workspace.plan === "growth" ? "3" : workspace.plan === "agency" ? "∞" : workspace.seatsTotal} used
                    </div>
                    <div className="text-slate-500 mt-1">
                      {workspace.plan === "trial"   && "1 seat during trial"}
                      {workspace.plan === "starter" && "1 seat included"}
                      {workspace.plan === "growth"  && "3 seats included"}
                      {workspace.plan === "agency"  && "Unlimited seats"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3">
                    <div className="text-slate-400 mb-2">Billing email</div>
                    <input className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" value={workspace.billingEmail ?? ""} onChange={e => updateWorkspace({ billingEmail: e.target.value })} placeholder="billing@company.com" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <button onClick={() => setShowUpgrade(true)} className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition-colors">Upgrade plan</button>
                  <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs text-slate-200 disabled:cursor-not-allowed transition-colors">{saving ? "Saving…" : "Save billing email"}</button>
                  <button onClick={handleToggleInvoices} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors">
                    <Receipt size={12} /> View invoices
                    <ChevronDown size={12} className={`transition-transform ${showInvoices ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {showInvoices && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-x-auto">
                    {invoicesLoading ? (
                      <div className="py-8 flex items-center justify-center gap-2 text-slate-500 text-xs"><Loader2 size={14} className="animate-spin" /> Loading invoices…</div>
                    ) : invoices.length === 0 ? (
                      <div className="py-8 text-center">
                        <Receipt size={22} className="mx-auto text-slate-700 mb-2" />
                        <div className="text-xs text-slate-500">No invoices yet.</div>
                        <div className="text-[11px] text-slate-600 mt-1">Subscription invoices will appear here once a payment has been processed.</div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          <span>#</span><span>Customer</span><span className="text-right">Date</span><span className="text-right">Amount</span><span />
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
                              <span className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap">{inv.currency} {inv.amount.toFixed(2)}</span>
                              <button onClick={() => downloadInvoice(inv)} title="Download invoice" className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition-colors"><Download size={13} /></button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </section>

              <PricingPlanSection currentPlan={workspace.plan} />
            </div>
          )}

          {/* ── Team ── */}
          {activeTab === "team" && (
            <TeamSection
              plan={workspace.plan}
              primaryDomain={workspace.primaryDomain ?? null}
              currentMembership={membership}
              onUpgrade={() => setShowUpgrade(true)}
            />
          )}

          {/* ── Claude ── */}
          {activeTab === "claude" && (
            <div className="space-y-6">
              <ClaudeConnectPanel apiKey={workspace.publicApiKey ?? ""} />
              <WebhookURLCard />
            </div>
          )}

          {/* ── Data ── */}
          {activeTab === "data" && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="text-sm font-semibold text-slate-100 mb-1">Data & privacy</h2>
                <p className="text-xs text-slate-400 mb-4">Control retention and how much PII iqpipe stores.</p>
                <div className="space-y-4 text-xs">
                  <button type="button" onClick={() => updateWorkspace({ dataAnonymization: !workspace.dataAnonymization })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-900 transition-colors">
                    <span className="text-left">
                      <span className="block text-slate-200">Anonymize PII in analytics</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">Store emails and names as hashed IDs in reports.</span>
                    </span>
                    <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3 ${workspace.dataAnonymization ? "bg-indigo-500" : "bg-slate-600"}`}>
                      <span className={`h-4 w-4 rounded-full bg-white transform transition-transform ${workspace.dataAnonymization ? "translate-x-4" : "translate-x-1"}`} />
                    </span>
                  </button>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Data retention for raw events</label>
                    <select className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" value={workspace.dataRetentionMonths} onChange={e => updateWorkspace({ dataRetentionMonths: Number(e.target.value) })}>
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                      <option value={12}>12 months</option>
                      <option value={24}>24 months</option>
                    </select>
                    <p className="text-[11px] text-slate-500">Aggregated metrics kept indefinitely.</p>
                  </div>
                  <button onClick={handleSave} disabled={saving} className="w-full px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 text-[11px] font-medium text-white disabled:cursor-not-allowed transition-colors">
                    {saving ? "Saving…" : "Save privacy settings"}
                  </button>
                  <a href="mailto:privacy@iqpipe.io?subject=Data%20Export%20%2F%20Deletion%20Request" className="w-full block text-center px-3 py-2 rounded-lg bg-slate-900 border border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 transition-colors">
                    Request export / deletion → privacy@iqpipe.io
                  </a>
                </div>
              </section>
              <CustomEventTypesPanel plan={workspace.plan} />
              <SourceMappingsPanel />
            </div>
          )}

          {/* ── Developer ── */}
          {activeTab === "developer" && (
            <DemoDataPanel />
          )}

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


// ─── Team Section ─────────────────────────────────────────────────────────────

interface MemberRow { id: string; userId: string; fullName: string; email: string; role: string; isBillingOwner: boolean; joinedAt: string; }
interface InviteRow { id: string; email: string; role: string; expiresAt: string; createdAt: string; }

function TeamSection({
  plan, primaryDomain, currentMembership, onUpgrade,
}: {
  plan: string;
  primaryDomain: string | null;
  currentMembership: { userFullName: string; userEmail: string; role: string; isBillingOwner: boolean };
  onUpgrade: () => void;
}) {
  const canInvite = plan === "growth" || plan === "agency";
  const isAgency  = plan === "agency";

  const [members,      setMembers]      = useState<MemberRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRow[]>([]);
  const [showForm,     setShowForm]     = useState(false);
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [inviteRole,   setInviteRole]   = useState("analyst");
  const [inviting,     setInviting]     = useState(false);
  const [inviteErr,    setInviteErr]    = useState<string | null>(null);
  const [inviteDone,   setInviteDone]   = useState<string | null>(null);

  const token = localStorage.getItem("iqpipe_token");

  useEffect(() => {
    if (!canInvite) return;
    fetch(`${API_BASE_URL}/api/settings/members`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setMembers(d.members); setPendingInvites(d.pendingInvites); }
      })
      .catch(() => {});
  }, [canInvite, token]);

  const handleInvite = async () => {
    setInviteErr(null);
    if (!inviteEmail) { setInviteErr("Email required."); return; }
    setInviting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteErr(data.error ?? "Failed to send invite."); return; }
      setInviteDone(data.acceptUrl);
      setInviteEmail("");
      setPendingInvites(prev => [...prev, { id: data.inviteId, email: data.email, role: data.role, expiresAt: new Date(Date.now() + 7*86400000).toISOString(), createdAt: new Date().toISOString() }]);
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (id: string) => {
    await fetch(`${API_BASE_URL}/api/settings/invite/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setPendingInvites(prev => prev.filter(i => i.id !== id));
  };

  const allRows = canInvite ? members : [{ id: "me", userId: "", fullName: currentMembership.userFullName, email: currentMembership.userEmail, role: currentMembership.role, isBillingOwner: currentMembership.isBillingOwner, joinedAt: "" }];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-100">Team &amp; roles</h2>
        {isAgency && primaryDomain && (
          <span className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
            @{primaryDomain} only
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">Control who has access and what they can change.</p>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 text-xs">
        <table className="min-w-full">
          <thead className="bg-slate-950/80">
            <tr>
              <th className="text-left px-3 py-2 text-slate-400 font-normal">Member</th>
              <th className="text-left px-3 py-2 text-slate-400 font-normal">Role</th>
              <th className="text-left px-3 py-2 text-slate-400 font-normal hidden sm:table-cell">Billing owner</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {allRows.map(m => (
              <tr key={m.id} className="border-t border-slate-800/80">
                <td className="px-3 py-2 text-slate-100">
                  <div className="font-medium">{m.fullName}</div>
                  <div className="text-[11px] text-slate-500">{m.email}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] capitalize">{m.role}</span>
                </td>
                <td className="px-3 py-2 text-slate-300 hidden sm:table-cell">{m.isBillingOwner ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-right"><span className="text-slate-600 text-[11px]">—</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Pending invites</p>
          {pendingInvites.map(i => (
            <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <div>
                <span className="text-slate-300">{i.email}</span>
                <span className="ml-2 text-slate-600 capitalize">{i.role}</span>
              </div>
              <button onClick={() => cancelInvite(i.id)} className="text-slate-600 hover:text-rose-400 transition-colors text-[10px]">Cancel</button>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      {canInvite && showForm && (
        <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
          {isAgency && (
            <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <Lock size={11} className="shrink-0 mt-0.5" />
              Only <strong>@{primaryDomain || "your corporate domain"}</strong> addresses are allowed.
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              placeholder={isAgency ? `name@${primaryDomain || "yourdomain.com"}` : "colleague@company.com"}
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteErr(null); setInviteDone(null); }}
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="readonly">Read-only</option>
            </select>
          </div>
          {inviteErr && <p className="text-[11px] text-rose-400">{inviteErr}</p>}
          {inviteDone && (
            <div className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 break-all">
              Invite created. Share this link: <span className="font-mono">{inviteDone}</span>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setInviteErr(null); setInviteDone(null); }} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleInvite} disabled={inviting || !inviteEmail} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs text-white font-semibold transition-all flex items-center gap-1.5">
              {inviting ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Send invite
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-between items-center text-xs">
        {!canInvite ? (
          <span className="text-slate-500">
            Multi-seat access available on{" "}
            <button onClick={onUpgrade} className="text-indigo-400 hover:text-indigo-300 underline">Growth &amp; Agency plans</button>
          </span>
        ) : (
          <span className="text-slate-600">{members.length} member{members.length !== 1 ? "s" : ""}</span>
        )}
        {canInvite && !showForm && (
          <button onClick={() => { setShowForm(true); setInviteDone(null); }} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 transition-colors">
            Invite member
          </button>
        )}
        {!canInvite && (
          <button onClick={onUpgrade} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 transition-colors">
            Invite member
          </button>
        )}
      </div>
    </section>
  );
}

// ─── AI Agent Access Panel ────────────────────────────────────────────────────

function McpUpgradeCta() {
  const [showPlans, setShowPlans] = useState(false);
  return (
    <>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Bot size={15} className="text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">Claude AI Agent</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">MCP</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                <Lock size={8} /> Growth+
              </span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
          Let Claude autonomously diagnose GTM issues, apply fixes, monitor your stack, and search contacts — all in conversation.
        </p>
        <button
          onClick={() => setShowPlans(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
        >
          <Zap size={11} />
          Upgrade for MCP
        </button>
      </section>
      {showPlans && <PlansModal currentPlan="trial" onClose={() => setShowPlans(false)} />}
    </>
  );
}

function ClaudeConnectPanel({ apiKey }: { apiKey: string }) {
  const MCP_URL    = "https://iqpipe.vercel.app/mcp";
  const fullUrl    = apiKey ? `${MCP_URL}?key=${apiKey}` : "";
  const CLAUDE_AI_INTEGRATIONS = "https://claude.ai/settings/integrations";

  const storedUser = (() => { try { return JSON.parse(localStorage.getItem("iqpipe_user") ?? "{}"); } catch { return {}; } })();
  const isNewUser  = storedUser.isNewUser === true;

  const [tab, setTab]           = useState<"web" | "desktop">("web");
  const [platform, setPlatform] = useState<"windows" | "mac">("windows");
  const [copied, setCopied]     = useState<string | null>(null);
  const [running, setRunning]   = useState(false);
  const [scriptDone, setScriptDone] = useState(false);
  const [scriptErr, setScriptErr]   = useState<string | null>(null);
  const [testState, setTestState]   = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const copy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const runSetup = async () => {
    if (!apiKey) return;
    setRunning(true);
    setScriptErr(null);
    setScriptDone(false);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res = await fetch(
        `${API_BASE_URL}/api/mcp/setup-script?platform=${platform}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const script = await res.text();

      // Download the script so the user can run it
      const blob = new Blob([script], { type: "text/plain" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = platform === "windows" ? "iqpipe-claude-setup.ps1" : "iqpipe-claude-setup.sh";
      a.click();
      URL.revokeObjectURL(url);
      setScriptDone(true);
    } catch {
      setScriptErr("Failed to download setup script.");
    } finally {
      setRunning(false);
    }
  };

  const setupCommand = platform === "windows"
    ? `irm "${MCP_URL.replace("https://", "https://")}/api/mcp/setup-script?platform=windows" -Headers @{Authorization="Bearer ${apiKey}"} | iex`
    : `curl -sH "Authorization: Bearer ${apiKey}" "${API_BASE_URL}/api/mcp/setup-script?platform=mac" | bash`;

  const testConnection = async () => {
    if (!apiKey) return;
    setTestState("testing");
    try {
      const r = await fetch(`${MCP_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "iqpipe-test", version: "1.0" } }, id: 1 }),
      });
      setTestState(r.ok ? "ok" : "fail");
    } catch {
      setTestState("fail");
    }
    setTimeout(() => setTestState("idle"), 5000);
  };

  return (
    <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
      {/* New-user onboarding callout */}
      {isNewUser && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-400/20 mb-4">
          <Zap size={14} className="text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-indigo-300 mb-0.5">Connect Claude first</p>
            <p className="text-[11px] text-indigo-300/70">
              Connecting Claude to iqpipe gives it live visibility into your GTM workflows — no switching tabs.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Bot size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">Connect to Claude</h2>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">MCP</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Connect Claude to your iqpipe workspace in one step — no config files, no JSON editing. Claude can then diagnose GTM issues, check workflow health, search contacts, and fix problems directly in conversation.
      </p>

      {/* Platform tabs */}
      <>

      {/* Platform tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-4">
        {(["web", "desktop"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === t
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "web" ? "Claude.ai (web)" : "Claude Desktop"}
          </button>
        ))}
      </div>

      {/* ── Claude.ai web tab ── */}
      {tab === "web" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">1</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 mb-1">Open Claude.ai Integrations</p>
              <a
                href={CLAUDE_AI_INTEGRATIONS}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/15 px-2.5 py-1 rounded-lg transition-all"
              >
                Open Settings → Integrations ↗
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">2</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 mb-1.5">Add MCP Server — paste this URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-indigo-300 font-mono">
                  {fullUrl || "Generate your API key first"}
                </code>
                <button
                  onClick={() => copy(fullUrl, "url")}
                  disabled={!fullUrl}
                  className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  {copied === "url" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">Your API key is embedded — no separate auth header needed.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">3</div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200">Ask Claude anything</p>
              <p className="text-[11px] text-slate-500 mt-0.5">"Show my live feed" · "Why did HubSpot go quiet?" · "Which workflow closes fastest?"</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Claude Desktop tab ── */}
      {tab === "desktop" && (
        <div className="space-y-3">
          {/* OS picker */}
          <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            {(["windows", "mac"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  platform === p ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {p === "windows" ? "Windows" : "macOS / Linux"}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">1</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 mb-1.5">
                {platform === "windows" ? "Run in PowerShell" : "Run in Terminal"}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[10px] text-emerald-300 font-mono">
                  {apiKey ? setupCommand : "Loading..."}
                </code>
                <button
                  onClick={() => copy(setupCommand, "cmd")}
                  disabled={!apiKey}
                  className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  {copied === "cmd" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                Or{" "}
                <button
                  onClick={runSetup}
                  disabled={running || !apiKey}
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 disabled:opacity-40"
                >
                  {running ? "Downloading..." : "download the setup script"}
                </button>{" "}
                and run it manually.
              </p>
              {scriptDone && (
                <p className="text-[10px] text-emerald-400 mt-1">Script downloaded. Run it, then restart Claude Desktop.</p>
              )}
              {scriptErr && (
                <p className="text-[10px] text-rose-400 mt-1">{scriptErr}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">2</div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200">Restart Claude Desktop</p>
              <p className="text-[11px] text-slate-500 mt-0.5">iqpipe will appear in Claude's tool list automatically.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="h-5 w-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5">3</div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200">Ask Claude anything</p>
              <p className="text-[11px] text-slate-500 mt-0.5">"Show my live feed" · "Why did HubSpot go quiet?" · "Connect my Apollo account"</p>
            </div>
          </div>
        </div>
      )}

      {/* What you can do */}
      <div className="mt-4 pt-4 border-t border-slate-800">
        <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">What Claude can do once connected</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            "Monitor tool health",
            "Diagnose issues",
            "Apply fixes",
            "Search contacts",
            "Compare workflows",
            "Connect apps",
            "Track funnel",
            "Watch recovery",
          ].map(label => (
            <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Connection test */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={testConnection}
          disabled={!apiKey || testState === "testing"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 ${
            testState === "ok"   ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" :
            testState === "fail" ? "bg-rose-500/15 border-rose-500/30 text-rose-400" :
            "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          {testState === "testing" ? <RefreshCw size={11} className="animate-spin" /> :
           testState === "ok"      ? <Check size={11} /> :
           testState === "fail"    ? <AlertTriangle size={11} /> :
           <Zap size={11} />}
          {testState === "testing" ? "Testing…" :
           testState === "ok"      ? "Connected" :
           testState === "fail"    ? "Connection failed" :
           "Test connection"}
        </button>
        {testState === "fail" && (
          <p className="text-[11px] text-rose-400/80">Check your API key and try again.</p>
        )}
      </div>

      {/* API key (collapsed, for reference) */}
      <details className="mt-3 group">
        <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-400 list-none flex items-center gap-1">
          <span className="group-open:hidden">▶</span>
          <span className="hidden group-open:inline">▼</span>
          Show raw API key
        </summary>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-400 font-mono">
            {apiKey || "—"}
          </code>
          <button
            onClick={() => copy(apiKey, "rawkey")}
            disabled={!apiKey}
            className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-40"
          >
            {copied === "rawkey" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
        </div>
      </details>

      </>
    </section>
  );
}

// ─── Webhook URL Card ─────────────────────────────────────────────────────────

const PUSH_PAYLOAD = `{
  "workflowId": "my-workflow-123",
  "workflowName": "Lead Enrichment",
  "event": "lead.enriched",
  "contactEmail": "contact@example.com",
  "sourceTool": "Apollo"
}`;

const EVENT_TYPES = [
  "lead.created",
  "lead.enriched",
  "lead.qualified",
  "lead.contacted",
  "lead.replied",
  "lead.converted",
  "deal.created",
  "deal.updated",
  "deal.closed",
  "sequence.started",
  "sequence.completed",
  "sequence.bounced",
];

function WebhookURLCard() {
  const [urls,       setUrls]       = useState<{ n8n: string; make: string } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [copied,     setCopied]     = useState<string | null>(null);
  const [expanded,   setExpanded]   = useState(false);
  const [eventType,  setEventType]  = useState("lead.enriched");

  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/api/workspaces/webhook-url`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { setUrls({ n8n: d.n8n, make: d.make }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const samplePayload = PUSH_PAYLOAD.replace('"lead.enriched"', `"${eventType}"`);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={14} className="text-orange-400" />
        <h2 className="text-sm font-semibold text-slate-100">HTTP Push Node</h2>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/20">No API key needed</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Add one HTTP Request node at the end of any n8n or Make.com workflow. Paste the URL below — no platform API key required.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={12} className="animate-spin" /> Loading URLs…
        </div>
      ) : urls ? (
        <div className="space-y-3">
          {/* n8n URL */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">n8n</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">
                {urls.n8n}
              </code>
              <button
                onClick={() => copy(urls.n8n, "n8n")}
                className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                {copied === "n8n" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Make.com URL */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Make.com</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">
                {urls.make}
              </code>
              <button
                onClick={() => copy(urls.make, "make")}
                className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                {copied === "make" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Collapsible payload reference */}
          <div className="border-t border-slate-800 pt-3 mt-1">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              What to send
            </button>

            {expanded && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-500 shrink-0">Event type:</label>
                  <select
                    value={eventType}
                    onChange={e => setEventType(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-slate-500"
                  >
                    {EVENT_TYPES.map(et => (
                      <option key={et} value={et}>{et}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <pre className="text-[11px] text-slate-300 font-mono bg-slate-950 border border-slate-700 rounded-xl p-3 overflow-x-auto whitespace-pre leading-relaxed">
                    {samplePayload}
                  </pre>
                  <button
                    onClick={() => copy(samplePayload, "payload")}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
                  >
                    {copied === "payload" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                </div>

                <p className="text-[10px] text-slate-500">
                  Only <code className="text-slate-400">event</code> is required. iqpipe auto-creates the workflow record on the first push.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Could not load webhook URLs. Refresh and try again.</p>
      )}
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
