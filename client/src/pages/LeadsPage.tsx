import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import DataTable from "../components/DataTable";
import { API_BASE_URL } from "../../config";
import {
  Check, X, Loader2, Plus, UserPlus, AlertCircle,
  Upload, Mail, Building, Globe,
  FlaskConical, Send, Search, Database, Layers,
  Flame, Thermometer, Snowflake, AlertTriangle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type LeadRow = {
  id: string;
  name: string;
  title: string;
  company: string;
  source: string;
  score: number;
  fitScore?: number | null;
  owner: string;
  status: string;
  email?: string;
  linkedin?: string;
  assignedCampaign?: string;  // experiment id
  assignedStack?: "A" | "B";
};

function ICPGradePill({ fitScore }: { fitScore?: number | null }) {
  if (fitScore == null) return <span className="text-[10px] text-slate-700">—</span>;
  if (fitScore >= 70) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-900/30 border border-rose-700/40 text-rose-300 text-[10px] font-semibold">
      <Flame size={9} /> Hot · {fitScore}
    </span>
  );
  if (fitScore >= 40) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300 text-[10px] font-semibold">
      <Thermometer size={9} /> Warm · {fitScore}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-900/30 border border-sky-700/40 text-sky-300 text-[10px] font-semibold">
      <Snowflake size={9} /> Cold · {fitScore}
    </span>
  );
}

// Local persistence key for assignments
const ASSIGNMENTS_KEY = "iqpipe_lead_assignments";

// ─── Campaign / Stack Catalog (loaded from /api/experiments) ─────────────

type CampaignOption = {
  id: string;
  name: string;
  status: "active" | "completed" | "paused";
  stackAName: string;
  stackBName: string;
  stackATools: string[];
  stackBTools: string[];
};

const TOOL_DISPLAY: Record<string, string> = {
  clay: "Clay", apollo: "Apollo", zoominfo: "ZoomInfo", pdl: "PDL",
  clearbit: "Clearbit", lusha: "Lusha", dropcontact: "Dropcontact",
  heyreach: "HeyReach", lemlist: "Lemlist", instantly: "Instantly", smartlead: "Smartlead",
  hubspot: "HubSpot", pipedrive: "Pipedrive", closecrm: "Close CRM",
  stripe: "Stripe", paddle: "Paddle", chargebee: "Chargebee",
};

function experimentToCampaign(e: any): CampaignOption {
  const toolIds = (toolsObj: Record<string, string> | null | undefined) =>
    Object.values(toolsObj ?? {}).map(id => TOOL_DISPLAY[id] ?? id);
  return {
    id: e.id,
    name: e.name,
    status: (e.status === "draft" || e.status === "paused") ? "paused"
          : e.status === "completed" ? "completed" : "active",
    stackAName: e.stackA?.name ?? "Stack A",
    stackBName: e.stackB?.name ?? "Stack B",
    stackATools: toolIds(e.stackA?.tools),
    stackBTools: toolIds(e.stackB?.tools),
  };
}

const TOOL_ICONS: Record<string, any> = {
  Clay: Search, Apollo: Search, ZoomInfo: Search,
  HeyReach: Send, Lemlist: Send, Instantly: Send, Smartlead: Send,
  HubSpot: Database, Pipedrive: Database, "Close CRM": Database,
  Clearbit: Layers, Lusha: Layers, Stripe: Layers,
};

function getToolIcon(name: string) {
  for (const [key, Icon] of Object.entries(TOOL_ICONS)) {
    if (name.includes(key)) return Icon;
  }
  return Layers;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const API_BASE = API_BASE_URL;

function loadAssignments(): Record<string, { campaign: string; stack: "A" | "B" }> {
  try { return JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || "{}"); } catch { return {}; }
}
function saveAssignments(map: Record<string, { campaign: string; stack: "A" | "B" }>) {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(map));
}

function CampaignChip({ campaignId, stack, campaigns }: { campaignId: string; stack: "A" | "B"; campaigns: CampaignOption[] }) {
  const campaign = campaigns.find(c => c.id === campaignId);
  if (!campaign) return null;
  const isA = stack === "A";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-400 truncate max-w-[140px]">{campaign.name}</span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border w-fit ${
        isA ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      }`}>
        <span className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold ${isA ? "bg-indigo-500" : "bg-emerald-500"} text-white`}>{stack}</span>
        {isA ? campaign.stackAName : campaign.stackBName}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: CampaignOption["status"] }) {
  const cfg = {
    active:    "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    completed: "bg-slate-700/40 text-slate-300 border-slate-600/40",
    paused:    "bg-amber-500/10 text-amber-300 border-amber-500/30",
  }[status];
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border uppercase ${cfg}`}>{status}</span>;
}

// ─── Assign Campaign Modal ──────────────────────────────────────────────────

const AssignCampaignModal = ({
  lead, currentCampaign, currentStack, onSave, onClose, campaigns,
}: {
  lead: LeadRow;
  currentCampaign?: string;
  currentStack?: "A" | "B";
  onSave: (campaignId: string, stack: "A" | "B") => void;
  onClose: () => void;
  campaigns: CampaignOption[];
}) => {
  const [selectedCampaign, setSelectedCampaign] = useState(currentCampaign ?? "");
  const [selectedStack, setSelectedStack]         = useState<"A" | "B">(currentStack ?? "A");

  const campaign = campaigns.find(c => c.id === selectedCampaign);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <FlaskConical size={18} className="text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-white">Assign to Campaign & Stack</h2>
              <p className="text-[11px] text-slate-400">{lead.name} · {lead.company}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Campaign picker */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">Select Campaign (A/B Experiment)</label>
            <div className="space-y-2">
              {campaigns.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedCampaign === c.id
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-slate-700 bg-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <FlaskConical size={14} className={selectedCampaign === c.id ? "text-indigo-400 mt-0.5" : "text-slate-500 mt-0.5"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-200 truncate">{c.name}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex gap-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-indigo-500 rounded-sm flex items-center justify-center text-[8px] font-bold text-white">A</span>
                        {c.stackAName}
                      </span>
                      <span className="text-slate-700">vs</span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-emerald-500 rounded-sm flex items-center justify-center text-[8px] font-bold text-white">B</span>
                        {c.stackBName}
                      </span>
                    </div>
                  </div>
                  {selectedCampaign === c.id && <Check size={14} className="text-indigo-400 shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          </div>

          {/* Stack picker — only shown once campaign is selected */}
          {campaign && (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">Assign to Stack</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["A", "B"] as const).map(side => {
                  const stackName  = side === "A" ? campaign.stackAName : campaign.stackBName;
                  const stackTools = side === "A" ? campaign.stackATools : campaign.stackBTools;
                  const isSelected = selectedStack === side;
                  return (
                    <button
                      key={side}
                      onClick={() => setSelectedStack(side)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? side === "A"
                            ? "border-indigo-500/50 bg-indigo-500/10"
                            : "border-emerald-500/50 bg-emerald-500/10"
                          : "border-slate-700 bg-slate-800/40 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${side === "A" ? "bg-indigo-500" : "bg-emerald-500"}`}>{side}</span>
                        <span className="text-xs font-semibold text-slate-200">{stackName}</span>
                        {isSelected && <Check size={12} className={side === "A" ? "text-indigo-400 ml-auto" : "text-emerald-400 ml-auto"} />}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {stackTools.map(tool => {
                          const Icon = getToolIcon(tool);
                          return (
                            <span key={tool} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">
                              <Icon size={9} />{tool}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-5 py-4 border-t border-slate-800 bg-slate-900/50">
          {currentCampaign && (
            <button
              onClick={() => onSave("", "A")}
              className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
            >
              Remove assignment
            </button>
          )}
          {!currentCampaign && <span />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={() => { if (selectedCampaign) onSave(selectedCampaign, selectedStack); }}
              disabled={!selectedCampaign}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
            >
              <Check size={14} /> Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Lead Details Drawer (updated with campaign/stack) ─────────────────────

const LeadDetailsDrawer = ({
  lead, onClose, onAssign, campaigns,
}: {
  lead: LeadRow;
  onClose: () => void;
  onAssign: () => void;
  campaigns: CampaignOption[];
}) => {
  const navigate = useNavigate();
  const campaign = lead.assignedCampaign ? campaigns.find(c => c.id === lead.assignedCampaign) : null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-950 border-l border-slate-800 h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-900/50">
          <div>
            <h2 className="text-xl font-bold text-white">{lead.name}</h2>
            <p className="text-sm text-slate-400 mt-1">{lead.title || "No Title"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-7">

          {/* Campaign & Stack assignment */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FlaskConical size={13} /> Campaign & Stack
            </h3>
            {campaign && lead.assignedStack ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-1">Experiment</div>
                    <div className="text-xs font-semibold text-slate-200">{campaign.name}</div>
                  </div>
                  <StatusBadge status={campaign.status} />
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 mb-1.5">Assigned Stack</div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                    lead.assignedStack === "A"
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  }`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white ${lead.assignedStack === "A" ? "bg-indigo-500" : "bg-emerald-500"}`}>
                      {lead.assignedStack}
                    </span>
                    {lead.assignedStack === "A" ? campaign.stackAName : campaign.stackBName}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 mb-1.5">Tools in this stack</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(lead.assignedStack === "A" ? campaign.stackATools : campaign.stackBTools).map(tool => {
                      const Icon = getToolIcon(tool);
                      return (
                        <span key={tool} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px] text-slate-300">
                          <Icon size={10} />{tool}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={onAssign}
                  className="w-full text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg py-1.5 transition-all text-center"
                >
                  Change assignment
                </button>
              </div>
            ) : (
              <button
                onClick={onAssign}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-400 text-sm transition-all"
              >
                <FlaskConical size={15} />
                Assign to campaign & stack
              </button>
            )}
          </div>

          {/* Contact details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Details</h3>
            {[
              { icon: Mail,     label: "Email",   value: lead.email || "No email" },
              { icon: Building, label: "Company", value: lead.company || "Unknown" },
              { icon: Globe,    label: "Source",  value: lead.source },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500"><Icon size={16} /></div>
                <div><p className="text-slate-400 text-xs">{label}</p><p className="text-slate-200">{value}</p></div>
              </div>
            ))}
          </div>

        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-900/50">
          <button onClick={() => navigate(`/leads/${lead.id}`)} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-950 font-bold text-sm hover:bg-white transition-colors">
            View Full Profile
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Import Modal ────────────────────────────────────────────────────────────

const SERVICE_ACCOUNT_EMAIL = "sync-bot@h3d8a5.iam.gserviceaccount.com";

const ImportLeadsModal = ({ workspaceId, onClose, onSave }: { workspaceId: string; onClose: () => void; onSave: () => void }) => {
  const [mode, setMode] = useState<"csv" | "gsheet">("csv");
  const [file, setFile] = useState<File | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getToken = () => localStorage.getItem("iqpipe_token");

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("workspaceId", workspaceId);
      const res = await fetch(`${API_BASE}/api/leads/upload-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setSuccess({ count: data.count ?? 0 });
      onSave();
      setTimeout(onClose, 2000);
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleGSheetSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/leads/sync-gsheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ workspaceId, sheetUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      setSuccess({ count: data.count ?? 0 });
      onSave();
      setTimeout(onClose, 2000);
    } catch (err: any) {
      setError(err.message || "Sync failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleRefreshSync = async () => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/leads/sync-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed.");
      setSuccess({ count: data.count ?? 0 });
      onSave();
    } catch (err: any) {
      setError(err.message || "Refresh failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Upload className="text-indigo-400" size={18} /> Import Leads
          </h2>
          <button onClick={onClose}><X className="text-slate-500 hover:text-white" size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button onClick={() => { setMode("csv"); setError(null); setSuccess(null); }} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === "csv" ? "bg-slate-800 text-white border-b-2 border-indigo-500" : "text-slate-400 hover:text-slate-200"}`}>
            Upload CSV
          </button>
          <button onClick={() => { setMode("gsheet"); setError(null); setSuccess(null); }} className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === "gsheet" ? "bg-slate-800 text-white border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"}`}>
            Google Sheets
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-rose-900/20 border border-rose-900/30 text-rose-300 rounded-lg text-xs flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-emerald-900/20 border border-emerald-900/30 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
              <span className="font-semibold">{success.count} lead{success.count !== 1 ? "s" : ""} imported successfully.</span>
              {mode === "gsheet" && <span className="text-emerald-400 ml-auto">Closing...</span>}
            </div>
          )}

          {/* ── CSV MODE ── */}
          {mode === "csv" && (
            <form onSubmit={handleCsvUpload} className="space-y-4">
              {/* Instructions */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-300">Required CSV format</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">Your file must have these exact column headers in the first row:</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Email", "First Name", "Last Name", "Company", "Title"].map((col, i) => (
                    <span key={col} className={`px-2 py-0.5 rounded text-[11px] font-mono border ${i === 0 ? "bg-indigo-900/30 border-indigo-700 text-indigo-300" : "bg-slate-700/50 border-slate-600 text-slate-300"}`}>
                      {col}{i === 0 && <span className="text-rose-400 ml-0.5">*</span>}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500"><span className="text-rose-400">*</span> Required. All other columns are optional.</p>
              </div>

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <Upload className="text-slate-400 mb-3" size={24} />
                <p className="text-sm text-white font-medium">{file ? file.name : "Click to select a CSV file"}</p>
                <p className="text-xs text-slate-500 mt-1">Only .csv files accepted</p>
                <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={e => { if (e.target.files) { setFile(e.target.files[0]); setError(null); setSuccess(null); } }} />
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={!file || uploading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                  {uploading ? "Uploading..." : "Upload & Import"}
                </button>
              </div>
            </form>
          )}

          {/* ── GOOGLE SHEETS MODE ── */}
          {mode === "gsheet" && (
            <div className="space-y-4">
              {/* Step-by-step instructions */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-300">How to connect your Google Sheet</p>
                <ol className="space-y-3">
                  <li className="flex gap-3 text-xs text-slate-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-900/50 border border-emerald-700 text-emerald-400 flex items-center justify-center font-bold text-[10px]">1</span>
                    <div>
                      <p className="font-medium text-slate-200">Open your Google Sheet and click <span className="text-white font-semibold">Share</span></p>
                      <p className="text-slate-400 mt-0.5">Add this email as a <span className="text-white">Viewer</span>:</p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL)}
                        className="mt-1 font-mono text-[11px] text-emerald-400 bg-black/30 px-2 py-1 rounded border border-emerald-900/40 hover:border-emerald-600 transition-colors cursor-copy break-all text-left"
                        title="Click to copy"
                      >
                        {SERVICE_ACCOUNT_EMAIL}
                      </button>
                    </div>
                  </li>
                  <li className="flex gap-3 text-xs text-slate-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-900/50 border border-emerald-700 text-emerald-400 flex items-center justify-center font-bold text-[10px]">2</span>
                    <div>
                      <p className="font-medium text-slate-200">Make sure your sheet has these column headers:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {["email", "firstName", "lastName", "company", "title"].map((col, i) => (
                          <span key={col} className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${i === 0 ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-slate-700 border-slate-600 text-slate-300"}`}>{col}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Or use <span className="font-mono">name</span> instead of firstName + lastName.</p>
                    </div>
                  </li>
                  <li className="flex gap-3 text-xs text-slate-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-900/50 border border-emerald-700 text-emerald-400 flex items-center justify-center font-bold text-[10px]">3</span>
                    <p className="font-medium text-slate-200">Paste the sheet URL below and click <span className="text-white font-semibold">Sync</span></p>
                  </li>
                </ol>
              </div>

              {/* URL input + sync */}
              <form onSubmit={handleGSheetSync} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Google Sheet URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-600 rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors"
                    value={sheetUrl}
                    onChange={e => { setSheetUrl(e.target.value); setError(null); }}
                  />
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleRefreshSync}
                    disabled={uploading}
                    className="px-3 py-2 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-40"
                    title="Re-sync using the previously saved sheet URL"
                  >
                    Re-sync saved sheet
                  </button>
                  <button
                    type="submit"
                    disabled={!sheetUrl || uploading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    {uploading ? "Syncing..." : "Sync Sheet"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── New Lead Modal (unchanged) ─────────────────────────────────────────────

const NewLeadModal = ({ workspaceId, onClose, onSave }: { workspaceId: string; onClose: () => void; onSave: () => void }) => {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", title: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res = await fetch(`${API_BASE}/api/leads`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, workspaceId }) });
      if (res.ok) { onSave(); onClose(); } else { alert("Failed to create lead."); }
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2"><UserPlus size={20} /> New Lead</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input placeholder="First Name" required className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <input placeholder="Last Name" required className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <input placeholder="Email" required type="email" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Company" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
          <input placeholder="Job Title" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold">{saving ? "Saving..." : "Create Lead"}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Deduplicate Confirm Modal ───────────────────────────────────────────────

const DeduplicateConfirmModal = ({
  dupeCount,
  onConfirm,
  onClose,
  loading,
}: {
  dupeCount: number;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) => (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl border border-rose-800/50 bg-slate-900 shadow-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-slate-800 bg-slate-900/50">
        <AlertTriangle size={18} className="text-rose-400" />
        <div>
          <h2 className="text-sm font-bold text-white">Deduplicate Contacts</h2>
          <p className="text-[11px] text-slate-400">This action cannot be undone</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-300">
          Found <span className="font-bold text-rose-300">{dupeCount} duplicate contact{dupeCount !== 1 ? "s" : ""}</span> based on matching email addresses.
        </p>
        <div className="rounded-xl bg-rose-900/10 border border-rose-800/30 p-4 text-xs space-y-1.5">
          <p className="font-semibold text-rose-300">What will happen:</p>
          <ul className="space-y-1 text-rose-400/80 list-disc list-inside">
            <li>{dupeCount} duplicate record{dupeCount !== 1 ? "s" : ""} will be permanently deleted</li>
            <li>The original (oldest) contact per email will be kept</li>
            <li>This action is irreversible and cannot be undone</li>
          </ul>
        </div>
      </div>
      <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-800 bg-slate-900/50">
        <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
          {loading ? "Removing..." : `Remove ${dupeCount} duplicate${dupeCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  </div>
);

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads]           = useState<LeadRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [campaigns, setCampaigns]   = useState<CampaignOption[]>([]);

  // Assignments (persisted in localStorage)
  const [assignments, setAssignments] = useState<Record<string, { campaign: string; stack: "A" | "B" }>>(loadAssignments);

  // Modal state
  const [viewLead, setViewLead]         = useState<LeadRow | null>(null);
  const [assignLead, setAssignLead]     = useState<LeadRow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDedupModalOpen, setIsDedupModalOpen]   = useState(false);
  const [deduplicating, setDeduplicating]         = useState(false);
  const [icpScoring, setIcpScoring]               = useState(false);
  const [icpMsg, setIcpMsg]                       = useState<string | null>(null);

  // Filters
  const [ownerFilter, setOwnerFilter]       = useState("all");
  const [sourceFilter, setSourceFilter]     = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");

  useEffect(() => {
    async function getWs() {
      const token = localStorage.getItem("iqpipe_token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/api/workspaces/primary`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setWorkspaceId(data.id);
          // Load experiments as campaign options
          const expRes = await fetch(`${API_BASE}/api/experiments?workspaceId=${data.id}`);
          if (expRes.ok) {
            const exps = await expRes.json();
            setCampaigns((exps as any[]).map(experimentToCampaign));
          }
        }
      } catch {}
    }
    getWs();
  }, []);

  const fetchLeads = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res = await fetch(`${API_BASE}/api/leads?workspaceId=${encodeURIComponent(workspaceId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setLeads(json.leads || []);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, [workspaceId]);

  const handleICPScore = async () => {
    if (!workspaceId) return;
    setIcpScoring(true);
    setIcpMsg(null);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res = await fetch(`${API_BASE_URL}/api/icp/score-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, unscoredOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed");
      setIcpMsg(data.scored === 0 ? "All contacts already scored" : `${data.scored} new contacts scored`);
      setTimeout(() => setIcpMsg(null), 3000);
      fetchLeads();
    } catch (e: any) {
      setIcpMsg(e.message || "Scoring failed");
      setTimeout(() => setIcpMsg(null), 3000);
    } finally {
      setIcpScoring(false);
    }
  };

  // Merge assignments into leads
  const leadsWithAssignments = useMemo(() =>
    leads.map(l => ({
      ...l,
      assignedCampaign: assignments[l.id]?.campaign,
      assignedStack:    assignments[l.id]?.stack,
    })),
    [leads, assignments]
  );

  const handleAssignSave = (leadId: string, campaignId: string, stack: "A" | "B") => {
    const next = { ...assignments };
    if (!campaignId) {
      delete next[leadId];
    } else {
      next[leadId] = { campaign: campaignId, stack };
    }
    setAssignments(next);
    saveAssignments(next);
    // Refresh viewLead/assignLead with new data
    setAssignLead(null);
    if (viewLead?.id === leadId) {
      setViewLead(l => l ? { ...l, assignedCampaign: campaignId || undefined, assignedStack: campaignId ? stack : undefined } : null);
    }
  };


  // Duplicate detection: leads is sorted desc (newest first).
  // Keep oldest per email — mark all newer duplicates as dupes.
  const duplicateIds = useMemo(() => {
    const seenEmails = new Map<string, string>(); // email -> oldest id
    // traverse from end (oldest) to start (newest)
    for (let i = leads.length - 1; i >= 0; i--) {
      const lead = leads[i];
      if (!lead.email) continue;
      const key = lead.email.toLowerCase().trim();
      if (!seenEmails.has(key)) seenEmails.set(key, lead.id);
    }
    const dupeSet = new Set<string>();
    for (const lead of leads) {
      if (!lead.email) continue;
      const key = lead.email.toLowerCase().trim();
      if (seenEmails.get(key) !== lead.id) dupeSet.add(lead.id);
    }
    return dupeSet;
  }, [leads]);

  const handleDeduplicate = async () => {
    if (!workspaceId) return;
    setDeduplicating(true);
    try {
      const token = localStorage.getItem("iqpipe_token");
      const res = await fetch(`${API_BASE}/api/leads/deduplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deduplication failed.");
      setIsDedupModalOpen(false);
      fetchLeads();
    } catch (err: any) {
      alert(err.message || "Deduplication failed.");
    } finally {
      setDeduplicating(false);
    }
  };

  const ownerOptions   = useMemo(() => Array.from(new Set(leads.map(l => l.owner))).sort(), [leads]);
  const sourceOptions  = useMemo(() => Array.from(new Set(leads.map(l => l.source))).sort(), [leads]);
  const statusOptions  = useMemo(() => Array.from(new Set(leads.map(l => l.status))).sort(), [leads]);

  const filteredLeads = useMemo(() => leadsWithAssignments.filter(l => {
    if (ownerFilter !== "all" && l.owner !== ownerFilter) return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (campaignFilter !== "all") {
      if (campaignFilter === "unassigned" && l.assignedCampaign) return false;
      if (campaignFilter !== "unassigned" && l.assignedCampaign !== campaignFilter) return false;
    }
    return true;
  }), [leadsWithAssignments, ownerFilter, sourceFilter, statusFilter, campaignFilter]);

  const assignedCount   = leadsWithAssignments.filter(l => l.assignedCampaign).length;
  const unassignedCount = leadsWithAssignments.length - assignedCount;

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Manage prospects and assign them to A/B campaigns and GTM stacks."
      />
      {error && <div className="mt-4 p-3 bg-rose-900/20 border border-rose-800 text-rose-200 rounded-lg text-sm flex items-center gap-2"><AlertCircle size={16} />{error}</div>}

      {/* Assignment summary bar */}
      <div className="mt-5 flex flex-wrap gap-3">
        {[
          { label: "Total contacts",  value: leadsWithAssignments.length, color: "text-white" },
          { label: "Assigned to campaign", value: assignedCount, color: "text-indigo-300" },
          { label: "Unassigned",      value: unassignedCount, color: "text-slate-400" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className={`font-bold ${s.color}`}>{s.value}</span>
            <span className="text-slate-500">{s.label}</span>
          </div>
        ))}
        {duplicateIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-900/20 border border-rose-800/40 text-xs">
            <AlertTriangle size={12} className="text-rose-400" />
            <span className="font-bold text-rose-300">{duplicateIds.size}</span>
            <span className="text-rose-400/70">duplicate{duplicateIds.size !== 1 ? "s" : ""} detected</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="my-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <select className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 cursor-pointer" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            <option value="all">All Owners</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 cursor-pointer" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="all">All Sources</option>
            {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 cursor-pointer" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Any Status</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* Campaign filter */}
          <select className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 cursor-pointer" value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}>
            <option value="all">All Campaigns</option>
            <option value="unassigned">Unassigned</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {loading && <Loader2 className="animate-spin text-slate-500" size={16} />}
        </div>

        <div className="flex items-center gap-3">
          {duplicateIds.size > 0 && (
            <button
              onClick={() => setIsDedupModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 hover:text-rose-200 rounded-lg text-sm font-medium border border-rose-800/50 hover:border-rose-700 transition-colors"
              title="Remove duplicate contacts"
            >
              <AlertTriangle size={14} /> Deduplicate ({duplicateIds.size})
            </button>
          )}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleICPScore}
              disabled={icpScoring || !workspaceId}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-medium border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Run ICP scoring on all contacts"
            >
              {icpScoring
                ? <><Loader2 size={14} className="animate-spin" /> Scoring…</>
                : <><Flame size={14} className="text-rose-400" /> ICP Score</>
              }
            </button>
            {icpMsg && (
              <span className="text-[10px] text-emerald-400">{icpMsg}</span>
            )}
          </div>
          <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium border border-slate-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-indigo-500/20">
            <Plus size={16} /> New Lead
          </button>
        </div>
      </div>

      <DataTable<LeadRow>
        onRowClick={row => setViewLead({ ...row, assignedCampaign: assignments[row.id]?.campaign, assignedStack: assignments[row.id]?.stack })}
        rowClassName={row => duplicateIds.has(row.id) ? "bg-rose-950/30 border-l-2 border-l-rose-700/60" : ""}
        columns={[
          {
            key: "id", header: "IQP ID",
            render: row => <span className="font-mono text-[10px] text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">{row.id}</span>,
          },
          {
            key: "name", header: "Contact",
            render: row => <div><div className="text-slate-100 font-medium">{row.name}</div><div className="text-xs text-slate-400">{row.title}</div></div>,
          },
          { key: "company", header: "Account" },
          {
            key: "source", header: "Source",
            render: row => <span className="px-2 py-1 rounded bg-slate-800 text-xs text-slate-300 border border-slate-700">{row.source}</span>,
          },
          {
            key: "assignedCampaign" as any, header: "Campaign & Stack",
            render: (row: LeadRow) => {
              const a = assignments[row.id];
              if (a?.campaign) {
                return (
                  <button
                    onClick={e => { e.stopPropagation(); setAssignLead({ ...row, assignedCampaign: a.campaign, assignedStack: a.stack }); }}
                    className="text-left hover:opacity-80 transition-opacity"
                  >
                    <CampaignChip campaignId={a.campaign} stack={a.stack} campaigns={campaigns} />
                  </button>
                );
              }
              return (
                <button
                  onClick={e => { e.stopPropagation(); setAssignLead(row); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-slate-700 hover:border-indigo-500/50 text-slate-600 hover:text-indigo-400 text-xs transition-all"
                >
                  <FlaskConical size={11} /> Assign
                </button>
              );
            },
          },
          {
            key: "fitScore" as any, header: "ICP Grade",
            render: (row: LeadRow) => <ICPGradePill fitScore={row.fitScore} />,
          },
          { key: "owner", header: "Owner" },
        ]}
        data={filteredLeads}
      />

      {/* Modals */}
      {viewLead && (
        <LeadDetailsDrawer
          lead={viewLead}
          campaigns={campaigns}
          onClose={() => setViewLead(null)}
          onAssign={() => { setAssignLead(viewLead); setViewLead(null); }}
        />
      )}
      {assignLead && (
        <AssignCampaignModal
          lead={assignLead}
          campaigns={campaigns}
          currentCampaign={assignments[assignLead.id]?.campaign}
          currentStack={assignments[assignLead.id]?.stack}
          onSave={(campaignId, stack) => handleAssignSave(assignLead.id, campaignId, stack)}
          onClose={() => setAssignLead(null)}
        />
      )}
      {isCreateModalOpen && workspaceId && (
        <NewLeadModal workspaceId={workspaceId} onClose={() => setIsCreateModalOpen(false)} onSave={fetchLeads} />
      )}
      {isImportModalOpen && workspaceId && (
        <ImportLeadsModal workspaceId={workspaceId} onClose={() => setIsImportModalOpen(false)} onSave={fetchLeads} />
      )}
      {isDedupModalOpen && (
        <DeduplicateConfirmModal
          dupeCount={duplicateIds.size}
          onConfirm={handleDeduplicate}
          onClose={() => setIsDedupModalOpen(false)}
          loading={deduplicating}
        />
      )}
    </div>
  );
}
