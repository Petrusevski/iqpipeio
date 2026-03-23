import { useState, useEffect } from "react";
import {
  GitBranch, Plus, Trash2, ChevronUp, ChevronDown,
  Save, RefreshCw, Info, ArrowDown,
  ChevronRight, Pencil, X, Layers,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

interface ToolDef {
  label: string;
  channel: string;
  events: { value: string; label: string }[];
}

const ALL_TOOLS: Record<string, ToolDef> = {
  apollo:        { label: "Apollo",           channel: "prospecting", events: [{ value: "lead_imported", label: "Leads imported" }, { value: "email_sent", label: "Email sent" }, { value: "reply_received", label: "Reply received" }] },
  clay:          { label: "Clay",             channel: "prospecting", events: [{ value: "lead_imported", label: "Leads imported" }, { value: "lead_enriched", label: "Leads enriched" }] },
  zoominfo:      { label: "ZoomInfo",         channel: "prospecting", events: [{ value: "lead_imported", label: "Leads imported" }] },
  pdl:           { label: "People Data Labs", channel: "enrichment",  events: [{ value: "lead_enriched", label: "Leads enriched" }] },
  clearbit:      { label: "Clearbit",         channel: "enrichment",  events: [{ value: "lead_enriched", label: "Leads enriched" }] },
  hunter:        { label: "Hunter.io",        channel: "enrichment",  events: [{ value: "lead_enriched", label: "Email verified" }] },
  lusha:         { label: "Lusha",            channel: "enrichment",  events: [{ value: "lead_enriched", label: "Leads enriched" }] },
  cognism:       { label: "Cognism",          channel: "enrichment",  events: [{ value: "lead_enriched", label: "Leads enriched" }] },
  heyreach:      { label: "HeyReach",         channel: "linkedin",    events: [{ value: "connection_sent", label: "Connection request sent" }, { value: "connection_accepted", label: "Connection accepted" }, { value: "message_sent", label: "Message sent" }, { value: "reply_received", label: "Reply received" }] },
  phantombuster: { label: "PhantomBuster",    channel: "linkedin",    events: [{ value: "connection_request_sent", label: "Connection request sent" }, { value: "connection_accepted", label: "Connection accepted" }, { value: "message_sent", label: "Message sent" }] },
  instantly:     { label: "Instantly",        channel: "email",       events: [{ value: "sequence_started", label: "Sequence started" }, { value: "email_sent", label: "Email sent" }, { value: "email_opened", label: "Email opened" }, { value: "email_clicked", label: "Link clicked" }, { value: "reply_received", label: "Reply received" }, { value: "meeting_booked", label: "Meeting booked" }, { value: "email_bounced", label: "Email bounced" }] },
  lemlist:       { label: "Lemlist",          channel: "email",       events: [{ value: "sequence_started", label: "Sequence started" }, { value: "email_sent", label: "Email sent" }, { value: "email_opened", label: "Email opened" }, { value: "reply_received", label: "Reply received" }, { value: "email_bounced", label: "Email bounced" }] },
  smartlead:     { label: "Smartlead",        channel: "email",       events: [{ value: "sequence_started", label: "Sequence started" }, { value: "email_sent", label: "Email sent" }, { value: "reply_received", label: "Reply received" }] },
  replyio:       { label: "Reply.io",         channel: "email",       events: [{ value: "sequence_started", label: "Sequence started" }, { value: "email_sent", label: "Email sent" }, { value: "reply_received", label: "Reply received" }, { value: "meeting_booked", label: "Meeting booked" }] },
  outreach:      { label: "Outreach",         channel: "email",       events: [{ value: "sequence_started", label: "Sequence started" }, { value: "email_sent", label: "Email sent" }, { value: "reply_received", label: "Reply received" }, { value: "meeting_booked", label: "Meeting booked" }] },
  hubspot:       { label: "HubSpot",          channel: "crm",         events: [{ value: "deal_created", label: "Deal created" }, { value: "deal_won", label: "Deal won" }, { value: "deal_lost", label: "Deal lost" }] },
  salesforce:    { label: "Salesforce",       channel: "crm",         events: [{ value: "deal_created", label: "Opportunity created" }, { value: "deal_won", label: "Opportunity won" }, { value: "deal_lost", label: "Opportunity lost" }] },
  pipedrive:     { label: "Pipedrive",        channel: "crm",         events: [{ value: "deal_created", label: "Deal created" }, { value: "deal_won", label: "Deal won" }] },
  attio:         { label: "Attio",            channel: "crm",         events: [{ value: "deal_created", label: "Record created" }, { value: "deal_won", label: "Deal won" }] },
  stripe:        { label: "Stripe",           channel: "billing",     events: [{ value: "deal_created", label: "Payment received" }, { value: "deal_won", label: "Subscription activated" }] },
  n8n:           { label: "n8n",              channel: "automation",  events: [{ value: "sequence_started", label: "Workflow triggered" }] },
  make:          { label: "Make.com",         channel: "automation",  events: [{ value: "sequence_started", label: "Scenario triggered" }] },
};

const CHANNEL_COLOR: Record<string, string> = {
  prospecting: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  enrichment:  "text-violet-400 bg-violet-500/10 border-violet-500/30",
  email:       "text-blue-400 bg-blue-500/10 border-blue-500/30",
  linkedin:    "text-sky-400 bg-sky-500/10 border-sky-500/30",
  crm:         "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  billing:     "text-amber-400 bg-amber-500/10 border-amber-500/30",
  automation:  "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30",
};

// Domain mapping for favicon logos
const TOOL_DOMAINS: Record<string, string> = {
  apollo:        "apollo.io",
  clay:          "clay.com",
  zoominfo:      "zoominfo.com",
  pdl:           "peopledatalabs.com",
  clearbit:      "clearbit.com",
  hunter:        "hunter.io",
  lusha:         "lusha.com",
  cognism:       "cognism.com",
  heyreach:      "heyreach.io",
  phantombuster: "phantombuster.com",
  instantly:     "instantly.ai",
  lemlist:       "lemlist.com",
  smartlead:     "smartlead.ai",
  replyio:       "reply.io",
  outreach:      "outreach.io",
  hubspot:       "hubspot.com",
  salesforce:    "salesforce.com",
  pipedrive:     "pipedrive.com",
  attio:         "attio.com",
  stripe:        "stripe.com",
  n8n:           "n8n.io",
  make:          "make.com",
};

const CONDITION_PRESETS = [
  "always",
  "if reply received",
  "if connection accepted",
  "if email opened",
  "if link clicked",
  "if meeting booked",
  "if no reply after 3 days",
  "if enrichment successful",
  "if ICP match",
];

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  id: string;
  tool: string;
  eventType: string;
  label: string;
  condition: string;
  note: string;
}

interface WorkflowStack {
  id: string;
  name: string;
  steps: WorkflowStep[];
  createdAt: string;
}

function newStep(): WorkflowStep {
  return { id: crypto.randomUUID(), tool: "", eventType: "", label: "", condition: "always", note: "" };
}

function newStack(name: string): WorkflowStack {
  return { id: crypto.randomUUID(), name, steps: [newStep()], createdAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL AVATAR  — favicon logo with initial fallback
// ─────────────────────────────────────────────────────────────────────────────

function ToolAvatar({ tool, size = "md" }: { tool: string; size?: "sm" | "md" | "lg" }) {
  const [errored, setErrored] = useState(false);
  const domain = TOOL_DOMAINS[tool];
  const label  = ALL_TOOLS[tool]?.label ?? tool;
  const ch     = ALL_TOOLS[tool]?.channel ?? "";
  const color  = CHANNEL_COLOR[ch] ?? "text-slate-400 bg-slate-700/30 border-slate-700";

  const dim    = size === "sm" ? "h-5 w-5 text-[8px]"
               : size === "lg" ? "h-9 w-9 text-xs"
               : "h-7 w-7 text-[10px]";
  const imgPx  = size === "sm" ? 16 : size === "lg" ? 28 : 22;

  if (!domain || errored) {
    return (
      <div title={label} className={`${dim} rounded-lg border flex items-center justify-center font-bold shrink-0 uppercase ${color}`}>
        {label[0]}
      </div>
    );
  }
  return (
    <div title={label} className={`${dim} rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0 border border-white/10`}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={label}
        width={imgPx}
        height={imgPx}
        className="object-contain"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP CARD
// ─────────────────────────────────────────────────────────────────────────────

function StepCard({
  step, index, total, connected,
  onChange, onDelete, onMove,
}: {
  step: WorkflowStep; index: number; total: number; connected: Set<string>;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const toolDef = ALL_TOOLS[step.tool];
  const ch = toolDef?.channel ?? "";
  const chColor = CHANNEL_COLOR[ch] ?? "text-slate-400 bg-slate-700/30 border-slate-700";
  const isConnected = connected.has(step.tool);

  const sortedTools = Object.entries(ALL_TOOLS).sort(([a], [b]) => {
    const ac = connected.has(a) ? 0 : 1;
    const bc = connected.has(b) ? 0 : 1;
    return ac - bc || ALL_TOOLS[a].label.localeCompare(ALL_TOOLS[b].label);
  });

  return (
    <div className="relative">
      <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 select-none">
        {index + 1}
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-4 mb-4">

          <div>
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">Tool</label>
            <div className="relative">
              <select
                value={step.tool}
                onChange={e => onChange({ tool: e.target.value, eventType: "" })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
              >
                <option value="">— select tool —</option>
                {connected.size > 0 && (
                  <optgroup label="Connected">
                    {sortedTools.filter(([k]) => connected.has(k)).map(([k, def]) => (
                      <option key={k} value={k}>{def.label}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All tools">
                  {sortedTools.filter(([k]) => !connected.has(k)).map(([k, def]) => (
                    <option key={k} value={k}>{def.label}</option>
                  ))}
                </optgroup>
              </select>
              {step.tool && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {isConnected
                    ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"/>
                    : <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block"/>
                  }
                </div>
              )}
            </div>
            {step.tool && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <ToolAvatar tool={step.tool} size="sm" />
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${chColor}`}>{ch}</span>
                {!isConnected && <span className="text-[10px] text-slate-600 italic">not connected</span>}
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">Expected event</label>
            <select
              value={step.eventType}
              onChange={e => onChange({ eventType: e.target.value })}
              disabled={!step.tool}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
            >
              <option value="">— select event —</option>
              {toolDef?.events.map(ev => (
                <option key={ev.value} value={ev.value}>{ev.label}</option>
              ))}
            </select>
            {step.eventType && (
              <code className="text-[10px] text-indigo-400 font-mono mt-1 block">{step.eventType}</code>
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
              Step name <span className="normal-case text-slate-700 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={step.label}
              onChange={e => onChange({ label: e.target.value })}
              placeholder={toolDef ? `e.g. ${toolDef.label} outreach` : "Describe this step"}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
            Notes <span className="normal-case text-slate-700 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={step.note}
            onChange={e => onChange({ note: e.target.value })}
            placeholder="e.g. Only contacts with work email, 50 leads/day limit"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1">
            <button onClick={() => onMove(-1)} disabled={index === 0}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronUp size={13}/>
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronDown size={13}/>
            </button>
          </div>
          <button onClick={onDelete}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 text-xs transition-colors">
            <Trash2 size={11}/> Remove step
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTOR
// ─────────────────────────────────────────────────────────────────────────────

function StepConnector({ condition, onChange }: { condition: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col items-center gap-1 py-1 select-none">
      <div className="w-px h-4 bg-slate-700"/>
      <ArrowDown size={12} className="text-slate-700"/>
      {editing ? (
        <select autoFocus value={condition}
          onChange={e => { onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className="bg-slate-800 border border-indigo-500/60 rounded-lg px-2 py-1 text-xs text-white outline-none">
          {CONDITION_PRESETS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <button onClick={() => setEditing(true)}
          className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
            condition && condition !== "always"
              ? "border-indigo-500/40 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20"
              : "border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-600 bg-slate-900"
          }`}>
          {condition || "always"} ↓
        </button>
      )}
      <div className="w-px h-4 bg-slate-700"/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STACK EDITOR (inline builder used for new + expanded edit)
// ─────────────────────────────────────────────────────────────────────────────

function StackEditor({
  stack, connected, onSave, onCancel, saving,
}: {
  stack: WorkflowStack;
  connected: Set<string>;
  onSave: (updated: WorkflowStack) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName]   = useState(stack.name);
  const [steps, setSteps] = useState<WorkflowStep[]>(stack.steps);

  const updateStep = (id: string, patch: Partial<WorkflowStep>) =>
    setSteps(s => s.map(step => step.id === id ? { ...step, ...patch } : step));
  const deleteStep = (id: string) =>
    setSteps(s => s.filter(step => step.id !== id));
  const moveStep = (id: string, dir: -1 | 1) =>
    setSteps(s => {
      const idx = s.findIndex(step => step.id === id);
      if (idx < 0) return s;
      const next = idx + dir;
      if (next < 0 || next >= s.length) return s;
      const arr = [...s];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  const addStep = () => setSteps(s => [...s, newStep()]);

  const unconnected = steps.filter(s => s.tool && !connected.has(s.tool));
  const complete    = steps.filter(s => s.tool && s.eventType).length;

  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl overflow-hidden">
      {/* Editor header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
        <div className="flex-1">
          <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider block mb-1">Stack name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Cold Outbound — LinkedIn + Email"
            className="bg-transparent text-white text-sm font-semibold placeholder:text-slate-600 outline-none border-b border-slate-700 focus:border-indigo-500 pb-0.5 w-full max-w-sm transition-colors"
          />
        </div>
        <button onClick={onCancel}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors">
          <X size={14}/>
        </button>
      </div>

      {/* Step builder */}
      <div className="px-5 py-5">
        {unconnected.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-5 text-[11px] text-amber-400">
            <span className="font-semibold">
              {unconnected.map(s => ALL_TOOLS[s.tool]?.label ?? s.tool).join(", ")}
            </span>
            &nbsp;{unconnected.length === 1 ? "is" : "are"} not connected yet.
          </div>
        )}

        {steps.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-xs">
            No steps. Add one below.
          </div>
        ) : (
          <div className="pl-10">
            {steps.map((step, i) => (
              <div key={step.id}>
                <StepCard
                  step={step} index={i} total={steps.length} connected={connected}
                  onChange={patch => updateStep(step.id, patch)}
                  onDelete={() => deleteStep(step.id)}
                  onMove={dir => moveStep(step.id, dir)}
                />
                {i < steps.length - 1 && (
                  <StepConnector
                    condition={steps[i + 1].condition}
                    onChange={v => updateStep(steps[i + 1].id, { condition: v })}
                  />
                )}
              </div>
            ))}
            <div className="flex flex-col items-center gap-1 pt-2">
              <div className="w-px h-4 bg-slate-800"/>
              <button onClick={addStep}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white text-sm font-medium transition-all">
                <Plus size={14}/> Add step
              </button>
            </div>
          </div>
        )}

        {steps.length === 0 && (
          <div className="flex justify-center mt-2">
            <button onClick={addStep}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white text-sm font-semibold transition-colors">
              <Plus size={14}/> Add first step
            </button>
          </div>
        )}
      </div>

      {/* Editor footer */}
      <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800 bg-slate-900/60">
        <p className="text-[11px] text-slate-700">
          {complete} of {steps.length} step{steps.length !== 1 ? "s" : ""} complete
          {complete < steps.length && <span className="text-amber-600"> · some steps incomplete</span>}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave({ ...stack, name: name.trim() || "Untitled Stack", steps })}
            disabled={saving || steps.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {saving ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>}
            {saving ? "Saving…" : "Save stack"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STACK CARD (collapsed / expanded summary)
// ─────────────────────────────────────────────────────────────────────────────

function StackCard({
  stack, connected, expanded,
  onToggle, onEdit, onDelete,
}: {
  stack: WorkflowStack;
  connected: Set<string>;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Unique channels in this stack
  const channels = Array.from(new Set(
    stack.steps.filter(s => s.tool && ALL_TOOLS[s.tool]).map(s => ALL_TOOLS[s.tool].channel)
  ));
  const completeCount = stack.steps.filter(s => s.tool && s.eventType).length;
  const connectedCount = stack.steps.filter(s => s.tool && connected.has(s.tool)).length;

  return (
    <div className={`rounded-2xl border transition-all ${expanded ? "border-indigo-500/30 bg-slate-900" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
      >
        <div className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>
          <ChevronRight size={14} className="text-slate-500"/>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-white truncate">{stack.name}</span>
            <span className="text-[10px] text-slate-600 shrink-0">
              {stack.steps.length} step{stack.steps.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Logo chain — tool avatars with arrows */}
          <div className="flex items-center gap-1 flex-wrap mb-1.5">
            {stack.steps.filter(s => s.tool).slice(0, 6).map((step, i) => (
              <div key={step.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-[10px] text-slate-700">→</span>}
                <ToolAvatar tool={step.tool} size="sm" />
              </div>
            ))}
            {stack.steps.filter(s => s.tool).length > 6 && (
              <span className="text-[10px] text-slate-600 ml-0.5">
                +{stack.steps.filter(s => s.tool).length - 6}
              </span>
            )}
          </div>

          {/* Channel badges */}
          <div className="flex items-center gap-1 flex-wrap">
            {channels.map(ch => (
              <span key={ch} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${CHANNEL_COLOR[ch] ?? "text-slate-400 bg-slate-700/30 border-slate-700"}`}>
                {ch}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-slate-600">
              <span className={connectedCount === stack.steps.length && stack.steps.length > 0 ? "text-emerald-400" : "text-slate-500"}>
                {connectedCount}/{stack.steps.length}
              </span> connected
            </div>
            <div className="text-[10px] text-slate-600">
              {completeCount}/{stack.steps.length} complete
            </div>
          </div>
        </div>
      </button>

      {/* Expanded step summary */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-800">
          <div className="mt-4 space-y-1.5">
            {stack.steps.map((step, i) => {
              const def = ALL_TOOLS[step.tool];
              const ch = def?.channel ?? "";
              const chColor = CHANNEL_COLOR[ch] ?? "text-slate-500 bg-slate-700/20 border-slate-700";
              return (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-0.5 mt-1 shrink-0">
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold text-slate-500 flex items-center justify-center">{i + 1}</span>
                    {i < stack.steps.length - 1 && <div className="w-px h-3 bg-slate-800"/>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap py-0.5">
                    {def ? (
                      <div className="flex items-center gap-1.5">
                        <ToolAvatar tool={step.tool} size="sm" />
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${chColor}`}>{def.label}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-600 italic">no tool</span>
                    )}
                    {step.eventType && (
                      <>
                        <span className="text-[10px] text-slate-700">→</span>
                        <code className="text-[10px] text-indigo-400 font-mono">{step.eventType}</code>
                      </>
                    )}
                    {step.label && (
                      <span className="text-[10px] text-slate-500">— {step.label}</span>
                    )}
                    {step.condition && step.condition !== "always" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">{step.condition}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white text-xs font-medium transition-colors">
              <Pencil size={11}/> Edit stack
            </button>
            <button onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/20 hover:border-rose-500/40 text-slate-600 hover:text-rose-400 text-xs font-medium transition-colors">
              <Trash2 size={11}/> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function MyWorkflowPage() {
  const [stacks,      setStacks]      = useState<WorkflowStack[]>([]);
  const [connected,   setConnected]   = useState<Set<string>>(new Set());
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);

  // Which stack is currently being edited (id = existing, "new" = new builder, null = none)
  const [editingId,   setEditingId]   = useState<string | null>(null);
  // Which stack card is expanded (showing step summary)
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  const token = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/workspaces/primary`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setWorkspaceId(d.id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    fetch(`${API_BASE_URL}/api/workflow-map?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setStacks(d.stacks ?? []);
          setConnected(new Set(d.connectedTools ?? []));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const persist = async (updated: WorkflowStack[]) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/api/workflow-map`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, stacks: updated }),
      });
    } catch {} finally { setSaving(false); }
  };

  const handleSave = (updated: WorkflowStack) => {
    let next: WorkflowStack[];
    if (editingId === "new") {
      next = [...stacks, updated];
    } else {
      next = stacks.map(s => s.id === updated.id ? updated : s);
    }
    setStacks(next);
    persist(next);
    setEditingId(null);
    // Expand the card we just saved so user can see the result
    setExpandedId(updated.id);
  };

  const handleDelete = (id: string) => {
    const next = stacks.filter(s => s.id !== id);
    setStacks(next);
    persist(next);
    if (expandedId === id) setExpandedId(null);
  };

  const editingStack = editingId === "new"
    ? null  // new stack — StackEditor will create it
    : stacks.find(s => s.id === editingId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-600 text-sm gap-2">
        <RefreshCw size={14} className="animate-spin"/> Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-6 max-w-3xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <GitBranch size={18} className="text-indigo-400 mt-0.5 shrink-0"/>
          <div>
            <h1 className="text-base font-bold text-white leading-none">My GTM Workflow</h1>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-lg">
              Map your GTM stacks step by step. Save multiple stacks — each represents a different workflow. iqpipe uses these to follow expected event sequences from connected tools.
            </p>
          </div>
        </div>

        {editingId === null && (
          <button
            onClick={() => { setEditingId("new"); setExpandedId(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white text-sm font-semibold transition-colors shrink-0"
          >
            <Plus size={13}/> New stack
          </button>
        )}
      </div>

      {/* ── Context callout ── */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 mb-8">
        <Info size={13} className="text-indigo-400 shrink-0 mt-0.5"/>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Each stack is a named sequence of tools and events. Once saved, iqpipe knows which tool should fire which event at each stage. Deviations surface in{" "}
          <a href="/workflow-health" className="text-indigo-400 hover:text-indigo-300 underline">Workflow Health</a>.
          Tools not connected yet are a reminder to add them in{" "}
          <a href="/integrations" className="text-indigo-400 hover:text-indigo-300 underline">Integrations</a>.
        </p>
      </div>

      {/* ── New stack editor ── */}
      {editingId === "new" && (
        <div className="mb-6">
          <StackEditor
            stack={newStack("")}
            connected={connected}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      {/* ── Edit existing stack editor ── */}
      {editingId !== null && editingId !== "new" && editingStack && (
        <div className="mb-6">
          <StackEditor
            stack={editingStack}
            connected={connected}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setEditingId(null)}
          />
        </div>
      )}

      {/* ── Saved stacks list ── */}
      {stacks.length === 0 && editingId === null ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
            <Layers size={20} className="text-slate-600"/>
          </div>
          <p className="text-slate-400 text-sm font-medium mb-1">No stacks yet</p>
          <p className="text-slate-600 text-xs max-w-xs mb-6">
            Create your first GTM stack — define which tools fire which events at each stage.
          </p>
          <button onClick={() => setEditingId("new")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white text-sm font-semibold transition-colors">
            <Plus size={14}/> Create first stack
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {stacks.map(stack => (
            editingId === stack.id ? null : (
              <StackCard
                key={stack.id}
                stack={stack}
                connected={connected}
                expanded={expandedId === stack.id}
                onToggle={() => setExpandedId(prev => prev === stack.id ? null : stack.id)}
                onEdit={() => { setEditingId(stack.id); setExpandedId(null); }}
                onDelete={() => handleDelete(stack.id)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}
