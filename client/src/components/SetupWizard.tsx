import TourGuide, { TourStep } from "./TourGuide";
import {
  Sparkles, Plug, Zap, Search, GitMerge,
  HeartPulse, Bot, FileText, Settings, Check,
} from "lucide-react";

export const SETUP_KEY = "iqpipe_setup_complete";

const STEPS: TourStep[] = [
  // ── 0. Welcome ──────────────────────────────────────────────────────────
  {
    selector: null,
    title: "Welcome to iqpipe",
    desc: "iqpipe is your GTM observability layer — it connects every tool in your outreach stack, processes events in real time, and surfaces exactly what's working and what isn't.",
    Icon: Sparkles,
    iconGrad: "from-indigo-600 to-fuchsia-600",
    tip: "This guide walks you through the 5-minute setup. You can reopen it anytime from the sidebar.",
  },

  // ── 1. Integrations ─────────────────────────────────────────────────────
  {
    selector: 'a[href="/integrations"]',
    title: "Step 1 — Connect Your Stack",
    desc: "Start here. Connect your outreach tools (HeyReach, Lemlist, Instantly, SmartLead), enrichment (Apollo, Clearbit), and CRM (HubSpot, Salesforce) by pasting their API keys.",
    Icon: Plug,
    iconGrad: "from-sky-700 to-sky-500",
    tip: "Each connected tool unlocks a new stream of events. Connect at least one outreach tool to see data flowing in immediately.",
    actionLabel: "Connect your tools →",
    actionPath: "/integrations",
  },

  // ── 2. Live Feed ─────────────────────────────────────────────────────────
  {
    selector: 'a[href="/feed"]',
    title: "Step 2 — Watch Events Come In",
    desc: "The Live Feed is a real-time stream of every signal across your entire stack — email opens, replies, connection requests, enrichments, meetings booked. Everything in one place.",
    Icon: Zap,
    iconGrad: "from-amber-600 to-orange-500",
    tip: "Events start flowing seconds after you connect a tool. Webhook-based tools (HeyReach, Lemlist, Instantly) push events instantly.",
    actionLabel: "Open Live Feed →",
    actionPath: "/feed",
  },

  // ── 3. Contact Inspector ─────────────────────────────────────────────────
  {
    selector: 'a[href="/inspect"]',
    title: "Step 3 — Inspect Any Contact",
    desc: "Search any contact by email or name and see their full cross-tool journey — every touchpoint, enrichment, reply, and outcome across every tool in your stack.",
    Icon: Search,
    iconGrad: "from-emerald-700 to-emerald-500",
    tip: "Use this when a prospect replies and you want full context before jumping on a call — see exactly what they received and when.",
    actionLabel: "Inspect a contact →",
    actionPath: "/inspect",
  },

  // ── 4. Pipeline Funnel ───────────────────────────────────────────────────
  {
    selector: 'a[href="/funnel"]',
    title: "Step 4 — Monitor Your Pipeline",
    desc: "The Pipeline Funnel shows conversion rates from first touch all the way to booked meeting and closed deal. Spot exactly where prospects are dropping off.",
    Icon: GitMerge,
    iconGrad: "from-violet-700 to-violet-500",
    tip: "A healthy funnel has a reply rate above 8% and a meeting-booked rate above 3%. If you're below that, the funnel will tell you which step to fix.",
    actionLabel: "View Pipeline →",
    actionPath: "/funnel",
  },

  // ── 5. Workflow Health ───────────────────────────────────────────────────
  {
    selector: 'a[href="/workflow-health"]',
    title: "Step 5 — Check Workflow Health",
    desc: "See the health of every active sequence and workflow across your connected tools — steps running, errors detected, bounce rates, and reply rates all in one view.",
    Icon: HeartPulse,
    iconGrad: "from-rose-700 to-rose-500",
    tip: "A red health score on a workflow usually means high bounce rate or API errors. Catch these early before they burn your sending domain.",
    actionLabel: "View Workflow Health →",
    actionPath: "/workflow-health",
  },

  // ── 6. Automation Health (n8n / Make) ────────────────────────────────────
  {
    selector: 'a[href="/automation-health"]',
    title: "Step 6 — Connect Your Automations",
    desc: "If you use n8n or Make.com, connect your workspace here. iqpipe will fetch all your workflows, detect which apps each one uses, and monitor events flowing through them.",
    Icon: Bot,
    iconGrad: "from-indigo-700 to-indigo-500",
    tip: "Paste your n8n API key and base URL to get a full map of every automation — which tools it touches, how often it fires, and whether it's erroring.",
    actionLabel: "Connect n8n / Make →",
    actionPath: "/automation-health",
  },

  // ── 7. GTM Report ────────────────────────────────────────────────────────
  {
    selector: 'a[href="/gtm-report"]',
    title: "Step 7 — Generate Your GTM Report",
    desc: "Export a full PDF or Excel report covering pipeline health, tool performance, event volumes, and attribution — ready to share with your team or leadership.",
    Icon: FileText,
    iconGrad: "from-slate-600 to-slate-500",
    tip: "Run this weekly to keep a record of GTM performance over time. The report pulls live data at generation time.",
    actionLabel: "Generate a Report →",
    actionPath: "/gtm-report",
  },

  // ── 8. Settings ──────────────────────────────────────────────────────────
  {
    selector: 'a[href="/settings"]',
    title: "Step 8 — Configure Your Workspace",
    desc: "Set your workspace name, manage team members, configure notification preferences, and store encrypted API credentials in the Vault.",
    Icon: Settings,
    iconGrad: "from-slate-700 to-slate-600",
    tip: "All API keys stored in the Vault are AES-256 encrypted at rest. Never paste credentials anywhere else.",
    actionLabel: "Open Settings →",
    actionPath: "/settings",
  },

  // ── 9. Done ──────────────────────────────────────────────────────────────
  {
    selector: null,
    title: "You're all set!",
    desc: "Connect your first integration and iqpipe comes alive. Start with one outreach tool — events will flow within seconds and your Live Feed will start filling up.",
    Icon: Check,
    iconGrad: "from-emerald-700 to-emerald-500",
    actionLabel: "Go to Integrations →",
    actionPath: "/integrations",
  },
];

export default function SetupWizard({ onClose }: { onClose: () => void }) {
  return <TourGuide steps={STEPS} onClose={onClose} storageKey={SETUP_KEY} />;
}
