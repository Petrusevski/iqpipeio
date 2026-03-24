/**
 * MakeSetupGuide.tsx
 *
 * Step-by-step guide shown inside AutomationHealthPage when a Make.com
 * scenario is being configured. Shows the exact JSON body to use in the
 * Make HTTP module, the webhook URL, and optional field reference.
 */

import { useState } from "react";
import {
  Copy, CheckCircle2, ChevronDown, ChevronRight,
  Zap, Globe, Code2,
} from "lucide-react";

interface Props {
  webhookUrl: string;
  scenarioName?: string;
  defaultEventType?: string;
}

const EVENT_TYPE_OPTIONS = [
  { value: "email_sent",            label: "Email sent" },
  { value: "linkedin_message_sent", label: "LinkedIn message sent" },
  { value: "reply_received",        label: "Reply received" },
  { value: "meeting_booked",        label: "Meeting booked" },
  { value: "enriched",              label: "Contact enriched" },
  { value: "crm_updated",           label: "CRM updated" },
  { value: "deal_created",          label: "Deal created" },
  { value: "deal_won",              label: "Deal won" },
  { value: "contacted",             label: "Contacted (generic)" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white transition-colors"
    >
      {copied ? <CheckCircle2 size={10} className="text-emerald-400" /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Step({
  number,
  title,
  children,
  defaultOpen = false,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
      >
        <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
          {number}
        </span>
        <span className="text-sm font-medium text-white flex-1">{title}</span>
        {open
          ? <ChevronDown size={14} className="text-slate-500 shrink-0" />
          : <ChevronRight size={14} className="text-slate-500 shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800/60">
          {children}
        </div>
      )}
    </div>
  );
}

export default function MakeSetupGuide({ webhookUrl, scenarioName, defaultEventType }: Props) {
  const [selectedEventType, setSelectedEventType] = useState(defaultEventType ?? "email_sent");

  const minimalBody = JSON.stringify({
    email:      "contact@example.com",
    first_name: "Jane",
    last_name:  "Smith",
    event_type: selectedEventType,
  }, null, 2);

  const fullBody = JSON.stringify({
    email:         "contact@example.com",
    linkedin_url:  "https://linkedin.com/in/janesmith",
    phone:         "+1 555 000 0000",
    first_name:    "Jane",
    last_name:     "Smith",
    company:       "Acme Corp",
    title:         "Head of Growth",
    event_type:    selectedEventType,
    source_tool:   "instantly",
    scenario_id:   "{{scenarioId}}",
    execution_id:  "{{executionId}}",
    scenario_name: scenarioName ?? "My Scenario",
  }, null, 2);

  return (
    <div className="space-y-2.5">

      {/* Intro */}
      <div className="flex items-start gap-3 px-4 py-3.5 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
        <Zap size={14} className="text-indigo-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-medium text-indigo-300">Add one HTTP module to your scenario</p>
          <p className="text-[11px] text-indigo-400/70 mt-0.5">
            No changes to your existing logic. Just append a single HTTP → Make a request module at the end.
            Every time the scenario runs, iqpipe records the contact event automatically.
          </p>
        </div>
      </div>

      {/* Step 1 — Copy webhook URL */}
      <Step number={1} title="Copy your webhook URL" defaultOpen>
        <p className="text-[11px] text-slate-500 mt-3">
          This URL is unique to your workspace
          {scenarioName ? ` and this scenario (${scenarioName})` : ""}.
          Paste it into the HTTP module URL field in Make.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 truncate">
            {webhookUrl}
          </code>
          <CopyButton text={webhookUrl} />
        </div>
      </Step>

      {/* Step 2 — Add HTTP module */}
      <Step number={2} title='Add an "HTTP → Make a request" module in Make'>
        <div className="mt-3 space-y-3">
          <ol className="space-y-2.5 text-[11px] text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Open your Make scenario editor
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Click the <strong className="text-slate-300">+</strong> button after the last module in your flow
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Search for <strong className="text-slate-300">HTTP</strong> → select <strong className="text-slate-300">Make a request</strong>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Set <strong className="text-slate-300">URL</strong> to your webhook URL above
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Set <strong className="text-slate-300">Method</strong> to <code className="bg-slate-800 px-1 rounded">POST</code>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Set <strong className="text-slate-300">Body type</strong> to <code className="bg-slate-800 px-1 rounded">Raw</code> and <strong className="text-slate-300">Content type</strong> to <code className="bg-slate-800 px-1 rounded">application/json</code>
            </li>
          </ol>
        </div>
      </Step>

      {/* Step 3 — Build the JSON body */}
      <Step number={3} title="Build the request body — map your contact fields" defaultOpen>
        <div className="mt-3 space-y-3">

          {/* Event type picker */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">
              What event does this scenario fire?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedEventType(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                    selectedEventType === opt.value
                      ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                      : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Minimal body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Code2 size={10} />
                Minimal body (required fields only)
              </p>
              <CopyButton text={minimalBody} />
            </div>
            <pre className="text-[11px] font-mono text-emerald-300 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto leading-relaxed">
              {minimalBody}
            </pre>
            <p className="text-[10px] text-slate-600 mt-1">
              Replace static values with Make variables from previous modules (e.g. <code className="bg-slate-800 px-1 rounded">{"{{1.email}}"}</code>)
            </p>
          </div>
        </div>
      </Step>

      {/* Step 4 — Optional fields */}
      <Step number={4} title="Optional: pass more fields for richer attribution">
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Code2 size={10} />
                Full body with all optional fields
              </p>
              <CopyButton text={fullBody} />
            </div>
            <pre className="text-[11px] font-mono text-slate-400 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto leading-relaxed">
              {fullBody}
            </pre>
          </div>

          {/* Field reference */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {[
              ["source_tool", "Credit event to the underlying app (e.g. instantly, hubspot) instead of make"],
              ["scenario_id", "Make's scenario ID — use Make variable {{scenarioId}}"],
              ["execution_id", "Make's execution ID — enables deduplication on retries"],
              ["linkedin_url", "LinkedIn profile URL for cross-tool identity matching"],
            ].map(([field, desc]) => (
              <div key={field} className="flex items-start gap-1.5 bg-slate-900 rounded-lg p-2">
                <code className="text-indigo-300 shrink-0">{field}</code>
                <span className="text-slate-600">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </Step>

      {/* Step 5 — Test */}
      <Step number={5} title="Run the scenario once and verify">
        <div className="mt-3 space-y-2.5">
          <ol className="space-y-2 text-[11px] text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Click <strong className="text-slate-300">Run once</strong> in Make to trigger the scenario manually
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              The HTTP module should return <code className="bg-slate-800 px-1 rounded">{"{ received: true }"}</code>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
              Go to <strong className="text-slate-300">Leads</strong> or <strong className="text-slate-300">Activity</strong> in iqpipe — the contact event will appear within seconds
            </li>
          </ol>
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-400">
              After that, every scenario execution automatically sends events to iqpipe — no further setup needed.
            </p>
          </div>
        </div>
      </Step>

      {/* Footer note */}
      <div className="flex items-center gap-2 text-[10px] text-slate-700 px-1">
        <Globe size={10} className="shrink-0" />
        <span>
          Events are deduplicated on <code className="bg-slate-800 px-1 rounded">execution_id</code> —
          retrying a failed scenario run won't create duplicate entries.
        </span>
      </div>
    </div>
  );
}
