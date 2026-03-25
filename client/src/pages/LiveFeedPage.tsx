import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Radio, RefreshCw, ChevronRight, ChevronDown,
  CheckCircle2, AlertTriangle, MinusCircle, Circle,
  TrendingUp, MessageSquare, Calendar, DollarSign,
  MousePointerClick, UserCheck, MailX, BellOff,
  Filter, X, Check, Camera, Copy, Share2, History,
} from "lucide-react";
import { API_BASE_URL } from "../../config";
import SeedBanner from "../components/SeedBanner";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ToolCard {
  tool: string;
  label: string;
  channel: string;
  status: "healthy" | "warning" | "silent" | "never";
  totalEvents: number;
  events24h: number;
  events7d: number;
  lastEventAt: string | null;
  primaryMetric: { count: number; label: string } | null;
  topEvents: { eventType: string; label: string; count: number }[];
}

interface SignalEvent {
  id: string;
  tool: string;
  toolLabel: string;
  channel: string;
  eventType: string;
  recordedAt: string;
  iqLeadId: string;
  meta: Record<string, unknown> | null;
  sourceType?: string;
  workflowId?: string | null;
}

interface WorkflowStep { tool: string; }
interface WorkflowStack { id: string; name: string; steps: WorkflowStep[]; }

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DOMAINS: Record<string, string> = {
  apollo:        "apollo.io",
  clay:          "clay.com",
  zoominfo:      "zoominfo.com",
  pdl:           "peopledatalabs.com",
  clearbit:      "clearbit.com",
  hunter:        "hunter.io",
  lusha:         "lusha.com",
  cognism:       "cognism.com",
  snovio:        "snov.io",
  rocketreach:   "rocketreach.co",
  heyreach:      "heyreach.io",
  phantombuster: "phantombuster.com",
  expandi:       "expandi.io",
  dripify:       "dripify.io",
  waalaxy:       "waalaxy.com",
  meetalfred:    "meetalfred.com",
  instantly:     "instantly.ai",
  lemlist:       "lemlist.com",
  smartlead:     "smartlead.ai",
  mailshake:     "mailshake.com",
  replyio:       "reply.io",
  outreach:      "outreach.io",
  salesloft:     "salesloft.com",
  klenty:        "klenty.com",
  aircall:       "aircall.io",
  dialpad:       "dialpad.com",
  kixie:         "kixie.com",
  orum:          "orum.io",
  twilio:        "twilio.com",
  sakari:        "sakari.io",
  wati:          "wati.io",
  hubspot:       "hubspot.com",
  salesforce:    "salesforce.com",
  pipedrive:     "pipedrive.com",
  stripe:        "stripe.com",
  chargebee:     "chargebee.com",
  n8n:           "n8n.io",
  make:          "make.com",
  // ── Additional automation tool domains ──
  gmail:              "google.com",
  "google-gmail":     "google.com",
  "google-sheets":    "google.com",
  "google-drive":     "google.com",
  "google-calendar":  "google.com",
  "google-docs":      "google.com",
  sendgrid:           "sendgrid.com",
  mailchimp:          "mailchimp.com",
  mailgun:            "mailgun.com",
  postmark:           "postmarkapp.com",
  brevo:              "brevo.com",
  sendinblue:         "brevo.com",
  slack:              "slack.com",
  discord:            "discord.com",
  telegram:           "telegram.org",
  notion:             "notion.so",
  airtable:           "airtable.com",
  asana:              "asana.com",
  trello:             "trello.com",
  jira:               "atlassian.com",
  bitbucket:          "bitbucket.org",
  linear:             "linear.app",
  clickup:            "clickup.com",
  monday:             "monday.com",
  "monday-crm":       "monday.com",
  basecamp:           "basecamp.com",
  github:             "github.com",
  gitlab:             "gitlab.com",
  paddle:             "paddle.com",
  xero:               "xero.com",
  typeform:           "typeform.com",
  jotform:            "jotform.com",
  tally:              "tally.so",
  calendly:           "calendly.com",
  cal:                "cal.com",
  segment:            "segment.com",
  mixpanel:           "mixpanel.com",
  amplitude:          "amplitude.com",
  posthog:            "posthog.com",
  plausible:          "plausible.io",
  openai:             "openai.com",
  anthropic:          "anthropic.com",
  intercom:           "intercom.com",
  drift:              "drift.com",
  zendesk:            "zendesk.com",
  freshdesk:          "freshworks.com",
  freshsales:         "freshworks.com",
  attio:              "attio.com",
  close:              "close.com",
  "zoho-crm":         "zoho.com",
  copper:             "copper.com",
  woodpecker:         "woodpecker.co",
  mixmax:             "mixmax.com",
  snov:               "snov.io",
  supabase:           "supabase.com",
  mongodb:            "mongodb.com",
  postgresql:         "postgresql.org",
  mysql:              "mysql.com",
  surveymonkey:       "surveymonkey.com",
  reply:              "reply.io",
  "microsoft-365-email": "microsoft.com",
  "microsoft-teams":  "microsoft.com",
  "microsoft-excel":  "microsoft.com",
  sharepoint:         "microsoft.com",
};

function ToolLogo({ tool, label }: { tool: string; label: string }) {
  const [errored, setErrored] = useState(false);
  // Explicit map first, then best-guess .com for simple slugs
  const domain = TOOL_DOMAINS[tool] ?? (/^[a-z][a-z0-9]+$/.test(tool) ? `${tool}.com` : undefined);

  if (!domain || errored) {
    return (
      <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-[11px] font-semibold text-slate-100 uppercase shrink-0">
        {label[0]}
      </div>
    );
  }

  // Proxy through our own server so html2canvas can capture the image (no CORS)
  const src = `${API_BASE_URL}/api/proxy/favicon?domain=${domain}`;

  return (
    <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
      <img
        src={src}
        alt={label}
        width={22}
        height={22}
        className="object-contain"
        crossOrigin="anonymous"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

const CHANNEL_COLOR: Record<string, string> = {
  email:       "text-blue-400 bg-blue-500/10 border-blue-500/20",
  linkedin:    "text-sky-400 bg-sky-500/10 border-sky-500/20",
  enrichment:  "text-violet-400 bg-violet-500/10 border-violet-500/20",
  crm:         "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  billing:     "text-amber-400 bg-amber-500/10 border-amber-500/20",
  prospecting: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  automation:  "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
};
function chColor(ch: string) { return CHANNEL_COLOR[ch] ?? "text-slate-400 bg-slate-700/30 border-slate-700"; }

const STATUS_CFG = {
  healthy: { dot: "bg-emerald-400",  text: "text-emerald-400", label: "Live",    icon: CheckCircle2  },
  warning: { dot: "bg-amber-400",    text: "text-amber-400",   label: "Slow",    icon: AlertTriangle },
  silent:  { dot: "bg-rose-400",     text: "text-rose-400",    label: "Silent",  icon: MinusCircle   },
  never:   { dot: "bg-slate-600",    text: "text-slate-500",   label: "No data", icon: Circle        },
};

const SIGNAL_CFG: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  reply_received:      { icon: MessageSquare,    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Reply received"      },
  meeting_booked:      { icon: Calendar,         color: "text-sky-400 bg-sky-500/10 border-sky-500/20",            label: "Meeting booked"      },
  deal_won:            { icon: DollarSign,        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",      label: "Deal won"            },
  deal_created:        { icon: TrendingUp,        color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",   label: "Deal created"        },
  deal_lost:           { icon: MinusCircle,       color: "text-rose-400 bg-rose-500/10 border-rose-500/20",         label: "Deal lost"           },
  email_clicked:       { icon: MousePointerClick, color: "text-blue-400 bg-blue-500/10 border-blue-500/20",         label: "Email link clicked"  },
  link_clicked:        { icon: MousePointerClick, color: "text-blue-400 bg-blue-500/10 border-blue-500/20",         label: "Link clicked"        },
  connection_accepted: { icon: UserCheck,         color: "text-sky-400 bg-sky-500/10 border-sky-500/20",            label: "Connection accepted" },
  email_bounced:       { icon: MailX,             color: "text-rose-400 bg-rose-500/10 border-rose-500/20",         label: "Email bounced"       },
  unsubscribed:        { icon: BellOff,           color: "text-orange-400 bg-orange-500/10 border-orange-500/20",   label: "Unsubscribed"        },
};

// ── Automation app display labels ─────────────────────────────────────────────
const APP_LABELS: Record<string, string> = {
  hubspot: "HubSpot", pipedrive: "Pipedrive", salesforce: "Salesforce",
  "zoho-crm": "Zoho CRM", freshsales: "Freshsales", attio: "Attio",
  copper: "Copper", close: "Close CRM",
  instantly: "Instantly", lemlist: "Lemlist", smartlead: "Smartlead",
  apollo: "Apollo", outreach: "Outreach", salesloft: "Salesloft",
  reply: "Reply.io", woodpecker: "Woodpecker", mailshake: "Mailshake",
  mixmax: "Mixmax", klenty: "Klenty",
  heyreach: "HeyReach", expandi: "Expandi", dripify: "Dripify", waalaxy: "Waalaxy",
  gmail: "Gmail", "google-gmail": "Gmail", "google-sheets": "Google Sheets",
  "google-drive": "Google Drive", "google-calendar": "Google Calendar",
  sendgrid: "SendGrid", mailchimp: "Mailchimp", mailgun: "Mailgun",
  postmark: "Postmark", "microsoft-365-email": "Outlook", brevo: "Brevo",
  sendinblue: "Brevo", smtp: "SMTP",
  clearbit: "Clearbit", hunter: "Hunter.io", clay: "Clay",
  lusha: "Lusha", cognism: "Cognism", zoominfo: "ZoomInfo",
  phantombuster: "PhantomBuster", snov: "Snov.io",
  airtable: "Airtable", notion: "Notion", "microsoft-excel": "Excel",
  "microsoft-teams": "Microsoft Teams", sharepoint: "SharePoint",
  dropbox: "Dropbox", box: "Box",
  slack: "Slack", discord: "Discord", telegram: "Telegram",
  intercom: "Intercom", drift: "Drift", zendesk: "Zendesk",
  freshdesk: "Freshdesk", crisp: "Crisp",
  jira: "Jira", asana: "Asana", trello: "Trello",
  linear: "Linear", clickup: "ClickUp", monday: "Monday.com",
  "monday-crm": "Monday.com", basecamp: "Basecamp", todoist: "Todoist",
  github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket",
  stripe: "Stripe", chargebee: "Chargebee", paddle: "Paddle",
  quickbooks: "QuickBooks", xero: "Xero",
  typeform: "Typeform", jotform: "JotForm", surveymonkey: "SurveyMonkey", tally: "Tally",
  segment: "Segment", mixpanel: "Mixpanel", amplitude: "Amplitude",
  posthog: "PostHog", plausible: "Plausible",
  openai: "OpenAI", anthropic: "Anthropic",
  postgresql: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB", supabase: "Supabase",
  calendly: "Calendly", cal: "Cal.com",
  twilio: "Twilio", aircall: "Aircall", dialpad: "Dialpad", kixie: "Kixie",
  n8n: "n8n", make: "Make.com",
  pdl: "People Data Labs", rocketreach: "RocketReach", lusha2: "Lusha",
  meetalfred: "MeetAlfred", replyio: "Reply.io", sakari: "Sakari",
  wati: "WATI", orum: "Orum",
};

function appLabel(slug: string): string {
  return APP_LABELS[slug] ?? slug.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Automation app card (for tools used in n8n/Make workflows with no touchpoints yet) ──
function AutomationAppCard({ slug, hasEvents }: { slug: string; hasEvents: boolean }) {
  const label = appLabel(slug);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-start gap-2.5 mb-2">
        <ToolLogo tool={slug} label={label} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight truncate">{label}</p>
          <span className="text-[10px] text-slate-600 inline-block mt-1">via automation</span>
        </div>
        {hasEvents && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mt-1 shrink-0" />
        )}
      </div>
      {!hasEvents && (
        <p className="text-[10px] text-slate-700 mt-1">No events captured yet</p>
      )}
    </div>
  );
}

// Ordered list used to populate the Events filter panel
const SIGNAL_EVENT_OPTIONS = Object.entries(SIGNAL_CFG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
  color: cfg.color,
}));

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

interface FilterOption { value: string; label: string; sub?: string; dot?: string; }

function FilterDropdown({
  label, options, selected, onChange, accentClass,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  accentClass: string;   // e.g. "text-indigo-400 border-indigo-500/40 bg-indigo-500/10"
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (v: string) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };

  const active = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
          active
            ? `${accentClass} font-semibold`
            : "border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:border-slate-600"
        }`}
      >
        {label}
        {active && (
          <span className="ml-0.5 w-4 h-4 rounded-full bg-white/15 flex items-center justify-center text-[9px] font-bold">
            {selected.size}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`}/>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 min-w-[190px] py-1.5 overflow-hidden">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-600 italic">No options available</p>
          )}
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-slate-800 transition-colors"
            >
              <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                selected.has(opt.value)
                  ? "bg-indigo-500 border-indigo-500"
                  : "border-slate-600 bg-transparent"
              }`}>
                {selected.has(opt.value) && <Check size={9} className="text-white"/>}
              </span>
              {opt.dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.dot}`}/>}
              <div className="min-w-0">
                <span className="text-slate-200 truncate block">{opt.label}</span>
                {opt.sub && <span className="text-[9px] text-slate-600">{opt.sub}</span>}
              </div>
            </button>
          ))}
          {selected.size > 0 && (
            <div className="mt-1 mx-2 mb-0.5 pt-1 border-t border-slate-800">
              <button
                onClick={() => { onChange(new Set()); setOpen(false); }}
                className="w-full text-[10px] text-slate-600 hover:text-slate-400 py-1 text-left px-1 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE FILTER CHIPS
// ─────────────────────────────────────────────────────────────────────────────

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors ml-0.5">
        <X size={9}/>
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL KPI CARD
// ─────────────────────────────────────────────────────────────────────────────

function ToolKpiCard({ card }: { card: ToolCard }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_CFG[card.status];
  const StatusIcon = st.icon;

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 cursor-pointer hover:border-slate-700 transition-colors select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <ToolLogo tool={card.tool} label={card.label}/>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">{card.label}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${chColor(card.channel)} inline-block mt-1`}>
              {card.channel}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1 shrink-0 ${st.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${card.status === "healthy" ? "animate-pulse" : ""}`}/>
          <span className="text-[10px] font-medium">{st.label}</span>
        </div>
      </div>

      {card.primaryMetric ? (
        <div className="mb-3">
          <p className="text-2xl font-black tabular-nums text-white leading-none">
            {fmtNum(card.primaryMetric.count)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{card.primaryMetric.label}</p>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-2xl font-black tabular-nums text-slate-700">0</p>
          <p className="text-[11px] text-slate-700 mt-0.5">no events yet</p>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${card.events24h > 0 ? "bg-indigo-500/10 text-indigo-400" : "bg-slate-800 text-slate-600"}`}>
          {fmtNum(card.events24h)} / 24h
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${card.events7d > 0 ? "bg-slate-700/60 text-slate-400" : "bg-slate-800 text-slate-600"}`}>
          {fmtNum(card.events7d)} / 7d
        </span>
      </div>

      <p className="text-[10px] text-slate-600 leading-tight flex items-center gap-1">
        <StatusIcon size={9} className={st.text}/>
        {card.lastEventAt ? relTime(card.lastEventAt) : "Never fired"}
      </p>

      {expanded && card.topEvents.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
          {card.topEvents.map(e => (
            <div key={e.eventType} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500 truncate">{e.label}</span>
              <span className="text-[10px] font-semibold tabular-nums text-slate-300">{fmtNum(e.count)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL EVENT ROW
// ─────────────────────────────────────────────────────────────────────────────

function SignalRow({ event }: { event: SignalEvent }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const cfg = SIGNAL_CFG[event.eventType];
  const Icon = cfg?.icon ?? TrendingUp;
  const hasMeta = event.meta && Object.keys(event.meta).length > 0;

  return (
    <div className="border-b border-slate-800/40 last:border-0">
      <div
        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/20 transition-colors cursor-pointer group"
        onClick={() => hasMeta && setOpen(v => !v)}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${cfg?.color ?? "text-slate-400 bg-slate-700/30 border-slate-700"}`}>
          <Icon size={13}/>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-100">{cfg?.label ?? event.eventType.replace(/_/g, " ")}</span>
            <span className="text-[10px] text-slate-500">via</span>
            <span className="text-xs font-medium text-slate-300">{event.toolLabel}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${chColor(event.channel)}`}>
              {event.channel}
            </span>
            {event.sourceType === "n8n_workflow" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 font-medium">
                n8n
              </span>
            )}
            {(event.sourceType === "make_scenario" || event.meta?.viaAutomation === "make") && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 font-medium">
                Make
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={e => { e.stopPropagation(); navigate(`/inspect?id=${event.iqLeadId}`); }}
              className="text-[10px] font-mono text-slate-600 hover:text-indigo-400 transition-colors"
            >
              {event.iqLeadId}
            </button>
            {event.meta && !open && (
              <span className="text-[11px] text-slate-600 truncate max-w-xs">
                {Object.entries(event.meta)
                  .filter(([k]) => !["via", "viaAutomation"].includes(k))
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-600 tabular-nums">{relTime(event.recordedAt)}</span>
          {hasMeta && (
            open
              ? <ChevronDown size={12} className="text-slate-600"/>
              : <ChevronRight size={12} className="text-slate-700 group-hover:text-slate-500"/>
          )}
        </div>
      </div>

      {open && hasMeta && (
        <div className="px-5 pb-3 pl-16">
          <pre className="text-[11px] font-mono text-slate-400 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto leading-relaxed">
            {JSON.stringify(event.meta, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function SnapshotModal({
  dataUrl,
  caption,
  onClose,
}: {
  dataUrl: string;
  caption: string;
  onClose: () => void;
}) {
  const [editCaption,   setEditCaption]   = useState(caption);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [linkCopied,    setLinkCopied]    = useState(false);
  const [imageUrl,      setImageUrl]      = useState<string | null>(null);
  const [uploading,     setUploading]     = useState(true);
  const [uploadError,   setUploadError]   = useState(false);

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  // Upload image on open, get a shareable URL back
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/proxy/snapshot`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64: dataUrl }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setImageUrl(d.url))
      .catch(() => setUploadError(true))
      .finally(() => setUploading(false));
  }, []);

  const copyCaption = async () => {
    await navigator.clipboard.writeText(editCaption);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  const copyLink = async () => {
    if (!imageUrl) return;
    await navigator.clipboard.writeText(imageUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const openLinkedIn = () => {
    copyCaption();
    window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank", "noopener");
  };

  const openX = () => {
    const text = encodeURIComponent(
      editCaption.slice(0, 240) + (imageUrl ? `\n${imageUrl}` : "")
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank", "noopener");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera size={15} className="text-indigo-400"/>
            <span className="text-sm font-semibold text-white">GTM Stack Snapshot</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
            <X size={14}/>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[80vh]">

          {/* Image preview */}
          <div className="px-5 pt-5">
            <img src={dataUrl} alt="Snapshot preview"
              className="w-full rounded-xl border border-slate-800 object-contain max-h-52"/>
          </div>

          {/* Shareable link */}
          <div className="px-5 pt-4">
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
              Image link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-400 font-mono truncate select-all">
                {uploading
                  ? <span className="flex items-center gap-1.5"><RefreshCw size={10} className="animate-spin"/> Generating link…</span>
                  : uploadError
                    ? <span className="text-rose-400">Upload failed — use download instead</span>
                    : imageUrl
                }
              </div>
              <button
                onClick={copyLink}
                disabled={!imageUrl}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                  linkCopied
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                    : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                }`}
              >
                {linkCopied ? <Check size={11}/> : <Copy size={11}/>}
                {linkCopied ? "Copied!" : "Copy link"}
              </button>
              {imageUrl && (
                <a href={imageUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition-colors shrink-0">
                  <Share2 size={11}/> Open
                </a>
              )}
            </div>
          </div>

          {/* Caption */}
          <div className="px-5 pt-4">
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
              Caption <span className="normal-case text-slate-700 font-normal">(edit before sharing)</span>
            </label>
            <textarea
              value={editCaption}
              onChange={e => setEditCaption(e.target.value)}
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none transition-colors leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="px-5 py-4 flex items-center gap-2 flex-wrap">
            <button onClick={copyCaption}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                captionCopied
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
              }`}>
              {captionCopied ? <Check size={11}/> : <Copy size={11}/>}
              {captionCopied ? "Copied!" : "Copy caption"}
            </button>

            <div className="flex-1"/>

            {/* LinkedIn */}
            <button onClick={openLinkedIn}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0A66C2] hover:bg-[#0958a8] text-white text-xs font-semibold transition-colors">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white shrink-0"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Share on LinkedIn
            </button>

            {/* X */}
            <button onClick={openX}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black hover:bg-slate-900 border border-slate-700 text-white text-xs font-semibold transition-colors">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
              Post on X
            </button>
          </div>

          <p className="px-5 pb-4 text-[10px] text-slate-700">
            Paste the image link into your LinkedIn post. Caption is copied to clipboard when you click Share on LinkedIn.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS SNAPSHOT — draws KPI cards manually, no html2canvas grid issues
// ─────────────────────────────────────────────────────────────────────────────

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Channel → accent colour (RGBA for canvas)
const CH_ACCENT: Record<string, string> = {
  prospecting: "#f97316",
  enrichment:  "#a855f7",
  email:       "#3b82f6",
  linkedin:    "#0ea5e9",
  crm:         "#10b981",
  billing:     "#f59e0b",
  automation:  "#d946ef",
  other:       "#64748b",
};

async function drawCardsToCanvas(cards: ToolCard[]): Promise<string> {
  const SCALE   = 2;
  const COLS    = Math.min(5, Math.max(1, cards.length));
  const ROWS    = Math.ceil(cards.length / COLS);
  const CARD_W  = 210;
  const CARD_H  = 178;
  const GAP     = 12;
  const PAD     = 24;
  const HEAD_H  = 32;

  const W = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP;
  const H = PAD * 2 + HEAD_H + ROWS * CARD_H + (ROWS - 1) * GAP + PAD;

  const canvas = document.createElement("canvas");
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, W, H);

  // ── Section label + watermark ─────────────────────────────────────────────
  ctx.fillStyle = "#475569";
  ctx.font = "600 9px system-ui, sans-serif";
  ctx.fillText("CONNECTED TOOLS", PAD, PAD + 12);

  ctx.font = "600 9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#334155";
  ctx.fillText("iqpipe.io", W - PAD, PAD + 12);
  ctx.textAlign = "left";

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(PAD, PAD + 18, W - PAD * 2, 1);

  // ── Pre-load logos ────────────────────────────────────────────────────────
  const logos = await Promise.all(
    cards.map(c => {
      const domain = TOOL_DOMAINS[c.tool];
      if (!domain) return Promise.resolve(null);
      return loadImg(`${API_BASE_URL}/api/proxy/favicon?domain=${domain}`);
    })
  );

  // ── Draw each card ────────────────────────────────────────────────────────
  cards.forEach((card, i) => {
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const cx   = PAD + col * (CARD_W + GAP);
    const cy   = PAD + HEAD_H + row * (CARD_H + GAP);
    const acc  = CH_ACCENT[card.channel] ?? CH_ACCENT.other;

    // Card background
    ctx.fillStyle = "#0f172a";
    rr(ctx, cx, cy, CARD_W, CARD_H, 14);
    ctx.fill();

    // Card border
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    rr(ctx, cx, cy, CARD_W, CARD_H, 14);
    ctx.stroke();

    // ── Logo ────────────────────────────────────────────────────
    const lx = cx + 14, ly = cy + 14;
    ctx.fillStyle = "#ffffff";
    rr(ctx, lx, ly, 30, 30, 7);
    ctx.fill();

    const logo = logos[i];
    if (logo) {
      ctx.save();
      rr(ctx, lx, ly, 30, 30, 7);
      ctx.clip();
      const imgSize = 20;
      ctx.drawImage(logo, lx + (30 - imgSize) / 2, ly + (30 - imgSize) / 2, imgSize, imgSize);
      ctx.restore();
    } else {
      ctx.fillStyle = "#334155";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(card.label[0].toUpperCase(), lx + 15, ly + 15);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // ── Tool name ────────────────────────────────────────────────
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "600 12px system-ui, sans-serif";
    const nameX = lx + 36;
    const maxNameW = CARD_W - 14 - 36 - 50; // leave room for status on right
    let name = card.label;
    while (ctx.measureText(name).width > maxNameW && name.length > 1) name = name.slice(0, -1);
    if (name !== card.label) name += "…";
    ctx.fillText(name, nameX, cy + 24);

    // ── Channel pill ─────────────────────────────────────────────
    ctx.font = "500 9px system-ui, sans-serif";
    const pillText = card.channel;
    const pillW = ctx.measureText(pillText).width + 10;
    const pillY = cy + 30;
    ctx.fillStyle = acc + "22";
    rr(ctx, nameX, pillY, pillW, 14, 7);
    ctx.fill();
    ctx.strokeStyle = acc + "55";
    ctx.lineWidth = 0.5;
    rr(ctx, nameX, pillY, pillW, 14, 7);
    ctx.stroke();
    ctx.fillStyle = acc;
    ctx.fillText(pillText, nameX + 5, pillY + 10);

    // ── Status dot + label (top right) ───────────────────────────
    const dotColors: Record<string, string> = {
      healthy: "#34d399", warning: "#fbbf24", silent: "#f87171", never: "#475569",
    };
    const statusLabels: Record<string, string> = {
      healthy: "Live", warning: "Slow", silent: "Silent", never: "No data",
    };
    const dotCol = dotColors[card.status] ?? "#475569";
    const statusLabel = statusLabels[card.status] ?? "";
    ctx.font = "500 9px system-ui, sans-serif";
    const slW = ctx.measureText(statusLabel).width;
    const srX = cx + CARD_W - 14 - slW;
    ctx.fillStyle = dotCol;
    ctx.beginPath();
    ctx.arc(srX - 6, cy + 20, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(statusLabel, srX, cy + 24);

    // ── Primary metric ───────────────────────────────────────────
    const metY = cy + 68;
    if (card.primaryMetric) {
      ctx.fillStyle = "#f1f5f9";
      ctx.font      = "800 28px system-ui, sans-serif";
      ctx.fillText(fmtNum(card.primaryMetric.count), cx + 14, metY);
      ctx.fillStyle = "#64748b";
      ctx.font      = "400 10px system-ui, sans-serif";
      ctx.fillText(card.primaryMetric.label, cx + 14, metY + 16);
    } else {
      ctx.fillStyle = "#334155";
      ctx.font      = "800 28px system-ui, sans-serif";
      ctx.fillText("0", cx + 14, metY);
      ctx.fillStyle = "#334155";
      ctx.font      = "400 10px system-ui, sans-serif";
      ctx.fillText("no events yet", cx + 14, metY + 16);
    }

    // ── 24h / 7d pills ───────────────────────────────────────────
    const pillsY = cy + 105;
    const drawPill = (text: string, px: number, active: boolean) => {
      ctx.font = "600 9px system-ui, sans-serif";
      const pw = ctx.measureText(text).width + 10;
      ctx.fillStyle = active ? "#6366f122" : "#1e293b";
      rr(ctx, px, pillsY, pw, 14, 4);
      ctx.fill();
      ctx.fillStyle = active ? "#818cf8" : "#475569";
      ctx.fillText(text, px + 5, pillsY + 10);
      return pw + 6;
    };
    const p1w = drawPill(`${fmtNum(card.events24h)} / 24h`, cx + 14, card.events24h > 0);
    drawPill(`${fmtNum(card.events7d)} / 7d`, cx + 14 + p1w, card.events7d > 0);

    // ── Last seen ────────────────────────────────────────────────
    ctx.fillStyle = "#475569";
    ctx.font = "400 9px system-ui, sans-serif";
    const lastText = card.lastEventAt ? relTime(card.lastEventAt) : "Never fired";
    ctx.fillText(lastText, cx + 14, cy + CARD_H - 12);

    // ── Bottom accent line ───────────────────────────────────────
    ctx.fillStyle = acc;
    rr(ctx, cx + 14, cy + CARD_H - 5, CARD_W - 28, 2, 1);
    ctx.fill();
  });

  // ── Footer watermark ─────────────────────────────────────────────────────
  ctx.fillStyle = "#1e293b";
  ctx.font = "400 9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`iqpipe · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, W - PAD, H - 10);

  return canvas.toDataURL("image/png");
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function LiveFeedPage() {
  const [cards,       setCards]       = useState<ToolCard[]>([]);
  const [signals,     setSignals]     = useState<SignalEvent[]>([]);
  const [stacks,      setStacks]      = useState<WorkflowStack[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [workspaceId, setWorkspaceId] = useState("");
  const [live,        setLive]        = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snapshot state
  const [snapping,        setSnapping]        = useState(false);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);

  // History modal state
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyDays,    setHistoryDays]    = useState<7 | 30 | 60 | 90>(30);
  const [historyEvents,  setHistoryEvents]  = useState<SignalEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Source tabs ──
  const [sourceTab, setSourceTab] = useState<"all" | "integrations" | "n8n" | "make">("all");
  const [n8nApps,   setN8nApps]   = useState<string[]>([]);
  const [makeApps,  setMakeApps]  = useState<string[]>([]);
  const [n8nAppsLoading,  setN8nAppsLoading]  = useState(false);
  const [makeAppsLoading, setMakeAppsLoading] = useState(false);

  // ── Filters ──
  const [filterEvents, setFilterEvents] = useState<Set<string>>(new Set());
  const [filterApps,   setFilterApps]   = useState<Set<string>>(new Set());
  const [filterStacks, setFilterStacks] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (wsId: string) => {
    if (!wsId) return;
    try {
      const [cardsRes, signalsRes, mapRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/signal-health/tool-cards?workspaceId=${wsId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        fetch(`${API_BASE_URL}/api/signal-health/feed?workspaceId=${wsId}&signalOnly=true&limit=200`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        fetch(`${API_BASE_URL}/api/workflow-map?workspaceId=${wsId}`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
      ]);
      if (cardsRes.ok) {
        const allCards: ToolCard[] = await cardsRes.json();
        setCards(allCards.filter(c => c.tool in TOOL_DOMAINS));
      }
      if (signalsRes.ok) setSignals(await signalsRes.json());
      if (mapRes.ok) {
        const mapData = await mapRes.json();
        setStacks(mapData.stacks ?? []);
      }
      setLastRefresh(new Date());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (workspaceId) { setLoading(true); load(workspaceId); } }, [workspaceId, load]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!live || !workspaceId) return;
    timerRef.current = setInterval(() => load(workspaceId), 15_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [live, workspaceId, load]);

  // ── History fetch ─────────────────────────────────────────────────────────
  const openHistory = async (days: 7 | 30 | 60 | 90) => {
    setHistoryDays(days);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const res = await fetch(
        `${API_BASE_URL}/api/signal-health/feed?workspaceId=${workspaceId}&signalOnly=true&limit=1000&since=${encodeURIComponent(since)}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      if (res.ok) {
        const all: SignalEvent[] = await res.json();
        setHistoryEvents(all.filter(e => e.tool in TOOL_DOMAINS));
      }
    } catch {} finally {
      setHistoryLoading(false);
    }
  };

  // ── Automation app fetchers ───────────────────────────────────────────────

  const fetchN8nApps = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setN8nAppsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        const workflows: { appsUsed: string[] }[] = await res.json();
        const apps = new Set<string>();
        for (const wf of workflows) for (const a of (wf.appsUsed ?? [])) apps.add(a);
        setN8nApps(Array.from(apps).sort());
      }
    } catch {} finally { setN8nAppsLoading(false); }
  }, []);

  const fetchMakeApps = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setMakeAppsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        const scenarios: { appsUsed: string[] }[] = await res.json();
        const apps = new Set<string>();
        for (const sc of scenarios) for (const a of (sc.appsUsed ?? [])) apps.add(a);
        setMakeApps(Array.from(apps).sort());
      }
    } catch {} finally { setMakeAppsLoading(false); }
  }, []);

  // Fetch automation apps on tab switch
  useEffect(() => {
    if (!workspaceId) return;
    if (sourceTab === "n8n"  && n8nApps.length  === 0) fetchN8nApps(workspaceId);
    if (sourceTab === "make" && makeApps.length === 0)  fetchMakeApps(workspaceId);
  }, [sourceTab, workspaceId, n8nApps.length, makeApps.length, fetchN8nApps, fetchMakeApps]);

  // ── Filter logic ──────────────────────────────────────────────────────────

  // Tools that belong to the selected stacks (union across selected stacks)
  const stackToolSet = new Set(
    stacks
      .filter(s => filterStacks.has(s.id))
      .flatMap(s => s.steps.map(step => step.tool).filter(Boolean))
  );

  // Which tool keys pass the app + stack + status filters
  function toolPassesFilters(toolKey: string): boolean {
    if (filterApps.size > 0 && !filterApps.has(toolKey)) return false;
    if (filterStacks.size > 0 && !stackToolSet.has(toolKey)) return false;
    if (filterStatus.size > 0) {
      const card = cards.find(c => c.tool === toolKey);
      if (!card || !filterStatus.has(card.status)) return false;
    }
    return true;
  }

  // Source tab signal filter
  function signalPassesSourceTab(ev: SignalEvent): boolean {
    if (sourceTab === "all") return true;
    if (sourceTab === "n8n") return ev.sourceType === "n8n_workflow";
    if (sourceTab === "make") return ev.sourceType === "make_scenario" || ev.meta?.viaAutomation === "make";
    // integrations: direct webhooks/API, NOT from automation
    return ev.sourceType !== "n8n_workflow" && ev.sourceType !== "make_scenario" && ev.meta?.viaAutomation !== "make";
  }

  // For n8n/make tabs, only show cards for tools used in those automation systems
  const automationTabTools = sourceTab === "n8n" ? new Set(n8nApps) : sourceTab === "make" ? new Set(makeApps) : null;
  const filteredCards = cards.filter(c => {
    if (!toolPassesFilters(c.tool)) return false;
    if (automationTabTools && !automationTabTools.has(c.tool)) return false;
    return true;
  });

  const filteredSignals = signals.filter(ev => {
    if (!signalPassesSourceTab(ev)) return false;
    if (filterEvents.size > 0 && !filterEvents.has(ev.eventType)) return false;
    if (!toolPassesFilters(ev.tool)) return false;
    return true;
  });

  const hasActiveFilter = filterEvents.size > 0 || filterApps.size > 0 || filterStacks.size > 0 || filterStatus.size > 0;
  const clearAll = () => { setFilterEvents(new Set()); setFilterApps(new Set()); setFilterStacks(new Set()); setFilterStatus(new Set()); };

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const buildCaption = () => {
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const highlights = filteredCards
      .filter(c => c.primaryMetric && c.primaryMetric.count > 0)
      .map(c => `${c.label}: ${fmtNum(c.primaryMetric!.count)} ${c.primaryMetric!.label}`)
      .slice(0, 5)
      .join("\n");
    return [
      `📊 GTM Stack snapshot — ${date}`,
      "",
      highlights || "Tracking our GTM stack with iqpipe.",
      "",
      `${filteredCards.length} tools connected · ${fmtNum(totalEvents24h)} events in the last 24h`,
      "",
      "#GTM #SalesOps #RevenueOps #iqpipe",
    ].join("\n");
  };

  const takeSnapshot = async () => {
    setSnapping(true);
    try {
      const dataUrl = await drawCardsToCanvas(filteredCards);
      setSnapshotDataUrl(dataUrl);
    } finally {
      setSnapping(false);
    }
  };

  // ── Build filter option lists ─────────────────────────────────────────────

  const appOptions: FilterOption[] = cards.map(c => ({
    value: c.tool,
    label: c.label,
    sub: c.channel,
    dot: STATUS_CFG[c.status].dot,
  }));

  const stackOptions: FilterOption[] = stacks.map(s => ({
    value: s.id,
    label: s.name,
    sub: `${s.steps.filter(st => st.tool).length} steps`,
  }));

  // ── Summary counts ────────────────────────────────────────────────────────
  const totalEvents24h = cards.reduce((s, c) => s + c.events24h, 0);
  const hasAnyData     = cards.some(c => c.totalEvents > 0) || signals.length > 0;

  // ── Active chip labels ────────────────────────────────────────────────────
  const eventChips = Array.from(filterEvents).map(v => ({
    key: `ev-${v}`, label: SIGNAL_CFG[v]?.label ?? v, onRemove: () => {
      const n = new Set(filterEvents); n.delete(v); setFilterEvents(n);
    },
  }));
  const appChips = Array.from(filterApps).map(v => ({
    key: `app-${v}`, label: cards.find(c => c.tool === v)?.label ?? v, onRemove: () => {
      const n = new Set(filterApps); n.delete(v); setFilterApps(n);
    },
  }));
  const stackChips = Array.from(filterStacks).map(v => ({
    key: `st-${v}`, label: stacks.find(s => s.id === v)?.name ?? v, onRemove: () => {
      const n = new Set(filterStacks); n.delete(v); setFilterStacks(n);
    },
  }));
  const statusChips = Array.from(filterStatus).map(v => ({
    key: `st-${v}`, label: STATUS_CFG[v as keyof typeof STATUS_CFG]?.label ?? v, onRemove: () => {
      const n = new Set(filterStatus); n.delete(v); setFilterStatus(n);
    },
  }));
  const allChips = [...eventChips, ...appChips, ...stackChips, ...statusChips];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white overflow-hidden">

      {snapshotDataUrl && (
        <SnapshotModal
          dataUrl={snapshotDataUrl}
          caption={buildCaption()}
          onClose={() => setSnapshotDataUrl(null)}
        />
      )}

      {/* ── Event History Modal ── */}
      {historyOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm">
          {/* Modal header */}
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <History size={16} className="text-indigo-400"/>
              <div>
                <h2 className="text-sm font-bold text-white">Event History</h2>
                <p className="text-[11px] text-slate-500">All recorded signal events</p>
              </div>
            </div>
            {/* Day range selector */}
            <div className="flex items-center gap-1.5">
              {([7, 30, 60, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => openHistory(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    historyDays === d
                      ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                      : "border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {d}d
                </button>
              ))}
              <button
                onClick={() => setHistoryOpen(false)}
                className="ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-all"
              >
                <X size={12}/> Close
              </button>
            </div>
          </div>

          {/* Modal body */}
          <div className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center h-40 text-slate-600 text-sm gap-2">
                <RefreshCw size={14} className="animate-spin"/> Loading history…
              </div>
            ) : historyEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <p className="text-slate-600 text-sm">No events in the last {historyDays} days</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-2 border-b border-slate-800/40 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600">
                    {historyEvents.length} event{historyEvents.length !== 1 ? "s" : ""} · last {historyDays} days
                  </span>
                </div>
                {historyEvents.map(ev => <SignalRow key={ev.id} event={ev}/>)}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-800/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radio size={18} className="text-indigo-400"/>
          <div>
            <h1 className="text-base font-bold text-white leading-none">Live Feed</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Stack activity overview + high-signal events · refreshes every 15s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalEvents24h > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              {fmtNum(totalEvents24h)} events / 24h
            </span>
          )}
          <button onClick={() => setLive(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              live ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                   : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}/>
            {live ? "Live" : "Paused"}
          </button>
          <button onClick={() => { setLoading(true); load(workspaceId); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition-colors">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""}/>
            Refresh
          </button>
          <span className="text-[11px] text-slate-700 tabular-nums">
            {relTime(lastRefresh.toISOString())}
          </span>
        </div>
      </div>

      {/* ── Source tabs ── */}
      <div className="shrink-0 px-6 border-b border-slate-800/40 flex items-center gap-1">
        {(["all", "integrations", "n8n", "make"] as const).map(tab => {
          const labels: Record<string, string> = { all: "All", integrations: "Integrations", n8n: "n8n", make: "Make.com" };
          const active = sourceTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setSourceTab(tab)}
              className={`relative py-3 px-3 text-xs font-medium transition-colors border-b-2 -mb-px ${
                active
                  ? "text-white border-indigo-500"
                  : "text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-700"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {tab === "n8n" && (
                  <span className="w-4 h-4 rounded overflow-hidden inline-flex items-center justify-center bg-white shrink-0">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=n8n.io`} width={12} height={12} alt="" className="object-contain" />
                  </span>
                )}
                {tab === "make" && (
                  <span className="w-4 h-4 rounded overflow-hidden inline-flex items-center justify-center bg-white shrink-0">
                    <img src={`${API_BASE_URL}/api/proxy/favicon?domain=make.com`} width={12} height={12} alt="" className="object-contain" />
                  </span>
                )}
                {labels[tab]}
                {tab === "n8n" && n8nApps.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] text-slate-500 tabular-nums">
                    {n8nApps.length}
                  </span>
                )}
                {tab === "make" && makeApps.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] text-slate-500 tabular-nums">
                    {makeApps.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Filter bar ── */}
      {hasAnyData && (
        <div className="shrink-0 px-6 py-3 border-b border-slate-800/40 bg-slate-950/80 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={12} className="text-slate-600 shrink-0"/>

            <FilterDropdown
              label="Events"
              options={SIGNAL_EVENT_OPTIONS}
              selected={filterEvents}
              onChange={setFilterEvents}
              accentClass="text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
            />

            <FilterDropdown
              label="Apps"
              options={appOptions}
              selected={filterApps}
              onChange={setFilterApps}
              accentClass="text-sky-300 border-sky-500/40 bg-sky-500/10"
            />

            <FilterDropdown
              label="Stacks"
              options={stackOptions}
              selected={filterStacks}
              onChange={setFilterStacks}
              accentClass="text-violet-300 border-violet-500/40 bg-violet-500/10"
            />

            {/* Status filter chips */}
            <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-slate-800">
              {(["healthy", "warning", "silent", "never"] as const).map(s => {
                const cfg     = STATUS_CFG[s];
                const active  = filterStatus.has(s);
                const toggle  = () => {
                  const n = new Set(filterStatus);
                  active ? n.delete(s) : n.add(s);
                  setFilterStatus(n);
                };
                return (
                  <button
                    key={s}
                    onClick={toggle}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? `${cfg.text} border-current bg-current/10`
                        : "text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {hasActiveFilter && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
              >
                <X size={10}/> Clear all
              </button>
            )}

            {hasActiveFilter && (
              <span className="text-[10px] text-slate-600 ml-1">
                {filteredSignals.length} of {signals.length} signal{signals.length !== 1 ? "s" : ""} shown
              </span>
            )}
          </div>

          {/* Active filter chips */}
          {allChips.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pl-4">
              {allChips.map(chip => (
                <ActiveChip key={chip.key} label={chip.label} onRemove={chip.onRemove}/>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-slate-600 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin"/> Loading…
        </div>
      ) : !hasAnyData ? (
        <div className="flex-1 overflow-y-auto">
          <SeedBanner onSeeded={() => load(workspaceId)}/>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

          {/* ── n8n / Make automation apps ── */}
          {(sourceTab === "n8n" || sourceTab === "make") && (() => {
            const automationApps = sourceTab === "n8n" ? n8nApps : makeApps;
            const isLoading = sourceTab === "n8n" ? n8nAppsLoading : makeAppsLoading;
            const source = sourceTab === "n8n" ? "n8n" : "Make.com";
            const toolsWithData = new Set(cards.map(c => c.tool));
            const appsWithoutCards = automationApps.filter(a => !toolsWithData.has(a));
            if (isLoading) return (
              <div className="px-6 py-4 border-b border-slate-800/40 flex items-center gap-2 text-slate-600 text-xs">
                <RefreshCw size={11} className="animate-spin"/> Loading {source} apps…
              </div>
            );
            if (automationApps.length === 0) return (
              <div className="px-6 py-4 border-b border-slate-800/40">
                <p className="text-[11px] text-slate-600">
                  No {source} {sourceTab === "n8n" ? "workflows" : "scenarios"} connected yet. Head to{" "}
                  <span className="text-indigo-400">Automation Health</span> to connect.
                </p>
              </div>
            );
            return (
              <div className="px-6 py-4 border-b border-slate-800/40">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
                  {source} apps · {automationApps.length} detected
                </p>
                {appsWithoutCards.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-3">
                    {appsWithoutCards.map(slug => (
                      <AutomationAppCard key={slug} slug={slug} hasEvents={false} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Tool KPI cards ── */}
          {(sourceTab === "all" || sourceTab === "integrations" || filteredCards.length > 0) && filteredCards.length > 0 && (
            <div className="px-6 py-4 border-b border-slate-800/40">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                  {sourceTab === "n8n" || sourceTab === "make"
                    ? "Apps with captured events"
                    : "Connected tools · click to expand event breakdown"}
                  {(filterApps.size > 0 || filterStacks.size > 0) && (
                    <span className="ml-2 normal-case text-slate-700">
                      — {filteredCards.length} of {cards.length} shown
                    </span>
                  )}
                </p>
                {(sourceTab === "all" || sourceTab === "integrations") && (
                  <button
                    onClick={takeSnapshot}
                    disabled={snapping}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 font-medium transition-all disabled:opacity-50"
                  >
                    {snapping
                      ? <RefreshCw size={11} className="animate-spin"/>
                      : <Camera size={11}/>
                    }
                    {snapping ? "Capturing…" : "Take a snapshot"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredCards.map(card => <ToolKpiCard key={card.tool} card={card}/>)}
              </div>
            </div>
          )}

          {/* ── Signal events ── */}
          <div>
            <div className="px-6 py-3 border-b border-slate-800/40 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                  Signal events · last 20
                  {sourceTab !== "all" && (
                    <span className="ml-2 normal-case text-slate-700 font-normal">
                      — {sourceTab === "n8n" ? "n8n only" : sourceTab === "make" ? "Make.com only" : "direct integrations only"}
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-700 mt-0.5">
                  Replies · meetings · deals · clicks · unsubscribes — the events that matter
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 tabular-nums">
                  {Math.min(filteredSignals.length, 20)}{hasActiveFilter ? ` / ${signals.length}` : ""} event{signals.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => openHistory(30)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 font-medium transition-all"
                >
                  <History size={11}/> Event History
                </button>
              </div>
            </div>

            {filteredSignals.length === 0 ? (
              <div className="px-6 py-12 text-center">
                {hasActiveFilter ? (
                  <>
                    <p className="text-slate-600 text-sm">No events match the active filters</p>
                    <button onClick={clearAll} className="mt-3 text-[11px] text-indigo-400 hover:text-indigo-300 underline transition-colors">
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-slate-600 text-sm">No signal events yet</p>
                    <p className="text-slate-700 text-xs mt-1">
                      Volume events (imports, sends, enrichments) are shown in the tool cards above.
                      <br/>Signal events appear here when leads reply, book meetings, click links, or unsubscribe.
                    </p>
                  </>
                )}
              </div>
            ) : (
              filteredSignals.slice(0, 20).map(ev => <SignalRow key={ev.id} event={ev}/>)
            )}

            {filteredSignals.length > 20 && (
              <div className="px-6 py-4 text-center border-t border-slate-800/40">
                <button
                  onClick={() => openHistory(30)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-all"
                >
                  <History size={12}/> View full event history — {filteredSignals.length - 20} more
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
