/**
 * WorkflowComparePage — GTM Alpha Score head-to-head comparison
 *
 * Scoring is fully backend-driven via GET /api/workflow-score.
 * The backend implements the 4-pillar weighted GTM Alpha Score:
 *   Reliability (30%) · Throughput (25%) · Connectivity (20%) · Criticality (25%)
 * plus Leakage Value (estimated revenue lost from failed events).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trophy, TrendingUp, RefreshCw, ChevronDown,
  Bot, Layers, AlertTriangle, CheckCircle2,
  BarChart3, Zap, ShieldCheck,
  Network, Star, ArrowUpRight, Info, Download, FileSpreadsheet, X,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days",
  "90d": "Last 90 days", "all": "All time",
};

interface WorkflowMeta {
  id: string; n8nId: string; name: string; active: boolean;
  appsUsed: string[]; nodeCount: number; triggerType: string; execSyncEnabled: boolean;
}
interface ScenarioMeta {
  id: string; makeId: string; name: string; active: boolean;
  appsUsed: string[]; moduleCount: number; triggerType: string; execSyncEnabled: boolean;
}

// Selectable item in the card grid
interface SelectableWorkflow {
  internalId: string;   // cuid from DB — used for UI selection state
  platformId: string;   // n8nId or makeId — passed to backend
  platform:   "n8n" | "make";
  name:       string;
  active:     boolean;
  appsUsed:   string[];
  nodeCount:  number;
  triggerType: string;
  execSyncEnabled: boolean;
}

// Backend /api/workflow-score response types
interface PillarScores {
  reliability:  number;
  throughput:   number;
  connectivity: number;
  criticality:  number;
}
interface LeakageBreakdown {
  eventType:     string;
  failedCount:   number;
  conversionProb: number;
  estimatedLoss: number;
}
interface ScoredWorkflow {
  id:          string;   // platformId (n8nId or makeId)
  name:        string;
  platform:    "n8n" | "make";
  active:      boolean;
  triggerType: string;
  appsUsed:    string[];
  nodeCount:   number;
  metrics: {
    reliability:  { done: number; failed: number; total: number; rawScore: number };
    throughput:   { outcomeEvents: number; processEvents: number; outcomeRate: number; rawScore: number };
    connectivity: { appCount: number; highValueApps: string[]; rawScore: number };
    criticality:  { eventBreakdown: Record<string, number>; rawScore: number };
  };
  pillars:    PillarScores;
  alphaScore: number;
  grade:      string;
  leakage: {
    totalLoss: number;
    currency:  string;
    breakdown: LeakageBreakdown[];
  };
  lastEventAt: string | null;
}
interface ScoreResponse {
  scoring_model: {
    weights: Record<string, number>;
    leakage_config: { acv: number; currency: string };
  };
  workflows: ScoredWorkflow[];
  winner:    { id: string; name: string; alphaScore: number; grade: string } | null;
  comparison: Record<string, string> | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const token = () => localStorage.getItem("iqpipe_token") ?? "";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


const GRADE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  A: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  B: { color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30"  },
  C: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30"   },
  D: { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30"  },
  F: { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30"    },
};

const PILLAR_META = [
  { key: "reliability",  label: "Reliability",           icon: ShieldCheck,  weight: "30%", desc: "Success rate of processed events"      },
  { key: "throughput",   label: "Throughput",             icon: TrendingUp,   weight: "25%", desc: "Outcome event ratio + relative volume" },
  { key: "connectivity", label: "Connectivity Depth",     icon: Network,      weight: "20%", desc: "App diversity + high-value app bonus"  },
  { key: "criticality",  label: "Business Criticality",   icon: Star,         weight: "25%", desc: "Event-type weighted GTM importance"    },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const s = GRADE_STYLE[grade] ?? GRADE_STYLE.F;
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${s.color} ${s.bg} border ${s.border}`}>
      {grade}
    </span>
  );
}

function PillarBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" :
    value >= 60 ? "bg-indigo-500"  :
    value >= 40 ? "bg-amber-500"   : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-400">{value}</span>
    </div>
  );
}

// ─── App domain / logo helpers ───────────────────────────────────────────────

const APP_DOMAIN: Record<string, string> = {
  apollo:              "apollo.io",
  clay:                "clay.com",
  heyreach:            "heyreach.io",
  instantly:           "instantly.ai",
  hubspot:             "hubspot.com",
  stripe:              "stripe.com",
  zoominfo:            "zoominfo.com",
  "people data labs":  "peopledatalabs.com",
  smartlead:           "smartlead.ai",
  lemlist:             "lemlist.com",
  chargebee:           "chargebee.com",
  slack:               "slack.com",
  outreach:            "outreach.io",
  clearbit:            "clearbit.com",
  calendly:            "calendly.com",
  salesforce:          "salesforce.com",
  pipedrive:           "pipedrive.com",
  lusha:               "lusha.com",
  attio:               "attio.com",
  phantombuster:       "phantombuster.com",
  hunter:              "hunter.io",
  linkedin:            "linkedin.com",
  gmail:               "gmail.com",
  notion:              "notion.so",
  airtable:            "airtable.com",
  intercom:            "intercom.com",
  activecampaign:      "activecampaign.com",
  mailchimp:           "mailchimp.com",
  typeform:            "typeform.com",
  make:                "make.com",
  n8n:                 "n8n.io",
};

function appDomain(name: string): string {
  return APP_DOMAIN[name.toLowerCase()] ?? name.toLowerCase().replace(/\s+/g, "") + ".com";
}

// ─── SVG export helper ────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── SVG → PNG helper ─────────────────────────────────────────────────────────

function svgToPng(svgStr: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url     = URL.createObjectURL(svgBlob);
    const img     = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = w * 2;   // 2× for retina
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("toBlob failed")), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG load failed")); };
    img.src = url;
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowComparePage() {
  const navigate = useNavigate();

  const [period,         setPeriod]         = useState<Period>("30d");
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [wsId,         setWsId]         = useState<string | null>(null);
  const [loadingWs,    setLoadingWs]    = useState(true);
  const [loadingN8n,   setLoadingN8n]   = useState(false);
  const [loadingMake,  setLoadingMake]  = useState(false);
  const [loadingScore, setLoadingScore] = useState(false);

  const [n8nWorkflows,  setN8nWorkflows]  = useState<WorkflowMeta[]>([]);
  const [makeScenarios, setMakeScenarios] = useState<ScenarioMeta[]>([]);
  const [scoreData,     setScoreData]     = useState<ScoreResponse | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set()); // internalIds

  // More modal — unlimited Excel export
  const [showMoreModal,   setShowMoreModal]   = useState(false);
  const [modalSelected,   setModalSelected]   = useState<Set<string>>(new Set()); // internalIds
  const [exportingXlsx,   setExportingXlsx]   = useState(false);

  const scoreAbortRef = useRef<AbortController | null>(null);

  // ── Workspace ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingWs(true);
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWsId(d.id); })
      .catch(() => {})
      .finally(() => setLoadingWs(false));
  }, []);

  // ── Fetch workflow lists ──────────────────────────────────────────────────────
  const fetchN8n = useCallback(() => {
    if (!wsId) return;
    setLoadingN8n(true);
    fetch(`${API_BASE_URL}/api/n8n-connect/workflows?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setN8nWorkflows(d); })
      .catch(() => {})
      .finally(() => setLoadingN8n(false));
  }, [wsId]);

  const fetchMake = useCallback(() => {
    if (!wsId) return;
    setLoadingMake(true);
    fetch(`${API_BASE_URL}/api/make-connect/scenarios?workspaceId=${wsId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setMakeScenarios(d); })
      .catch(() => {})
      .finally(() => setLoadingMake(false));
  }, [wsId]);

  useEffect(() => {
    if (wsId) { fetchN8n(); fetchMake(); }
  }, [wsId, fetchN8n, fetchMake]);

  // ── Build unified selectable list ────────────────────────────────────────────
  const allSelectables: SelectableWorkflow[] = [
    ...n8nWorkflows.map(m => ({
      internalId:      m.id,
      platformId:      m.n8nId,
      platform:        "n8n" as const,
      name:            m.name,
      active:          m.active,
      appsUsed:        m.appsUsed ?? [],
      nodeCount:       m.nodeCount,
      triggerType:     m.triggerType,
      execSyncEnabled: m.execSyncEnabled,
    })),
    ...makeScenarios.map(s => ({
      internalId:      s.id,
      platformId:      s.makeId,
      platform:        "make" as const,
      name:            s.name,
      active:          s.active,
      appsUsed:        s.appsUsed ?? [],
      nodeCount:       s.moduleCount,
      triggerType:     s.triggerType,
      execSyncEnabled: s.execSyncEnabled,
    })),
  ];


  // Map internalId → platformId for backend calls
  const selInternal  = allSelectables.filter(w => selected.has(w.internalId));
  const selPlatformIds = selInternal.map(w => w.platformId);

  // ── Fetch backend scores when ≥2 selected ─────────────────────────────────
  useEffect(() => {
    if (!wsId || selPlatformIds.length < 2) {
      setScoreData(null);
      return;
    }

    // Cancel any in-flight request
    scoreAbortRef.current?.abort();
    scoreAbortRef.current = new AbortController();

    setLoadingScore(true);
    // Use platform=all so the backend resolves n8n and make IDs from their
    // respective tables — works for single-platform and mixed selections
    const params = new URLSearchParams({
      workspaceId: wsId,
      period,
      acv:         "1",
      platform:    "all",
    });
    selPlatformIds.forEach(id => params.append("ids[]", id));

    fetch(`${API_BASE_URL}/api/workflow-score?${params}`, {
      headers: { Authorization: `Bearer ${token()}` },
      signal: scoreAbortRef.current.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setScoreData(d as ScoreResponse); })
      .catch(e => { if (e.name !== "AbortError") console.error("[workflow-score]", e); })
      .finally(() => setLoadingScore(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, selected, period]);

  // ── Selection handlers ───────────────────────────────────────────────────────
  function toggleSelect(internalId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(internalId)) { next.delete(internalId); }
      else if (next.size < 4)   { next.add(internalId); }
      return next;
    });
  }

  function selectAll() {
    // Compare across both platforms — backend accepts platform=all with mixed IDs
    setSelected(new Set(allSelectables.slice(0, 4).map(w => w.internalId)));
  }

  function toggleModalSelect(internalId: string) {
    setModalSelected(prev => {
      const next = new Set(prev);
      if (next.has(internalId)) next.delete(internalId);
      else next.add(internalId);
      return next;
    });
  }

  async function exportXlsx() {
    if (!wsId || modalSelected.size === 0) return;
    setExportingXlsx(true);
    try {
      // Resolve internalId → platformId for the selected items
      const platformIds = allSelectables
        .filter(w => modalSelected.has(w.internalId))
        .map(w => w.platformId);

      const params = new URLSearchParams({ workspaceId: wsId, period, platform: "all" });
      platformIds.forEach(id => params.append("ids[]", id));

      const res = await fetch(`${API_BASE_URL}/api/workflow-score/export-xlsx?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `gtm-compare-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("[export-xlsx]", e);
    } finally {
      setExportingXlsx(false);
    }
  }

  // ── Score data helpers ───────────────────────────────────────────────────────
  // Map platformId → ScoredWorkflow for quick lookup
  const scoredMap: Record<string, ScoredWorkflow> = {};
  (scoreData?.workflows ?? []).forEach(w => { scoredMap[w.id] = w; });

  const scoredItems: ScoredWorkflow[] = selPlatformIds
    .map(id => scoredMap[id])
    .filter(Boolean);

  const winnerPlatformId = scoreData?.winner?.id ?? null;

  function bestPlatformId(key: keyof PillarScores): string | null {
    return scoreData?.comparison?.[`best_${key}`] ?? null;
  }

  function pillarCellClass(wfPlatformId: string, pillarKey: keyof PillarScores): string {
    const best = bestPlatformId(pillarKey);
    if (wfPlatformId === best) return "text-emerald-400 font-semibold";
    return "text-slate-300";
  }

  // ── States ───────────────────────────────────────────────────────────────────
  const isLoadingLists  = loadingWs || loadingN8n || loadingMake;
  const noConnection    = !isLoadingLists && allSelectables.length === 0;
  const showEmptySelect = selected.size < 2;
  const showMatrix      = selected.size >= 2;

  // ─── SVG Export ──────────────────────────────────────────────────────────────

  async function exportSVG() {
    if (!scoreData || scoredItems.length < 2) return;

    // Prefetch all favicons + logo as base64 data URLs so they embed in the SVG
    const allApps = [...new Set(scoredItems.flatMap(wf => wf.appsUsed))];
    const faviconMap: Record<string, string | null> = {};
    const [logoB64] = await Promise.all([
      fetchAsBase64(`${window.location.origin}/logo.png`),
      ...allApps.map(async app => {
        faviconMap[app] = await fetchAsBase64(
          `${API_BASE_URL}/api/proxy/favicon?domain=${appDomain(app)}`,
        );
      }),
    ]);

    const n   = scoredItems.length;
    const LW  = 178;   // label column width
    const CW  = 208;   // data column width per workflow
    const PX  = 22;    // outer horizontal padding
    const PY  = 22;    // outer vertical padding
    const IP  = 14;    // inner cell padding
    const W   = PX * 2 + LW + CW * n;

    // Color palette (dark theme)
    const C = {
      bg:      "#0f172a", card:    "#111827",
      border:  "#1e293b", border2: "#334155",
      white:   "#f8fafc", slate3:  "#94a3b8",
      slate5:  "#64748b", slate7:  "#334155",
      emerald: "#34d399", indigo:  "#818cf8",
      amber:   "#fbbf24", orange:  "#fb923c",
      rose:    "#fb7185",
    };

    const GRADE_CLR: Record<string, string> = {
      A: C.emerald, B: C.indigo, C: C.amber, D: C.orange, F: C.rose,
    };

    const barColor = (v: number) =>
      v >= 80 ? "#10b981" : v >= 60 ? "#6366f1" : v >= 40 ? "#f59e0b" : "#f43f5e";

    // SVG primitive helpers
    const Rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}"/>`;

    const Tx = (x: number, y: number, txt: string, size: number, fill: string,
      weight = "400", anchor = "start") =>
      `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(txt)}</text>`;

    const HLine = (x1: number, y1: number, x2: number, y2: number, stroke = C.border, sw = 1) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;

    const VLine = (x: number, y1: number, y2: number) =>
      HLine(x, y1, x, y2, C.border, 0.5);

    const Bar = (x: number, y: number, val: number, bw = 94, bh = 5) => `
      ${Rect(x, y, bw, bh, C.border, 2)}
      ${Rect(x, y, Math.round(bw * val / 100), bh, barColor(val), 2)}`;

    const GradeBadge = (cx: number, cy: number, grade: string) => {
      const col = GRADE_CLR[grade] ?? C.rose;
      return `<circle cx="${cx}" cy="${cy}" r="13" fill="${col}20" stroke="${col}60" stroke-width="1"/>
      <text x="${cx}" y="${cy + 5}" font-size="12" fill="${col}" font-weight="700" text-anchor="middle">${grade}</text>`;
    };

    const colX = (i: number) => PX + LW + i * CW;

    const elems: string[] = [];
    let y = PY;

    // ── Title bar
    const TH = 52;
    elems.push(Rect(PX, y, W - 2 * PX, TH, C.card, 12));
    if (logoB64) {
      elems.push(`<image href="${logoB64}" x="${PX + IP}" y="${y + 8}" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>`);
      elems.push(Tx(PX + IP + 44, y + 22, "iqpipe", 13, C.indigo, "700"));
      elems.push(Tx(PX + IP + 44, y + 38, "GTM Alpha Score — Workflow Comparison", 10, C.slate5));
    } else {
      elems.push(Tx(PX + IP, y + 18, "iqpipe", 13, C.indigo, "700"));
      elems.push(Tx(PX + IP, y + 35, "GTM Alpha Score — Workflow Comparison", 10, C.slate5));
    }
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    elems.push(Tx(W - PX - IP, y + 30, dateStr, 10, C.slate7, "400", "end"));
    y += TH;

    // ── Header row (per-workflow columns)
    const HH = 92;
    elems.push(Rect(PX, y, LW, HH, "#0d1526"));
    elems.push(Tx(PX + IP, y + HH / 2 + 4, "GTM METRIC", 9, C.slate5, "600"));

    for (let i = 0; i < n; i++) {
      const wf  = scoredItems[i];
      const isW = wf.id === winnerPlatformId;
      const x0  = colX(i);
      const gc  = GRADE_CLR[wf.grade] ?? C.rose;

      if (isW) elems.push(Rect(x0, y, CW, HH, "#1e1b4b28"));
      elems.push(Rect(x0 + 6, y + 6, CW - 12, HH - 12, isW ? "#1e1b4b40" : "#0f172050", 8));
      elems.push(GradeBadge(x0 + IP + 13, y + 30, wf.grade));
      elems.push(`<text x="${x0 + IP + 32}" y="${y + 42}" font-size="24" fill="${gc}" font-weight="900">${wf.alphaScore}<tspan font-size="9" fill="${C.slate7}" dy="-8"> / 100</tspan></text>`);

      const maxLen  = Math.floor((CW - IP * 2) / 6.5);
      const safeName = wf.name.length > maxLen ? wf.name.slice(0, maxLen - 1) + "\u2026" : wf.name;
      elems.push(Tx(x0 + IP, y + 60, safeName, 10, C.white, "500"));
      elems.push(Tx(x0 + IP, y + 74, wf.platform === "n8n" ? "n8n" : "Make.com", 8,
        wf.platform === "n8n" ? C.orange : "#c084fc"));

      if (isW) {
        elems.push(Rect(x0 + CW - 62, y + 6, 56, 16, "#92400e28", 8));
        elems.push(Tx(x0 + CW - 34, y + 18, "Best Stack", 8, C.amber, "600", "middle"));
      }
    }
    elems.push(HLine(PX, y + HH, W - PX, y + HH));
    y += HH;

    // ── Apps in Flow row  (favicon icons, single row, fits within column)
    const IC   = 20;   // icon container size (square)
    const IGAP = 4;    // gap between icons
    // How many icons fit in one column: floor((CW - 2*IP + IGAP) / (IC + IGAP))
    const iconsPerRow = Math.floor((CW - 2 * IP + IGAP) / (IC + IGAP));
    const maxApps     = iconsPerRow;  // single row only

    const AFH = 52;   // fixed row height: 12 label area + 20 icon + 10 top/bottom padding + 10 label

    elems.push(Rect(PX, y, W - 2 * PX, AFH, "#ffffff06"));
    elems.push(Tx(PX + IP, y + 16, "Apps in Flow", 11, C.slate3, "500"));
    elems.push(Tx(PX + IP, y + 27, "Nodes used", 9, C.slate7));

    for (let i = 0; i < n; i++) {
      const wf      = scoredItems[i];
      const x0      = colX(i);
      const iconY   = y + AFH - IC - 8;   // align to bottom of row
      if (wf.id === winnerPlatformId) elems.push(Rect(x0, y, CW, AFH, "#1e1b4b18"));

      const apps     = wf.appsUsed.slice(0, maxApps);
      const overflow = wf.appsUsed.length - maxApps;

      apps.forEach((app, ai) => {
        const ix  = x0 + IP + ai * (IC + IGAP);
        const b64 = faviconMap[app];
        // icon background square
        elems.push(Rect(ix, iconY, IC, IC, "#1e293b", 4));
        elems.push(`<rect x="${ix}" y="${iconY}" width="${IC}" height="${IC}" rx="4" fill="none" stroke="#334155" stroke-width="0.5"/>`);
        if (b64) {
          // embed favicon as base64 image, centred inside the container
          const pad = 3;
          elems.push(`<image href="${b64}" x="${ix + pad}" y="${iconY + pad}" width="${IC - pad * 2}" height="${IC - pad * 2}" preserveAspectRatio="xMidYMid meet"/>`);
        } else {
          // fallback: first letter of app name
          elems.push(Tx(ix + IC / 2, iconY + IC / 2 + 4, app.charAt(0).toUpperCase(), 9, C.slate3, "600", "middle"));
        }
      });

      if (overflow > 0) {
        const ix = x0 + IP + apps.length * (IC + IGAP);
        elems.push(Rect(ix, iconY, IC, IC, "#1e293b", 4));
        elems.push(Tx(ix + IC / 2, iconY + IC / 2 + 4, `+${overflow}`, 7, C.slate5, "500", "middle"));
      }
    }
    elems.push(HLine(PX, y + AFH, W - PX, y + AFH, C.border, 0.5));
    y += AFH;

    // ── Pillar rows
    const pillars = [
      { key: "reliability",  label: "Reliability",         sub: "30% weight" },
      { key: "throughput",   label: "Throughput",           sub: "25% weight" },
      { key: "connectivity", label: "Connectivity Depth",   sub: "20% weight" },
      { key: "criticality",  label: "Business Criticality", sub: "25% weight" },
    ] as const;

    const PH = 54;
    for (let pi = 0; pi < pillars.length; pi++) {
      const pillar = pillars[pi];
      if (pi % 2 === 0) elems.push(Rect(PX, y, W - 2 * PX, PH, "#ffffff06"));
      elems.push(Tx(PX + IP, y + 20, pillar.label, 11, C.slate3, "500"));
      elems.push(Tx(PX + IP, y + 35, pillar.sub, 9, C.slate7));

      const bestId = scoreData?.comparison?.[`best_${pillar.key}`] ?? null;
      for (let i = 0; i < n; i++) {
        const wf    = scoredItems[i];
        const val   = wf.pillars[pillar.key as keyof PillarScores];
        const isBest = wf.id === bestId;
        const x0    = colX(i);
        if (wf.id === winnerPlatformId) elems.push(Rect(x0, y, CW, PH, "#1e1b4b18"));
        elems.push(Bar(x0 + IP, y + 16, val));
        elems.push(Tx(x0 + IP + 98, y + 23, String(val), 11,
          isBest ? C.emerald : C.slate3, isBest ? "600" : "400"));
        if (isBest) elems.push(Tx(x0 + IP, y + 42, "\u25b2 Best", 9, C.emerald));
      }
      elems.push(HLine(PX, y + PH, W - PX, y + PH, C.border, 0.5));
      y += PH;
    }

    // ── Detail rows
    const DH = 34;
    const detailRows: { label: string; fn: (wf: ScoredWorkflow) => string }[] = [
      {
        label: "Success / Failed / Total",
        fn: (wf) => {
          const m = wf.metrics.reliability;
          return m.total > 0 ? `${m.done} / ${m.failed} / ${m.total}` : "\u2014";
        },
      },
      {
        label: "Outcome / Process events",
        fn: (wf) => {
          const m = wf.metrics.throughput;
          return (m.outcomeEvents + m.processEvents) > 0
            ? `${m.outcomeEvents} / ${m.processEvents}` : "\u2014";
        },
      },
      {
        label: "Last Active",
        fn: (wf) => relativeTime(wf.lastEventAt),
      },
    ];

    for (let ri = 0; ri < detailRows.length; ri++) {
      const row = detailRows[ri];
      if (ri % 2 === 0) elems.push(Rect(PX, y, W - 2 * PX, DH, "#ffffff04"));
      elems.push(Tx(PX + IP + 8, y + DH / 2 + 4, row.label, 9, C.slate5));
      for (let i = 0; i < n; i++) {
        const wf = scoredItems[i];
        const x0 = colX(i);
        if (wf.id === winnerPlatformId) elems.push(Rect(x0, y, CW, DH, "#1e1b4b18"));
        elems.push(Tx(x0 + IP, y + DH / 2 + 4, row.fn(wf), 10, C.slate3));
      }
      elems.push(HLine(PX, y + DH, W - PX, y + DH, C.border, 0.4));
      y += DH;
    }

    // ── Leakage Risk row
    const LH         = 64;
    const maxFailed  = Math.max(...scoredItems.map(wf => wf.metrics.reliability.failed));
    const svgRiskScore = (wf: ScoredWorkflow) =>
      maxFailed > 0 ? Math.round((wf.metrics.reliability.failed / maxFailed) * 100) : 0;
    const minRisk = Math.min(...scoredItems.map(svgRiskScore));

    elems.push(Tx(PX + IP, y + 24, "Leakage Risk", 11, C.white, "500"));
    elems.push(Tx(PX + IP, y + 38, "Relative execution failures \u00b7 0 = none", 9, C.slate7));
    for (let i = 0; i < n; i++) {
      const wf    = scoredItems[i];
      const score = svgRiskScore(wf);
      const x0    = colX(i);
      const col   = score === 0 ? C.slate7 : score <= 33 ? C.emerald : score <= 66 ? C.amber : C.rose;
      if (wf.id === winnerPlatformId) elems.push(Rect(x0, y, CW, LH, "#1e1b4b18"));
      // bar track
      elems.push(Rect(x0 + IP, y + 18, 94, 5, C.border, 2));
      // bar fill
      if (score > 0) elems.push(Rect(x0 + IP, y + 18, Math.round(94 * score / 100), 5, col, 2));
      // score number
      elems.push(Tx(x0 + IP + 98, y + 24, String(score), 11, col, "700"));
      if (score === 0) elems.push(Tx(x0 + IP, y + 46, "No failed executions", 9, C.slate7));
      if (score > 0 && score === minRisk) elems.push(Tx(x0 + IP, y + 46, "\u25b2 Lowest risk", 9, C.emerald));
    }
    elems.push(HLine(PX, y + LH, W - PX, y + LH));
    y += LH;

    // ── Winner row
    const WH = 58;
    elems.push(Rect(PX, y, W - 2 * PX, WH, "#1e1b4b14"));
    elems.push(Tx(PX + IP, y + WH / 2, "GTM Alpha Winner", 11, C.white, "700"));
    for (let i = 0; i < n; i++) {
      const wf  = scoredItems[i];
      const isW = wf.id === winnerPlatformId;
      const x0  = colX(i);
      if (isW) elems.push(Rect(x0, y, CW, WH, "#1e1b4b28"));
      if (isW) {
        elems.push(Tx(x0 + IP, y + WH / 2 - 6, "Best GTM Stack", 12, C.white, "700"));
        elems.push(Tx(x0 + IP, y + WH / 2 + 11, `Alpha Score ${wf.alphaScore} / 100`, 9, C.indigo));
      } else {
        elems.push(Tx(x0 + IP, y + WH / 2 + 5, "\u2014", 12, C.slate7));
      }
    }
    y += WH;

    // ── Footer
    const FH = 30;
    elems.push(HLine(PX, y, W - PX, y, C.border, 0.5));
    elems.push(Tx(PX + IP, y + 20,
      `Leakage Risk = relative execution failures (0\u2013100) normalized within selected set  \u00b7  Pillar scores normalized within selected set`,
      8, C.slate7));
    y += FH;

    const totalH = y + PY;

    // Vertical column dividers (run from below title bar to footer)
    const vLines = Array.from({ length: n }, (_, i) =>
      VLine(colX(i), PY + TH, totalH - PY));

    const svgStr = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">`,
      `<defs><style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}</style></defs>`,
      Rect(0, 0, W, totalH, C.bg),
      `<rect x="${PX}" y="${PY}" width="${W - 2 * PX}" height="${totalH - 2 * PY}" fill="${C.card}" rx="16" stroke="${C.border}" stroke-width="1"/>`,
      ...vLines,
      ...elems,
      `</svg>`,
    ].join("\n");

    // Render SVG to PNG via canvas
    const pngBlob = await svgToPng(svgStr, W, totalH);
    const url = URL.createObjectURL(pngBlob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `gtm-compare-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={18} className="text-indigo-400" />
              <h1 className="text-xl font-bold text-white tracking-tight">Workflow Comparison</h1>
            </div>
            <p className="text-sm text-slate-500">
              GTM Alpha Score — weighted performance grading across 4 pillars
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Period picker */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodMenu(p => !p)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
              >
                <TrendingUp size={13} className="text-indigo-400" />
                {PERIOD_LABELS[period]}
                <ChevronDown size={13} className={`transition-transform ${showPeriodMenu ? "rotate-180" : ""}`} />
              </button>
              {showPeriodMenu && (
                <div className="absolute right-0 top-10 z-20 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        p === period ? "text-white bg-indigo-500/20" : "text-slate-400 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Scoring model pills ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PILLAR_META.map(p => (
            <div key={p.key} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800">
              <p.icon size={14} className="text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{p.label}</p>
                <p className="text-[10px] text-slate-600">{p.weight} weight</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── No connection empty state ── */}
        {noConnection && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 size={40} className="text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">No workflows connected yet</p>
            <p className="text-slate-600 text-sm mt-1 mb-6">Connect n8n or Make.com to start comparing GTM performance</p>
            <button
              onClick={() => navigate("/automations")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
            >
              <ArrowUpRight size={14} /> Connect Automations
            </button>
          </div>
        )}

        {!noConnection && (
          <>
            {/* ── Workflow selector ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Platform counts */}
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {n8nWorkflows.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Bot size={12} className="text-orange-400" /> n8n
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500">{n8nWorkflows.length}</span>
                    </span>
                  )}
                  {makeScenarios.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Layers size={12} className="text-purple-400" /> Make.com
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500">{makeScenarios.length}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={selected.size > 0 ? "text-indigo-400" : ""}>
                    {selected.size} / 4 selected
                  </span>
                  {allSelectables.length >= 2 && (
                    <button
                      onClick={selectAll}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 hover:text-slate-300 transition-colors"
                      title="Compare top 4 across n8n and Make.com"
                    >
                      Compare All
                    </button>
                  )}
                  {allSelectables.length > 0 && (
                    <button
                      onClick={() => { setModalSelected(new Set(allSelectables.map(w => w.internalId))); setShowMoreModal(true); }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
                      title="Export all workflows to Excel"
                    >
                      <FileSpreadsheet size={11} />
                      More
                    </button>
                  )}
                  {selected.size > 0 && (
                    <button
                      onClick={() => setSelected(new Set())}
                      className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Workflow cards */}
              {isLoadingLists ? (
                <div className="flex items-center gap-2 text-slate-600 text-sm py-6">
                  <RefreshCw size={13} className="animate-spin" /> Loading workflows…
                </div>
              ) : allSelectables.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">
                  No workflows connected.{" "}
                  <button onClick={() => navigate("/automations")} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                    Connect now →
                  </button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {allSelectables.map(wf => {
                    const isSelected = selected.has(wf.internalId);
                    const scored     = scoredMap[wf.platformId];
                    return (
                      <button
                        key={wf.internalId}
                        onClick={() => toggleSelect(wf.internalId)}
                        disabled={!isSelected && selected.size >= 4}
                        className={`text-left p-4 rounded-2xl border transition-all duration-150 ${
                          isSelected
                            ? "border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/20"
                            : selected.size >= 4
                            ? "border-slate-800 bg-slate-900/30 opacity-40 cursor-not-allowed"
                            : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wf.active ? "bg-emerald-500" : "bg-slate-600"}`} />
                            <span className="text-sm font-medium text-white truncate">{wf.name}</span>
                          </div>
                          <span className={`shrink-0 flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                            wf.platform === "n8n"
                              ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                              : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          }`}>
                            {wf.platform === "n8n" ? <Bot size={8} /> : <Layers size={8} />}
                            {wf.platform === "n8n" ? "n8n" : "Make"}
                          </span>
                          {isSelected && scored && (
                            <GradeBadge grade={scored.grade} />
                          )}
                          {isSelected && !scored && (
                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                              <RefreshCw size={10} className="text-slate-500 animate-spin" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {wf.appsUsed.slice(0, 4).map(app => (
                            <span key={app} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700/80 text-slate-500">
                              {app}
                            </span>
                          ))}
                          {wf.appsUsed.length > 4 && (
                            <span className="text-[10px] text-slate-600">+{wf.appsUsed.length - 4}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-600">
                          <span>{wf.nodeCount} nodes</span>
                          <span className="capitalize">{wf.triggerType}</span>
                          {wf.execSyncEnabled && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 size={9} /> Capture on
                            </span>
                          )}
                        </div>
                        {isSelected && scored && (
                          <div className="mt-2 pt-2 border-t border-slate-800">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-600">Alpha Score</span>
                              <span className={`text-sm font-bold ${GRADE_STYLE[scored.grade]?.color}`}>
                                {scored.alphaScore}
                              </span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Placeholder when < 2 selected ── */}
            {showEmptySelect && !isLoadingLists && allSelectables.length >= 2 && (
              <div className="flex flex-col items-center justify-center py-14 rounded-2xl border border-dashed border-slate-800 text-center">
                <BarChart3 size={32} className="text-slate-700 mb-3" />
                <p className="text-slate-500 font-medium">Select 2 or more workflows to compare</p>
                <p className="text-slate-700 text-xs mt-1">Up to 4 workflows can be compared at once</p>
              </div>
            )}

            {/* ── GTM Alpha Score Matrix ── */}
            {showMatrix && (
              <div className="space-y-4">

                {/* Matrix toolbar — export + loading state */}
                <div className="flex items-center justify-between">
                  {loadingScore ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <RefreshCw size={13} className="animate-spin text-indigo-400" />
                      Calculating GTM Alpha Scores…
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">
                      {scoredItems.length} workflows · GTM Alpha Score
                    </span>
                  )}
                  {!loadingScore && scoredItems.length >= 2 && (
                    <button
                      onClick={exportSVG}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-300 text-xs font-medium transition-all"
                    >
                      <Download size={12} />
                      Export SVG
                    </button>
                  )}
                </div>

                {!loadingScore && scoredItems.length >= 2 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">

                    {/* Matrix header row */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="px-5 py-4 text-left text-[10px] text-slate-600 uppercase tracking-wider font-semibold w-44 shrink-0">
                              GTM Metric
                            </th>
                            {scoredItems.map(wf => {
                              const isWinner = wf.id === winnerPlatformId;
                              return (
                                <th key={wf.id} className={`px-5 py-4 text-left min-w-[200px] ${isWinner ? "bg-indigo-500/5" : ""}`}>
                                  <div className={`rounded-xl border px-3 py-2.5 ${isWinner ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/50"}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      {wf.platform === "n8n"
                                        ? <Bot size={12} className="text-orange-400 shrink-0" />
                                        : <Layers size={12} className="text-purple-400 shrink-0" />
                                      }
                                      <span className="text-sm font-semibold text-white truncate">{wf.name}</span>
                                      {isWinner && <Trophy size={12} className="text-amber-400 shrink-0 ml-auto" />}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <GradeBadge grade={wf.grade} />
                                      <div>
                                        <span className={`text-2xl font-black tabular-nums ${GRADE_STYLE[wf.grade]?.color}`}>
                                          {wf.alphaScore}
                                        </span>
                                        <span className="text-[10px] text-slate-600 ml-1">/ 100</span>
                                      </div>
                                      {isWinner && (
                                        <span className="ml-auto text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                          Best Stack
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/40">

                          {/* ── Apps in Flow ── */}
                          <tr className="bg-slate-900/20">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <Network size={13} className="text-slate-500 shrink-0" />
                                <div>
                                  <p className="text-xs font-medium text-slate-300">Apps in Flow</p>
                                  <p className="text-[10px] text-slate-600">Nodes used</p>
                                </div>
                              </div>
                            </td>
                            {scoredItems.map(wf => (
                              <td key={wf.id} className={`px-5 py-3.5 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                <div className="flex flex-wrap gap-1.5">
                                  {wf.appsUsed.slice(0, 8).map(app => (
                                    <div
                                      key={app}
                                      title={app}
                                      className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0"
                                    >
                                      <img
                                        src={`${API_BASE_URL}/api/proxy/favicon?domain=${appDomain(app)}`}
                                        width={14}
                                        height={14}
                                        alt={app}
                                        className="object-contain"
                                        onError={e => {
                                          const img = e.target as HTMLImageElement;
                                          img.style.display = "none";
                                          const parent = img.parentElement;
                                          if (parent) {
                                            parent.textContent = app.charAt(0).toUpperCase();
                                            parent.className += " text-[9px] font-bold text-slate-500";
                                          }
                                        }}
                                      />
                                    </div>
                                  ))}
                                  {wf.appsUsed.length > 8 && (
                                    <div className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700/80 flex items-center justify-center text-[9px] text-slate-500 font-medium shrink-0">
                                      +{wf.appsUsed.length - 8}
                                    </div>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* ── Pillar rows ── */}
                          {PILLAR_META.map((pillar, rowIdx) => (
                            <tr key={pillar.key} className={rowIdx % 2 === 0 ? "bg-slate-900/20" : ""}>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <pillar.icon size={13} className="text-slate-500 shrink-0" />
                                  <div>
                                    <p className="text-xs font-medium text-slate-300">{pillar.label}</p>
                                    <p className="text-[10px] text-slate-600">{pillar.weight}</p>
                                  </div>
                                </div>
                              </td>
                              {scoredItems.map(wf => {
                                const val  = wf.pillars[pillar.key as keyof PillarScores];
                                const best = scoreData?.comparison?.[`best_${pillar.key}`] === wf.id;
                                return (
                                  <td key={wf.id} className={`px-5 py-3.5 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                    <div className="space-y-1.5">
                                      <PillarBar value={val} />
                                      {best && (
                                        <span className="text-[10px] text-emerald-400 font-medium">▲ Best</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}

                          {/* ── Reliability detail ── */}
                          <tr className="bg-slate-900/30">
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">Success / Failed / Total</p>
                            </td>
                            {scoredItems.map(wf => {
                              const m  = wf.metrics.reliability;
                              const best = m.total > 0 && scoreData?.comparison?.best_reliability === wf.id;
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  <span className={`text-xs tabular-nums ${best ? pillarCellClass(wf.id, "reliability") : "text-slate-500"}`}>
                                    {m.total > 0 ? <>{m.done} <span className="text-slate-700">/</span> <span className="text-rose-400">{m.failed}</span> <span className="text-slate-700">/</span> {m.total}</> : "—"}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Throughput detail ── */}
                          <tr>
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">Outcome / Process events</p>
                            </td>
                            {scoredItems.map(wf => {
                              const m = wf.metrics.throughput;
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  <span className="text-xs text-slate-500 tabular-nums">
                                    {(m.outcomeEvents + m.processEvents) === 0 ? "—" : <><span className="text-emerald-400">{m.outcomeEvents}</span> / {m.processEvents}</>}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Connectivity detail ── */}
                          <tr className="bg-slate-900/30">
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">High-value apps</p>
                            </td>
                            {scoredItems.map(wf => {
                              const hvApps = wf.metrics.connectivity.highValueApps;
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  {hvApps.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {hvApps.slice(0, 4).map(a => (
                                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                          {a}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-700">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Top event types (criticality) ── */}
                          <tr>
                            <td className="px-5 py-3 pl-10">
                              <p className="text-[11px] text-slate-600">Top event types</p>
                            </td>
                            {scoredItems.map(wf => {
                              const breakdown = wf.metrics.criticality.eventBreakdown;
                              const top = Object.entries(breakdown)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3);
                              return (
                                <td key={wf.id} className={`px-5 py-3 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                  {top.length > 0 ? (
                                    <div className="flex flex-col gap-0.5">
                                      {top.map(([type, count]) => (
                                        <span key={type} className="text-[10px] text-slate-500">
                                          <span className="text-slate-400">{type.replace(/_/g, " ")}</span>
                                          <span className="text-slate-700 ml-1">×{count}</span>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-700">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* ── Last active ── */}
                          <tr className="bg-slate-900/30">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <Zap size={13} className="text-slate-500 shrink-0" />
                                <p className="text-xs font-medium text-slate-300">Last Active</p>
                              </div>
                            </td>
                            {scoredItems.map(wf => (
                              <td key={wf.id} className={`px-5 py-3.5 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                <span className="text-xs text-slate-500">{relativeTime(wf.lastEventAt)}</span>
                              </td>
                            ))}
                          </tr>

                          {/* ── Leakage Risk ── */}
                          {(() => {
                            const maxFailed = Math.max(...scoredItems.map(wf => wf.metrics.reliability.failed));
                            const riskScore = (wf: ScoredWorkflow) =>
                              maxFailed > 0 ? Math.round((wf.metrics.reliability.failed / maxFailed) * 100) : 0;
                            const minScore  = Math.min(...scoredItems.map(riskScore));
                            return (
                              <tr>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                                    <div>
                                      <p className="text-xs font-medium text-white">Leakage Risk</p>
                                      <p className="text-[10px] text-slate-600">Relative execution failures · 0 = none</p>
                                    </div>
                                  </div>
                                </td>
                                {scoredItems.map(wf => {
                                  const score    = riskScore(wf);
                                  const isLowest = score === minScore;
                                  const barColor =
                                    score === 0   ? "bg-slate-700" :
                                    score <= 33   ? "bg-emerald-500" :
                                    score <= 66   ? "bg-amber-500"   : "bg-rose-500";
                                  const textColor =
                                    score === 0   ? "text-slate-600" :
                                    score <= 33   ? "text-emerald-400" :
                                    score <= 66   ? "text-amber-400"   : "text-rose-400";
                                  return (
                                    <td key={wf.id} className={`px-5 py-4 ${wf.id === winnerPlatformId ? "bg-indigo-500/3" : ""}`}>
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                                          </div>
                                          <span className={`text-sm font-bold tabular-nums ${textColor}`}>{score}</span>
                                        </div>
                                        {score > 0 && (
                                          <p className="text-[10px] text-slate-600">
                                            {wf.metrics.reliability.failed} failed execution{wf.metrics.reliability.failed !== 1 ? "s" : ""}
                                          </p>
                                        )}
                                        {isLowest && score > 0 && <span className="text-[10px] text-emerald-400">▲ Lowest risk</span>}
                                        {score === 0 && <span className="text-[10px] text-slate-700">No failed executions</span>}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })()}

                          {/* ── Winner row ── */}
                          <tr className="border-t-2 border-indigo-500/20 bg-indigo-500/5">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <Trophy size={14} className="text-amber-400" />
                                <p className="text-xs font-bold text-white">GTM Alpha Winner</p>
                              </div>
                            </td>
                            {scoredItems.map(wf => {
                              const isWinner = wf.id === winnerPlatformId;
                              return (
                                <td key={wf.id} className={`px-5 py-4 ${isWinner ? "bg-indigo-500/5" : ""}`}>
                                  {isWinner ? (
                                    <div className="flex items-center gap-2">
                                      <Trophy size={18} className="text-amber-400" />
                                      <div>
                                        <p className="text-sm font-bold text-white">Best GTM Stack</p>
                                        <p className="text-[10px] text-indigo-400">Alpha Score {wf.alphaScore} / 100</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-600">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Footer — model info + export */}
                    <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between gap-4 text-[10px] text-slate-700">
                      <div className="flex items-center gap-2">
                        <Info size={10} />
                        Leakage Risk = relative execution failures (0–100) normalized within the selected set. 0 = no failed executions.
                        All pillar scores are normalized within the selected set.
                      </div>
                      <button
                        onClick={exportSVG}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-500/15 border border-slate-700 hover:border-indigo-500/40 text-slate-500 hover:text-indigo-300 text-[10px] font-medium transition-all shrink-0"
                      >
                        <Download size={10} />
                        Export PNG
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* ── More / Excel Export Modal ── */}
    {showMoreModal && (

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white">Export to Excel</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select any number of workflows — no limit in the export</p>
            </div>
            <button onClick={() => setShowMoreModal(false)} className="text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Select all / none */}
          <div className="px-6 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">{modalSelected.size} of {allSelectables.length} selected</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setModalSelected(new Set(allSelectables.map(w => w.internalId)))}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >Select all</button>
              <span className="text-slate-700">·</span>
              <button
                onClick={() => setModalSelected(new Set())}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >Clear</button>
            </div>
          </div>

          {/* Workflow list */}
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
            {allSelectables.map(wf => {
              const checked = modalSelected.has(wf.internalId);
              return (
                <button
                  key={wf.internalId}
                  onClick={() => toggleModalSelect(wf.internalId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    checked
                      ? "border-emerald-500/40 bg-emerald-500/8"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked ? "bg-emerald-500 border-emerald-500" : "border-slate-600"
                  }`}>
                    {checked && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  {/* Active dot */}
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wf.active ? "bg-emerald-500" : "bg-slate-600"}`} />
                  {/* Name */}
                  <span className="text-sm text-white flex-1 truncate">{wf.name}</span>
                  {/* Platform badge */}
                  <span className={`shrink-0 flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                    wf.platform === "n8n"
                      ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                      : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  }`}>
                    {wf.platform === "n8n" ? <Bot size={8} /> : <Layers size={8} />}
                    {wf.platform === "n8n" ? "n8n" : "Make"}
                  </span>
                  {/* App count */}
                  <span className="text-[10px] text-slate-600 shrink-0">{wf.nodeCount} nodes</span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-4">
            <p className="text-[10px] text-slate-600">
              Excel includes: Grade · Alpha Score · 4 pillars · Leakage Risk · Failed executions · Apps used
            </p>
            <button
              onClick={exportXlsx}
              disabled={modalSelected.size === 0 || exportingXlsx}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shrink-0"
            >
              {exportingXlsx
                ? <><RefreshCw size={13} className="animate-spin" /> Generating…</>
                : <><FileSpreadsheet size={13} /> Export {modalSelected.size} workflow{modalSelected.size !== 1 ? "s" : ""}</>
              }
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
