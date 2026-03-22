import { useState, useEffect, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target, Flame, Thermometer, Snowflake, Zap, X,
  Plus, BarChart3, Users, Settings2, ChevronDown, ChevronUp,
  RefreshCw, Save, ArrowRight, CheckCircle, AlertCircle, Info,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../../config";

// ── Types ────────────────────────────────────────────────────────────────────

interface ICPWeights { title: number; company: number; source: number; }

interface ICPProfile {
  targetTitles: string[];
  targetIndustries: string[];
  targetCompanyKeywords: string[];
  excludeSeniority: string[];
  weights: ICPWeights;
  hotThreshold: number;
  warmThreshold: number;
}

interface ScoredLead {
  id: string;
  fullName: string;
  email: string;
  title: string;
  company: string;
  source: string;
  score: number | null;
  grade: "hot" | "warm" | "cold" | null;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: ICPProfile = {
  targetTitles: ["VP Sales", "Head of Marketing", "Director of Revenue", "CEO", "Founder"],
  targetIndustries: ["saas", "software", "tech", "b2b"],
  targetCompanyKeywords: ["platform", "cloud", "ai", "intelligence"],
  excludeSeniority: ["intern", "junior", "assistant"],
  weights: { title: 4, company: 2, source: 1 },
  hotThreshold: 70,
  warmThreshold: 40,
};

// ── Suggested values ──────────────────────────────────────────────────────────

const TITLE_SUGGESTIONS  = ["CEO", "CTO", "CMO", "VP Sales", "VP Marketing", "Director of Sales", "Head of Growth", "Founder", "Co-Founder", "Head of Revenue", "Chief Revenue Officer"];
const INDUSTRY_SUGGESTIONS = ["saas", "software", "fintech", "healthtech", "e-commerce", "b2b", "marketplace", "agency", "consulting", "media"];
const KEYWORD_SUGGESTIONS = ["platform", "cloud", "ai", "intelligence", "automation", "analytics", "data", "enterprise", "startup"];

// ── Outreach actions per grade ────────────────────────────────────────────────

const GRADE_ACTIONS: Record<string, { label: string; steps: string[] }> = {
  hot: {
    label: "High-touch immediate outreach",
    steps: [
      "Send a highly personalised email within 24 hrs",
      "Enrol in a priority sequence in your outreach tool",
      "Send a personalised LinkedIn connection request",
      "Flag for immediate SDR follow-up and call",
    ],
  },
  warm: {
    label: "Nurture & build relationship",
    steps: [
      "Add to an automated nurture email sequence",
      "Share a relevant case study or ROI report",
      "Engage with their content on LinkedIn first",
      "Schedule a follow-up touch in 7–14 days",
    ],
  },
  cold: {
    label: "Enrich before committing budget",
    steps: [
      "Enrich the profile — title or company data may be missing",
      "Add to a low-frequency awareness drip only",
      "Wait for an engagement signal before reaching out",
      "Re-evaluate ICP fit — may not be target buyer",
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem("iqpipe_token") || "";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });

function GradePill({ grade, score }: { grade: string | null; score: number | null }) {
  if (!grade || score === null) return <span className="text-[11px] text-slate-600 font-mono">—</span>;
  const map: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    hot:  { label: "Hot",  cls: "bg-rose-900/30 border-rose-700/50 text-rose-300",    Icon: Flame       },
    warm: { label: "Warm", cls: "bg-amber-900/30 border-amber-700/50 text-amber-300", Icon: Thermometer },
    cold: { label: "Cold", cls: "bg-sky-900/30 border-sky-700/50 text-sky-300",       Icon: Snowflake   },
  };
  const { label, cls, Icon } = map[grade];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cls}`}>
      <Icon size={10} /> {label} · {score}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <div className="h-1.5 w-20 rounded-full bg-slate-800" />;
  const color = score >= 70 ? "bg-rose-500" : score >= 40 ? "bg-amber-500" : "bg-sky-500";
  return (
    <div className="h-1.5 w-20 rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ── Tag input ─────────────────────────────────────────────────────────────────

function TagInput({
  tags, onChange, placeholder, suggestions,
}: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string; suggestions: string[];
}) {
  const [input, setInput] = useState("");
  const [showSugg, setShowSugg] = useState(false);

  const add = (val: string) => {
    const v = val.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
    setShowSugg(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && tags.length) onChange(tags.slice(0, -1));
  };

  const filtered = suggestions.filter(s => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase()));

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-800/60 border border-slate-700 min-h-[44px] focus-within:border-indigo-600 transition-colors">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-900/40 border border-indigo-700/40 text-indigo-200 text-[11px] font-medium">
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-white transition-colors"><X size={10} /></button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setShowSugg(true); }}
          onKeyDown={onKey}
          onFocus={() => setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-600"
        />
      </div>
      {showSugg && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 max-h-40 overflow-y-auto">
          {filtered.slice(0, 8).map(s => (
            <button key={s} onMouseDown={() => add(s)} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Weight slider ─────────────────────────────────────────────────────────────

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const labels = ["Low", "Low+", "Medium", "High+", "High"];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-[11px] font-semibold text-indigo-300">{labels[value - 1]}</span>
      </div>
      <input
        type="range" min={1} max={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 h-1.5 rounded-full cursor-pointer"
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ICPScoringPage() {
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [profile, setProfile]         = useState<ICPProfile>(DEFAULT_PROFILE);
  const [leads, setLeads]             = useState<ScoredLead[]>([]);
  const [filter, setFilter]           = useState<"all" | "hot" | "warm" | "cold" | "unscored">("all");
  const [saving, setSaving]           = useState(false);
  const [scoring, setScoring]         = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [saveMsg, setSaveMsg]         = useState<string | null>(null);
  const [scoreMsg, setScoreMsg]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string>("personas");
  const [selectedGrade, setSelectedGrade] = useState<"hot" | "warm" | "cold" | null>("hot");

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchWorkspace = async () => {
      const res = await fetch(`${API_BASE_URL}/api/workspaces/primary`, { headers: getHeaders() });
      if (!res.ok) return;
      const { id } = await res.json();
      setWorkspaceId(id);
      loadProfile(id);
      loadLeads(id);
    };
    fetchWorkspace();
  }, []);

  const loadProfile = async (wsId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/icp/profile?workspaceId=${wsId}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
    } catch {}
  };

  const loadLeads = async (wsId: string) => {
    setLoadingLeads(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/icp/leads?workspaceId=${wsId}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.leads) setLeads(data.leads);
    } catch {} finally { setLoadingLeads(false); }
  };

  const saveProfile = async () => {
    if (!workspaceId) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/icp/profile`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ workspaceId, profile }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveMsg("Profile saved");
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const runScoring = async () => {
    if (!workspaceId) return;
    setScoring(true); setError(null); setScoreMsg(null);
    try {
      // Save first, then score
      await fetch(`${API_BASE_URL}/api/icp/profile`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ workspaceId, profile }),
      });
      const res = await fetch(`${API_BASE_URL}/api/icp/score-all`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed");
      setScoreMsg(`${data.scored} contacts scored`);
      setTimeout(() => setScoreMsg(null), 3000);
      loadLeads(workspaceId);
    } catch (e: any) { setError(e.message); } finally { setScoring(false); }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  const scored   = leads.filter(l => l.score !== null);
  const hot      = leads.filter(l => l.grade === "hot");
  const warm     = leads.filter(l => l.grade === "warm");
  const cold     = leads.filter(l => l.grade === "cold");
  const unscored = leads.filter(l => l.score === null);

  const filtered = filter === "all"      ? scored
    : filter === "hot"      ? hot
    : filter === "warm"     ? warm
    : filter === "cold"     ? cold
    : unscored;

  const avgScore = scored.length ? Math.round(scored.reduce((s, l) => s + (l.score ?? 0), 0) / scored.length) : null;

  // ── Section toggle ────────────────────────────────────────────────────────
  const toggle = (id: string) => setOpenSection(prev => prev === id ? "" : id);

  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ElementType; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-800/40 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-indigo-400" />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        {openSection === id ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {openSection === id && <div className="px-4 pb-4 space-y-4 border-t border-slate-800 pt-4">{children}</div>}
    </div>
  );

  return (
    <div className="pb-12">
      <PageHeader
        title="ICP Scoring"
        subtitle="Define your ideal customer profile, score every contact, and get grade-based outreach actions."
      />

      {/* ── Error banner ── */}
      {error && (
        <div className="mt-4 p-3 rounded-xl bg-rose-900/20 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ─────────────────────── LEFT: Profile Builder ─────────────────────── */}
        <div className="lg:col-span-4 space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Total Contacts", value: leads.length, color: "text-slate-200", bg: "bg-slate-800/60" },
              { label: "Avg ICP Score",  value: avgScore !== null ? `${avgScore}` : "—", color: "text-indigo-300", bg: "bg-indigo-900/20" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border border-slate-800 ${s.bg} p-3 text-center`}>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Grade legend */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Grade Breakdown</p>
            {[
              { label: "Hot",     count: hot.length,  color: "bg-rose-500",  text: "text-rose-300",  Icon: Flame,       grade: "hot"  as const },
              { label: "Warm",    count: warm.length, color: "bg-amber-500", text: "text-amber-300", Icon: Thermometer, grade: "warm" as const },
              { label: "Cold",    count: cold.length, color: "bg-sky-500",   text: "text-sky-300",   Icon: Snowflake,   grade: "cold" as const },
            ].map(({ label, count, color, text, Icon, grade }) => {
              const pct = scored.length ? Math.round((count / scored.length) * 100) : 0;
              return (
                <button key={label} onClick={() => setSelectedGrade(g => g === grade ? null : grade)} className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${selectedGrade === grade ? "bg-slate-800" : "hover:bg-slate-800/50"}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${color}/20 border border-current ${text}`}>
                    <Icon size={12} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold ${text}`}>{label}</span>
                      <span className="text-xs text-slate-400 font-mono">{count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Recommended actions card */}
          {selectedGrade && (
            <div className={`rounded-2xl border p-4 space-y-3 ${
              selectedGrade === "hot"  ? "bg-rose-900/10 border-rose-800/30" :
              selectedGrade === "warm" ? "bg-amber-900/10 border-amber-800/30" :
                                         "bg-sky-900/10 border-sky-800/30"
            }`}>
              <div className="flex items-center gap-2">
                {selectedGrade === "hot"  && <Flame       size={14} className="text-rose-400"  />}
                {selectedGrade === "warm" && <Thermometer size={14} className="text-amber-400" />}
                {selectedGrade === "cold" && <Snowflake   size={14} className="text-sky-400"   />}
                <p className="text-xs font-bold text-slate-200 capitalize">{selectedGrade} Contacts — Recommended Actions</p>
              </div>
              <p className="text-[11px] text-slate-400">{GRADE_ACTIONS[selectedGrade].label}</p>
              <ol className="space-y-2">
                {GRADE_ACTIONS[selectedGrade].steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                    <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 ${
                      selectedGrade === "hot"  ? "bg-rose-900/50 border border-rose-700 text-rose-300" :
                      selectedGrade === "warm" ? "bg-amber-900/50 border border-amber-700 text-amber-300" :
                                                 "bg-sky-900/50 border border-sky-700 text-sky-300"
                    }`}>{i + 1}</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => navigate("/integrations")}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <ArrowRight size={11} /> Set up outreach in Integrations
              </button>
            </div>
          )}

          {/* Profile builder sections */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Settings2 size={13} className="text-slate-500" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ICP Profile</p>
            </div>

            <Section id="personas" title="Target Personas" icon={Users}>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Target Job Titles</label>
                  <TagInput tags={profile.targetTitles} onChange={t => setProfile(p => ({ ...p, targetTitles: t }))} placeholder="Add titles…" suggestions={TITLE_SUGGESTIONS} />
                  <p className="text-[10px] text-slate-600 mt-1">Exact matches score highest (100 pts)</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Exclude Seniority Keywords</label>
                  <TagInput tags={profile.excludeSeniority} onChange={t => setProfile(p => ({ ...p, excludeSeniority: t }))} placeholder="intern, junior…" suggestions={["intern", "junior", "associate", "assistant", "entry"]} />
                  <p className="text-[10px] text-slate-600 mt-1">Contacts matching these get a heavy score penalty</p>
                </div>
              </div>
            </Section>

            <Section id="company" title="Target Companies" icon={BarChart3}>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Target Industries</label>
                  <TagInput tags={profile.targetIndustries} onChange={t => setProfile(p => ({ ...p, targetIndustries: t }))} placeholder="saas, fintech…" suggestions={INDUSTRY_SUGGESTIONS} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Company Name Keywords</label>
                  <TagInput tags={profile.targetCompanyKeywords} onChange={t => setProfile(p => ({ ...p, targetCompanyKeywords: t }))} placeholder="platform, cloud…" suggestions={KEYWORD_SUGGESTIONS} />
                  <p className="text-[10px] text-slate-600 mt-1">Found in the company name field of each contact</p>
                </div>
              </div>
            </Section>

            <Section id="weights" title="Scoring Weights" icon={Target}>
              <div className="space-y-4">
                <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/40">
                  <p className="text-[10px] text-slate-500 leading-relaxed">Weights control how much each dimension influences the final score. Set to <span className="text-slate-300">High</span> for factors that matter most in your market.</p>
                </div>
                <WeightSlider label="Title Match"      value={profile.weights.title}   onChange={v => setProfile(p => ({ ...p, weights: { ...p.weights, title: v } }))} />
                <WeightSlider label="Company Match"    value={profile.weights.company} onChange={v => setProfile(p => ({ ...p, weights: { ...p.weights, company: v } }))} />
                <WeightSlider label="Source Quality"   value={profile.weights.source}  onChange={v => setProfile(p => ({ ...p, weights: { ...p.weights, source: v } }))} />
              </div>
            </Section>

            <Section id="thresholds" title="Grade Thresholds" icon={Zap}>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-rose-400 flex items-center gap-1"><Flame size={10} /> Hot threshold</label>
                    <span className="text-xs font-mono text-rose-300">{profile.hotThreshold}+</span>
                  </div>
                  <input type="range" min={50} max={90} value={profile.hotThreshold}
                    onChange={e => setProfile(p => ({ ...p, hotThreshold: Number(e.target.value) }))}
                    className="w-full accent-rose-500 h-1.5 rounded-full cursor-pointer" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-amber-400 flex items-center gap-1"><Thermometer size={10} /> Warm threshold</label>
                    <span className="text-xs font-mono text-amber-300">{profile.warmThreshold}+</span>
                  </div>
                  <input type="range" min={20} max={69} value={profile.warmThreshold}
                    onChange={e => setProfile(p => ({ ...p, warmThreshold: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1.5 rounded-full cursor-pointer" />
                </div>
                <p className="text-[10px] text-slate-600">Below {profile.warmThreshold} = Cold · {profile.warmThreshold}–{profile.hotThreshold - 1} = Warm · {profile.hotThreshold}+ = Hot</p>
              </div>
            </Section>
          </div>

          {/* Save + Score actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={runScoring}
              disabled={scoring || !workspaceId}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-500/15"
            >
              {scoring ? <><RefreshCw size={15} className="animate-spin" /> Scoring contacts…</> : <><Zap size={15} /> Save & Score All Contacts</>}
            </button>
            {scoreMsg && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 justify-center">
                <CheckCircle size={12} /> {scoreMsg}
              </div>
            )}
            <button
              onClick={saveProfile}
              disabled={saving || !workspaceId}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-900/50 text-slate-300 hover:text-white disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : <><Save size={13} /> Save Profile Only</>}
            </button>
            {saveMsg && <div className="text-[11px] text-emerald-400 text-center">{saveMsg}</div>}
          </div>
        </div>

        {/* ─────────────────────── RIGHT: Scored contacts ─────────────────────── */}
        <div className="lg:col-span-8 space-y-4">

          {/* Filter tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "all",      label: `All Scored (${scored.length})` },
              { key: "hot",      label: `🔴 Hot (${hot.length})` },
              { key: "warm",     label: `🟡 Warm (${warm.length})` },
              { key: "cold",     label: `🔵 Cold (${cold.length})` },
              { key: "unscored", label: `Unscored (${unscored.length})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filter === key
                    ? "bg-slate-800 text-white border-slate-600 shadow"
                    : "text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => workspaceId && loadLeads(workspaceId)}
              className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} className={loadingLeads ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Empty state */}
          {!loadingLeads && leads.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 flex flex-col items-center justify-center text-center">
              <Target size={32} className="text-slate-700 mb-4" />
              <p className="text-slate-400 font-medium mb-1">No contacts yet</p>
              <p className="text-xs text-slate-600 mb-4">Import contacts first, then run ICP scoring to grade them.</p>
              <button onClick={() => navigate("/leads")} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors">
                <Users size={13} /> Go to Contacts
              </button>
            </div>
          )}

          {/* Unscored state */}
          {!loadingLeads && leads.length > 0 && scored.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 flex flex-col items-center justify-center text-center">
              <Info size={28} className="text-indigo-500 mb-3" />
              <p className="text-slate-300 font-semibold mb-1">Contacts not yet scored</p>
              <p className="text-xs text-slate-500 mb-4">{leads.length} contacts imported. Set up your ICP profile and click "Save & Score All Contacts".</p>
            </div>
          )}

          {/* Contact list */}
          {filtered.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-x-auto">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/80">
                {["Contact", "Title", "Company", "Source", "Score", "Grade"].map((h, i) => (
                  <div key={h} className={`text-[10px] font-bold text-slate-500 uppercase tracking-wider ${i === 0 ? "col-span-3" : i === 1 ? "col-span-2" : i === 2 ? "col-span-2" : i === 3 ? "col-span-2" : "col-span-1"}`}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-800/50 max-h-[600px] overflow-y-auto">
                {filtered.map(lead => (
                  <div
                    key={lead.id}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    {/* Name */}
                    <div className="col-span-3 min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{lead.fullName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{lead.email}</p>
                    </div>
                    {/* Title */}
                    <div className="col-span-2 min-w-0">
                      <p className="text-[11px] text-slate-400 truncate" title={lead.title}>{lead.title || "—"}</p>
                    </div>
                    {/* Company */}
                    <div className="col-span-2 min-w-0">
                      <p className="text-[11px] text-slate-400 truncate" title={lead.company}>{lead.company || "—"}</p>
                    </div>
                    {/* Source */}
                    <div className="col-span-2 min-w-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 truncate block max-w-full">{lead.source}</span>
                    </div>
                    {/* Score bar */}
                    <div className="col-span-1 flex flex-col gap-1">
                      <ScoreBar score={lead.score} />
                      <span className="text-[10px] text-slate-500 font-mono">{lead.score ?? "—"}</span>
                    </div>
                    {/* Grade pill */}
                    <div className="col-span-2">
                      <GradePill grade={lead.grade} score={lead.score} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/60">
                <p className="text-[10px] text-slate-600">{filtered.length} contact{filtered.length !== 1 ? "s" : ""} · click a row to open full profile</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
