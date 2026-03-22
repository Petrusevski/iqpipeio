import { useState, useEffect, useMemo } from "react";
import { useIntegrations } from "../context/IntegrationsContext";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../../config";
import {
  Zap, AlertCircle, Activity, ArrowRight,
  Search, Sparkles, Send, Database, CreditCard, CheckCircle2,
  XCircle, Clock, WifiOff, GitBranch,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type GTMEventType =
  | "contact_sourced" | "contact_enriched"
  | "email_sent" | "email_opened" | "email_clicked" | "email_replied"
  | "linkedin_connected" | "linkedin_message_sent" | "linkedin_replied"
  | "meeting_booked" | "deal_created" | "deal_won" | "deal_lost" | "payment_received";

type ToolCategory = "prospecting" | "enrichment" | "outreach" | "crm" | "billing";

type GTMEvent = {
  id: string;
  tool: string;
  toolDisplayName: string;
  toolCategory: ToolCategory;
  eventType: GTMEventType;
  contactName: string;
  company: string;
  score: number;
  timestamp: string;
  summary: string;
  isNew?: boolean;
};

type ToolHealth = {
  id: string;
  displayName: string;
  category: ToolCategory;
  status: "active" | "idle" | "error";
  eventsToday: number;
  efficiencyScore: number;
};

type SilentToolInfo = {
  toolId: string;
  hoursSinceLast: number | null;
  lastSeenAt: string | null;
  suggestions: string[];
};

// ─── Tool Metadata ────────────────────────────────────────────────────────────

const TOOL_DISPLAY_MAP: Record<string, string> = {
  clay: "Clay", apollo: "Apollo", heyreach: "HeyReach", lemlist: "Lemlist",
  instantly: "Instantly", smartlead: "Smartlead", hubspot: "HubSpot CRM",
  pipedrive: "Pipedrive", closecrm: "Close CRM", stripe: "Stripe",
  paddle: "Paddle", chargebee: "Chargebee", clearbit: "Clearbit",
  lusha: "Lusha", dropcontact: "Dropcontact", zoominfo: "ZoomInfo", pdl: "People Data Labs",
  phantombuster: "PhantomBuster", cognism: "Cognism", hunter: "Hunter.io",
  salesforce: "Salesforce", attio: "Attio", airtable: "Airtable",
  outreach: "Outreach", replyio: "Reply.io", lemonsqueezy: "LemonSqueezy",
};

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  clay: "prospecting", apollo: "prospecting", zoominfo: "prospecting", pdl: "prospecting",
  phantombuster: "prospecting",
  clearbit: "enrichment", lusha: "enrichment", dropcontact: "enrichment",
  cognism: "enrichment", hunter: "enrichment",
  heyreach: "outreach", lemlist: "outreach", instantly: "outreach", smartlead: "outreach",
  outreach: "outreach", replyio: "outreach",
  hubspot: "crm", pipedrive: "crm", closecrm: "crm", salesforce: "crm",
  attio: "crm", airtable: "crm",
  stripe: "billing", paddle: "billing", chargebee: "billing", lemonsqueezy: "billing",
};



// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ToolCategory, { icon: any; color: string; bg: string; label: string }> = {
  prospecting: { icon: Search,     color: "text-cyan-400",    bg: "bg-cyan-500/10",    label: "Prospecting" },
  enrichment:  { icon: Sparkles,   color: "text-purple-400",  bg: "bg-purple-500/10",  label: "Enrichment"  },
  outreach:    { icon: Send,       color: "text-orange-400",  bg: "bg-orange-500/10",  label: "Outreach"    },
  crm:         { icon: Database,   color: "text-indigo-400",  bg: "bg-indigo-500/10",  label: "CRM"         },
  billing:     { icon: CreditCard, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Billing"     },
};


// ─── Sub-components ──────────────────────────────────────────────────────────

function ToolStatusDot({ status }: { status: ToolHealth["status"] }) {
  if (status === "active") return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />;
  if (status === "idle")   return <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />;
  return                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />;
}

function EfficiencyBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, color, bg,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${bg}`}>
        <Icon size={18} className={color} />
      </div>
      <div>
        <motion.div
          key={String(value)}
          initial={{ y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className="text-xl font-bold text-white"
        >
          {value}
        </motion.div>
        <div className="text-[11px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { connectedTools } = useIntegrations();
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | "all">("all");
  const [events, setEvents]               = useState<GTMEvent[]>([]);
  const [toolCounts, setToolCounts]       = useState<Record<string, number>>({});
  const [silentTools, setSilentTools]     = useState<Record<string, SilentToolInfo>>({});
  const [lastRefresh, setLastRefresh]     = useState<Date>(new Date());
  const [activeCampaigns, setActiveCampaigns] = useState<number>(0);

  // ── Data loader (called on mount and every 30 s) ──
  useEffect(() => {
    let workspaceId: string | null = null;

    async function loadLiveData() {
      try {
        // Resolve workspace ID once, reuse on subsequent refreshes
        if (!workspaceId) {
          const token = localStorage.getItem("iqpipe_token");
          const wsRes = await fetch(`${API_BASE_URL}/api/workspaces/primary`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!wsRes.ok) return;
          workspaceId = (await wsRes.json()).id;
        }

        // Tool event counts for today
        const dashRes = await fetch(`${API_BASE_URL}/api/dashboard?workspaceId=${workspaceId}`);
        if (dashRes.ok) {
          const dash = await dashRes.json();
          if (dash.toolCountsToday) setToolCounts(dash.toolCountsToday);
        }

        // Recent activity events
        const actRes = await fetch(`${API_BASE_URL}/api/activity?workspaceId=${workspaceId}&limit=20`);
        if (actRes.ok) {
          const body = await actRes.json();
          const list: any[] = Array.isArray(body) ? body : (body.events ?? []);
          const mapped: GTMEvent[] = list.map((a: any) => ({
            id: a.id,
            tool: a.tool || "unknown",
            toolDisplayName: a.toolDisplayName || a.tool || "Unknown",
            toolCategory: (a.toolCategory as ToolCategory) || "prospecting",
            eventType: (a.type as GTMEventType) || "contact_sourced",
            contactName: a.contactName || "Unknown",
            company: a.company || "",
            score: a.score ?? 25,
            timestamp: a.ts
              ? new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "—",
            summary: a.summary || a.type || "Activity",
          }));
          if (mapped.length > 0) setEvents(mapped);
        }

        // Active A/B campaigns
        const expRes = await fetch(`${API_BASE_URL}/api/experiments?workspaceId=${workspaceId}`);
        if (expRes.ok) {
          const experiments: any[] = await expRes.json();
          const count = experiments.filter(e =>
            e.status === "active" || e.status === "running"
          ).length;
          setActiveCampaigns(count);
        }

        setLastRefresh(new Date());
      } catch (err) {
        console.error("Dashboard load error:", err);
      }
    }

    async function loadSilenceCheck() {
      if (!workspaceId) return;
      try {
        const token = localStorage.getItem("iqpipe_token");
        const res = await fetch(`${API_BASE_URL}/api/integrations/silence-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ workspaceId }),
        });
        if (res.ok) {
          const { silentTools: list } = await res.json();
          if (Array.isArray(list)) {
            const map: Record<string, SilentToolInfo> = {};
            for (const t of list) map[t.toolId] = t;
            setSilentTools(map);
          }
        }
      } catch { /* silent */ }
    }

    // Initial load
    loadLiveData().then(loadSilenceCheck);

    // Refresh live data every 30 seconds
    const liveInterval = setInterval(loadLiveData, 30_000);
    // Silence check every 10 minutes (creates notifications, less frequent)
    const silenceInterval = setInterval(loadSilenceCheck, 10 * 60_000);

    return () => {
      clearInterval(liveInterval);
      clearInterval(silenceInterval);
    };
  }, []);

  const visibleToolHealth = useMemo<ToolHealth[]>(() => {
    return Array.from(connectedTools)
      .filter(id => TOOL_DISPLAY_MAP[id])
      .map(id => {
        const category = TOOL_CATEGORY_MAP[id] ?? "prospecting";
        const eventsToday = toolCounts[id] ?? 0;
        // A connected tool is always "active" — the event count shows activity level.
        // "Idle" only shows when there is a detected silence alarm (handled separately).
        return {
          id,
          displayName: TOOL_DISPLAY_MAP[id],
          category,
          status: "active" as const,
          eventsToday,
          efficiencyScore: Math.min(100, 40 + eventsToday * 3),
        } satisfies ToolHealth;
      });
  }, [connectedTools, toolCounts]);

  const displayedEvents = events.filter(e => connectedTools.has(e.tool));

  const activeTools   = visibleToolHealth.filter(t => t.status === "active").length;
  const totalFromConnected = Object.entries(toolCounts)
    .filter(([id]) => connectedTools.has(id))
    .reduce((s, [, n]) => s + n, 0);

  const noToolsConnected = connectedTools.size === 0;

  const categories: { id: ToolCategory | "all"; label: string }[] = [
    { id: "all",         label: "All Tools"   },
    { id: "prospecting", label: "Prospecting" },
    { id: "enrichment",  label: "Enrichment"  },
    { id: "outreach",    label: "Outreach"    },
    { id: "crm",         label: "CRM"         },
    { id: "billing",     label: "Billing"     },
  ];

  const filteredTools = (categoryFilter === "all"
    ? visibleToolHealth
    : visibleToolHealth.filter(t => t.category === categoryFilter));

  return (
    <div className="pb-10">
      <PageHeader
        title="GTM Signal Center"
        subtitle="Events from every connected tool are recorded, standardized, and scored in real time."
      />

      {/* ── KPI Row ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <KpiCard label="Events today" value={noToolsConnected ? "—" : totalFromConnected.toLocaleString()} icon={Activity}   color="text-indigo-400"  bg="bg-indigo-500/10"  />
        <KpiCard label="Active tools" value={noToolsConnected ? "0 / 0" : `${activeTools} / ${visibleToolHealth.length}`} icon={Zap} color="text-emerald-400" bg="bg-emerald-500/10" />
        <KpiCard label="Campaigns"    value={activeCampaigns.toString()}                                   icon={GitBranch}  color="text-violet-400"  bg="bg-violet-500/10" />
      </section>

      {/* ── Tool Health Grid ── */}
      <section className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Connected Tool Status</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Live health and efficiency of each integrated GTM tool.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  categoryFilter === c.id
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                    : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {noToolsConnected && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 py-14 flex flex-col items-center gap-3">
            <Zap size={28} className="text-slate-700" />
            <p className="text-sm text-slate-400 font-medium">No tools connected yet</p>
            <p className="text-xs text-slate-600 max-w-xs text-center">Connect your GTM stack to start seeing live tool health and signal data.</p>
            <a href="/integrations" className="mt-1 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-xs text-indigo-300 hover:bg-indigo-600/30 transition-all">Go to Integrations →</a>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredTools.map(tool => {
            const catCfg      = CATEGORY_CONFIG[tool.category];
            const CatIcon     = catCfg.icon;
            const statusLabel = tool.status === "active" ? "Active" : tool.status === "idle" ? "Idle" : "Error";
            const eventsToday = toolCounts[tool.id] ?? tool.eventsToday;

            return (
              <motion.div
                key={tool.id}
                transition={{ duration: 2.0, ease: [0.4, 0, 0.2, 1] }}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${catCfg.bg}`}>
                      <CatIcon size={14} className={catCfg.color} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{tool.displayName}</div>
                      <div className={`text-[10px] ${catCfg.color}`}>{catCfg.label}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ToolStatusDot status={tool.status} />
                    <span className={`text-[10px] ${
                      tool.status === "active" ? "text-emerald-400" :
                      tool.status === "idle"   ? "text-amber-400"   : "text-rose-400"
                    }`}>{statusLabel}</span>
                  </div>
                </div>

                {(() => {
                  const silence = silentTools[tool.id];
                  if (tool.status === "error") {
                    return (
                      <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-rose-900/20 border border-rose-800/50">
                        <AlertCircle size={12} className="text-rose-400 shrink-0" />
                        <span className="text-[10px] text-rose-300">Connection error — check credentials</span>
                      </div>
                    );
                  }
                  if (eventsToday > 0) {
                    return (
                      <>
                        <div className="flex justify-between text-[11px] mb-1.5 mt-2">
                          <span className="text-slate-400">Efficiency</span>
                          <span className="text-slate-200 font-mono font-medium">{tool.efficiencyScore}%</span>
                        </div>
                        <EfficiencyBar score={tool.efficiencyScore} />
                        <div className="mt-3 flex justify-between items-center text-[11px]">
                          <span className="text-slate-500">Events today</span>
                          <motion.span
                            key={eventsToday}
                            initial={{ y: -6, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 22 }}
                            className="font-semibold text-slate-200"
                          >
                            {eventsToday.toLocaleString()}
                          </motion.span>
                        </div>
                      </>
                    );
                  }
                  if (silence) {
                    const label = silence.hoursSinceLast === null
                      ? "Never received events"
                      : `Silent for ${silence.hoursSinceLast}h`;
                    return (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <WifiOff size={11} className="text-amber-400 shrink-0" />
                          <span className="text-[10px] font-semibold text-amber-300">{label}</span>
                        </div>
                        <ul className="space-y-1 pl-0.5">
                          {silence.suggestions.slice(0, 3).map((s, i) => (
                            <li key={i} className="text-[10px] text-amber-200/70 leading-snug flex gap-1">
                              <span className="shrink-0 text-amber-500">·</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }
                  return <div className="mt-3 text-[11px] text-slate-600">No events recorded today</div>;
                })()}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Live Event Feed + Schema Preview ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Live Feed */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Live Event Feed</h2>
              <p className="text-[11px] text-slate-400">Standardized events from all connected tools, scored in real time.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500">
                Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
              <a href="/events" className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors">
                View all <ArrowRight size={12} />
              </a>
            </div>
          </div>

          <div className="space-y-2">
            {noToolsConnected && (
              <div className="py-10 flex flex-col items-center gap-2 text-center">
                <Activity size={22} className="text-slate-700" />
                <p className="text-xs text-slate-500">Events will appear here once you connect your tools.</p>
                <a href="/integrations" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Connect tools →</a>
              </div>
            )}
            <AnimatePresence initial={false}>
              {displayedEvents.slice(0, 8).map(event => {
                const catCfg = CATEGORY_CONFIG[event.toolCategory];
                const CatIcon = catCfg.icon;

                return (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 340, damping: 26 }}
                    className="flex items-center gap-3 p-3 rounded-xl border transition-colors border-slate-800 bg-slate-950 hover:border-slate-700"
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${catCfg.bg}`}>
                      <CatIcon size={13} className={catCfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-semibold text-slate-100 truncate">{event.contactName}</span>
                        <span className="text-[10px] text-slate-500 truncate">{event.company}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{event.summary}</div>
                    </div>
                    <div className="shrink-0">
                      <span className="text-[10px] text-slate-500">{event.timestamp}</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Schema + Score Legend */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-100 mb-1">Unified Event Schema</h2>
            <p className="text-[11px] text-slate-400 mb-4">Every event is normalized to this standard structure regardless of source tool.</p>
            <div className="space-y-2 font-mono text-[11px]">
              {[
                { field: "id",          type: "uuid",     note: "Unique event identifier" },
                { field: "tool",        type: "string",   note: "Source integration"      },
                { field: "eventType",   type: "enum",     note: "14 standardized types"   },
                { field: "contactName", type: "string",   note: "Resolved contact"        },
                { field: "company",     type: "string",   note: "Resolved account"        },
                { field: "timestamp",   type: "ISO 8601", note: "When it happened"        },
                { field: "summary",     type: "string",   note: "Human-readable event"    },
              ].map(row => (
                <div key={row.field} className="flex items-start gap-2">
                  <span className="text-indigo-400 w-24 sm:w-28 shrink-0">{row.field}</span>
                  <span className="text-amber-300/70 w-12 sm:w-16 shrink-0">{row.type}</span>
                  <span className="text-slate-500 text-[10px] leading-tight">{row.note}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">Tool Status Summary</h2>
            <div className="space-y-2">
              {[
                { label: "Active", count: visibleToolHealth.filter(t => t.status === "active").length, icon: CheckCircle2, color: "text-emerald-400" },
                { label: "Idle",   count: visibleToolHealth.filter(t => t.status === "idle").length,   icon: Clock,        color: "text-amber-400"  },
                { label: "Error",  count: visibleToolHealth.filter(t => t.status === "error").length,  icon: XCircle,      color: "text-rose-400"   },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Icon size={13} className={s.color} />
                      <span className="text-slate-300">{s.label}</span>
                    </div>
                    <span className={`font-mono font-semibold ${s.color}`}>{s.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
