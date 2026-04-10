import { useState, useEffect } from "react";
import {
  X, Copy, Check, ChevronRight, ChevronLeft,
  Zap, Link2, Send, CheckCircle2, Loader2,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  platform: "n8n" | "make";
  onClose: () => void;
}

// ─── Payload example ─────────────────────────────────────────────────────────

const SAMPLE_PAYLOAD = (event: string) => JSON.stringify({
  workflowId:    "my-workflow-123",
  workflowName:  "Lead Enrichment",
  event,
  contactEmail:  "contact@example.com",
  sourceTool:    "Apollo",
}, null, 2);

const EVENT_OPTIONS = [
  "lead.created",
  "lead.enriched",
  "lead.qualified",
  "lead.contacted",
  "lead.replied",
  "lead.converted",
  "deal.created",
  "deal.updated",
  "sequence.started",
  "sequence.completed",
];

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS_N8N = [
  "Copy your webhook URL",
  "Open your n8n workflow",
  "Add HTTP Request node",
  "Configure the node",
  "Map your payload",
  "Run & verify",
];

const STEPS_MAKE = [
  "Copy your webhook URL",
  "Open your Make.com scenario",
  "Add HTTP module",
  "Configure the module",
  "Map your data",
  "Run & verify",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function PushConnectModal({ platform, onClose }: Props) {
  const [step,      setStep]      = useState(0);
  const [copied,    setCopied]    = useState<string | null>(null);
  const [eventType, setEventType] = useState("lead.enriched");
  const [verifying, setVerifying] = useState(false);
  const [verified,  setVerified]  = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const [urls,      setUrls]      = useState<{ n8n: string; make: string } | null>(null);

  const steps = platform === "n8n" ? STEPS_N8N : STEPS_MAKE;
  const webhookUrl = urls ? (platform === "n8n" ? urls.n8n : urls.make) : "";

  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/workspaces/webhook-url`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setUrls({ n8n: d.n8n, make: d.make }))
      .catch(() => {});
  }, []);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const testWebhook = async () => {
    if (!webhookUrl) return;
    setVerifying(true);
    setVerifyErr(null);
    try {
      const payload = {
        workflowId:   "push-connect-test",
        workflowName: "Push Connect Test",
        event:        "lead.enriched",
        contactEmail: "test@example.com",
        sourceTool:   platform === "n8n" ? "n8n" : "Make.com",
        _test:        true,
      };
      const res = await fetch(webhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        setVerified(true);
      } else {
        setVerifyErr(`Server returned ${res.status}. Check your URL.`);
      }
    } catch {
      setVerifyErr("Could not reach the webhook endpoint. Check your network.");
    } finally {
      setVerifying(false);
    }
  };

  const isFirst = step === 0;
  const isLast  = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-orange-400" />
            <span className="text-sm font-semibold text-slate-100">
              {platform === "n8n" ? "Connect n8n" : "Connect Make.com"} — HTTP Push
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/20">
              No API key
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Step progress */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all ${
                  i < step  ? "bg-orange-500" :
                  i === step ? "bg-orange-400" :
                  "bg-slate-800"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Step {step + 1} of {steps.length} — {steps[step]}
          </p>
        </div>

        {/* Step content */}
        <div className="px-5 py-4 min-h-[280px]">
          {step === 0 && (
            <StepCopyUrl webhookUrl={webhookUrl} copy={copy} copied={copied} platform={platform} />
          )}
          {step === 1 && (
            <StepOpenWorkflow platform={platform} />
          )}
          {step === 2 && (
            <StepAddNode platform={platform} />
          )}
          {step === 3 && (
            <StepConfigureNode webhookUrl={webhookUrl} copy={copy} copied={copied} platform={platform} />
          )}
          {step === 4 && (
            <StepMapPayload
              eventType={eventType}
              setEventType={setEventType}
              copy={copy}
              copied={copied}
              platform={platform}
            />
          )}
          {step === 5 && (
            <StepVerify
              platform={platform}
              verifying={verifying}
              verified={verified}
              verifyErr={verifyErr}
              onTest={testWebhook}
            />
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={12} /> Back
          </button>

          {isLast ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-all"
            >
              <CheckCircle2 size={12} /> Done
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-all"
            >
              Next <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step sub-components ──────────────────────────────────────────────────────

function CopyRow({ label, value, id, copy, copied }: {
  label: string; value: string; id: string;
  copy: (v: string, id: string) => void; copied: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">
          {value || <span className="text-slate-600">Loading…</span>}
        </code>
        <button
          onClick={() => copy(value, id)}
          disabled={!value}
          className="shrink-0 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-40"
        >
          {copied === id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

function StepCopyUrl({ webhookUrl, copy, copied, platform }: {
  webhookUrl: string; copy: (v: string, id: string) => void; copied: string | null; platform: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Copy your webhook URL</h3>
        <p className="text-xs text-slate-400">
          This is your workspace-specific endpoint. Any {platform === "n8n" ? "n8n" : "Make.com"} workflow can POST events to it — no credentials required.
        </p>
      </div>
      <CopyRow
        label={platform === "n8n" ? "n8n webhook URL" : "Make.com webhook URL"}
        value={webhookUrl}
        id="main-url"
        copy={copy}
        copied={copied}
      />
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
        <Link2 size={12} className="text-orange-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-400">
          Your workspaceId is embedded in the URL. Keep it private — anyone with this URL can push events to your workspace.
        </p>
      </div>
    </div>
  );
}

function StepOpenWorkflow({ platform }: { platform: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">
          Open your {platform === "n8n" ? "n8n workflow" : "Make.com scenario"}
        </h3>
        <p className="text-xs text-slate-400">
          Open any existing workflow you want iqpipe to observe. You'll add a single HTTP node at the end — it won't change the workflow's behavior.
        </p>
      </div>
      <ol className="space-y-2.5">
        {(platform === "n8n" ? [
          "Go to your n8n instance (cloud or self-hosted)",
          "Open the workflow you want to monitor",
          "Make sure you have it in Edit mode",
        ] : [
          "Go to make.com and open your account",
          "Click the scenario you want to monitor",
          "Click Edit scenario",
        ]).map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-xs text-slate-300">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepAddNode({ platform }: { platform: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">
          Add an HTTP {platform === "n8n" ? "Request node" : "module"}
        </h3>
        <p className="text-xs text-slate-400">
          {platform === "n8n"
            ? "Add a new node after your last existing node. Search for \"HTTP Request\" in the node palette."
            : "Click the + icon after the last module in your scenario and search for \"HTTP\"."}
        </p>
      </div>
      <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
        {platform === "n8n" ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-300">In the node palette:</p>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300 font-mono">Tab</kbd>
              <span className="text-[11px] text-slate-400">or click the + button to open node search</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Search for:</span>
              <code className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">HTTP Request</code>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-300">Search for the HTTP module:</p>
            <code className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px] text-orange-300 font-mono">HTTP → Make a request</code>
            <p className="text-[11px] text-slate-500 mt-1">This is under the built-in "HTTP" app — no install required.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StepConfigureNode({ webhookUrl, copy, copied, platform }: {
  webhookUrl: string; copy: (v: string, id: string) => void; copied: string | null; platform: string;
}) {
  const fields = platform === "n8n" ? [
    { label: "Method",       value: "POST" },
    { label: "URL",          value: webhookUrl, id: "cfg-url" },
    { label: "Body content", value: "JSON" },
    { label: "JSON body",    value: "Use expression (see next step)" },
  ] : [
    { label: "URL",          value: webhookUrl, id: "cfg-url" },
    { label: "Method",       value: "POST" },
    { label: "Body type",    value: "Raw" },
    { label: "Content type", value: "application/json" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Configure the node</h3>
        <p className="text-xs text-slate-400">Set these fields in the HTTP node settings:</p>
      </div>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
            <span className="w-28 text-[11px] text-slate-500 shrink-0">{f.label}</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <code className="flex-1 min-w-0 truncate text-[11px] text-orange-300 font-mono">{f.value}</code>
              {f.id && (
                <button
                  onClick={() => copy(f.value, f.id!)}
                  disabled={!f.value}
                  className="shrink-0 p-1 rounded bg-slate-800 border border-slate-700 text-slate-500 hover:text-white transition-colors disabled:opacity-40"
                >
                  {copied === f.id ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepMapPayload({ eventType, setEventType, copy, copied, platform }: {
  eventType: string;
  setEventType: (v: string) => void;
  copy: (v: string, id: string) => void;
  copied: string | null;
  platform: string;
}) {
  const payload = SAMPLE_PAYLOAD(eventType);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Map your payload</h3>
        <p className="text-xs text-slate-400">
          {platform === "n8n"
            ? "In the JSON body field, paste this as an expression or static JSON. Replace values with n8n expressions from your upstream nodes."
            : "Paste this as raw JSON in the body. You can use Make.com variables to replace the static values."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 shrink-0">Event type:</label>
        <select
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-slate-500"
        >
          {EVENT_OPTIONS.map(et => (
            <option key={et} value={et}>{et}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <pre className="text-[11px] text-slate-300 font-mono bg-slate-950 border border-slate-700 rounded-xl p-3 overflow-x-auto whitespace-pre leading-relaxed">
          {payload}
        </pre>
        <button
          onClick={() => copy(payload, "payload")}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          {copied === "payload" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
        </button>
      </div>
      <p className="text-[10px] text-slate-600">Only <code className="text-slate-500">event</code> is required. All other fields enrich the data.</p>
    </div>
  );
}

function StepVerify({ verifying, verified, verifyErr, onTest, platform }: {
  verifying: boolean; verified: boolean; verifyErr: string | null;
  onTest: () => void; platform: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 mb-1">Run & verify</h3>
        <p className="text-xs text-slate-400">
          {platform === "n8n"
            ? "Run your workflow once manually in n8n. Then send a test event from here to confirm iqpipe is receiving."
            : "Run your scenario once in Make.com. Then send a test event from here to confirm iqpipe is receiving."}
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={onTest}
          disabled={verifying || verified}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
            verified
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 cursor-default"
              : "bg-orange-500/15 border-orange-500/30 text-orange-300 hover:bg-orange-500/20 disabled:opacity-50"
          }`}
        >
          {verifying ? <Loader2 size={14} className="animate-spin" /> :
           verified  ? <CheckCircle2 size={14} /> :
                       <Send size={14} />}
          {verifying ? "Sending test event…" :
           verified  ? "Webhook confirmed — events are flowing!" :
                       "Send a test event"}
        </button>

        {verifyErr && (
          <p className="text-xs text-rose-400 text-center">{verifyErr}</p>
        )}

        {verified && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <p className="text-xs text-emerald-300 font-medium">You're connected.</p>
            <p className="text-[11px] text-emerald-400/70 mt-0.5">
              iqpipe will auto-create this workflow. Check Live Feed to see events appear.
            </p>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-800">
        <p className="text-[11px] text-slate-500 mb-1.5">Where to check:</p>
        <ul className="space-y-1 text-[11px] text-slate-400">
          <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-slate-600" /> Live Feed — real-time event stream</li>
          <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-slate-600" /> Workflow Health — new workflow auto-appears</li>
          <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-slate-600" /> Contact Inspector — contacts enriched from events</li>
        </ul>
      </div>
    </div>
  );
}
