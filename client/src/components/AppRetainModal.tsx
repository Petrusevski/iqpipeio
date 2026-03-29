/**
 * AppRetainModal
 *
 * Opens when the user clicks "Keep Connected" on an app_removed notification.
 * Lets them:
 *   1. Provide an API key and/or webhook secret for the removed app
 *   2. Pick which events they want IQPipe to receive
 *   3. Submit → POST /api/notifications/retain-app → connection created
 *      → returns a webhook URL to register in the app's dashboard
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Key, Webhook, CheckCircle2, ExternalLink, Copy, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE_URL } from "../../config";

const API_BASE = API_BASE_URL;

interface AppNotificationMeta {
  appKey:       string;
  workflowName: string;
  platform:     string;
  retainOption: boolean;
}

interface AppCatalogEntry {
  label:          string;
  domain:         string;
  connectionType: "webhook" | "polling" | "both";
  events:         { key: string; label: string; category: string }[];
}

interface Props {
  notificationId: string;
  meta:           AppNotificationMeta;
  onClose:        () => void;
  onRetained:     () => void;
}

export default function AppRetainModal({ notificationId, meta, onClose, onRetained }: Props) {
  const { appKey, workflowName, platform } = meta;

  const [catalog,        setCatalog]        = useState<AppCatalogEntry | null>(null);
  const [apiKey,         setApiKey]         = useState("");
  const [webhookSecret,  setWebhookSecret]  = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [showAdvanced,   setShowAdvanced]   = useState(false);

  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<{ webhookUrl: string; note: string } | null>(null);
  const [copied,      setCopied]      = useState(false);

  const token = localStorage.getItem("iqpipe_token");

  // Fetch app catalog entry to know connection type + available events
  useEffect(() => {
    fetch(`${API_BASE}/api/workflow-mirror/app-catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, AppCatalogEntry> | null) => {
        if (data?.[appKey]) setCatalog(data[appKey]);
      })
      .catch(() => {});
  }, [appKey, token]);

  const toggleEvent = (key: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (!catalog?.events) return;
    setSelectedEvents(new Set(catalog.events.map(e => e.key)));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!apiKey && !webhookSecret && catalog?.connectionType !== "polling") {
      setError("Provide an API key or webhook secret to connect this app.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/api/notifications/retain-app`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          notificationId,
          apiKey:         apiKey || undefined,
          webhookSecret:  webhookSecret || undefined,
          selectedEvents: Array.from(selectedEvents),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Failed to retain connection."); return; }
      setResult({ webhookUrl: data.webhookUrl, note: data.note });
      onRetained();
    } catch (err: any) {
      setError(err?.message ?? "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyUrl = async () => {
    if (!result?.webhookUrl) return;
    await navigator.clipboard.writeText(result.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const needsApiKey     = catalog?.connectionType === "polling" || catalog?.connectionType === "both";
  const needsWebhook    = catalog?.connectionType === "webhook"  || catalog?.connectionType === "both";
  const isPollingOnly   = catalog?.connectionType === "polling";

  // Group events by category
  const eventsByCategory: Record<string, AppCatalogEntry["events"]> = {};
  for (const evt of catalog?.events ?? []) {
    (eventsByCategory[evt.category] ??= []).push(evt);
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  Removed from {platform === "make" ? "Make.com" : "n8n"}
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-1.5">
                Keep <span className="text-indigo-400 capitalize">{catalog?.label ?? appKey}</span> connected
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Was removed from <span className="text-slate-300">"{workflowName}"</span>. Connect it directly to IQPipe to keep receiving events.
              </p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-4 mt-0.5">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

            {result ? (
              /* ── Success state ── */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-200 leading-relaxed">{result.note}</p>
                </div>

                {!isPollingOnly && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Webhook URL to register in {catalog?.label ?? appKey}</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-indigo-300 truncate">
                        {result.webhookUrl}
                      </code>
                      <button
                        onClick={copyUrl}
                        className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                      >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <ExternalLink size={10} />
                      Register this in {catalog?.label ?? appKey} → Settings → Webhooks
                    </p>
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="w-full py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                {/* Event selection */}
                {(catalog?.events?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">Select events to track</label>
                      <button
                        onClick={selectAll}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        Select all
                      </button>
                    </div>

                    <div className="space-y-3">
                      {Object.entries(eventsByCategory).map(([category, events]) => (
                        <div key={category}>
                          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider mb-1.5 capitalize">{category}</p>
                          <div className="grid grid-cols-1 gap-1">
                            {events.map(evt => (
                              <button
                                key={evt.key}
                                type="button"
                                onClick={() => toggleEvent(evt.key)}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all text-xs ${
                                  selectedEvents.has(evt.key)
                                    ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-200"
                                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                                }`}
                              >
                                <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                                  selectedEvents.has(evt.key)
                                    ? "border-indigo-500 bg-indigo-500"
                                    : "border-slate-600"
                                }`}>
                                  {selectedEvents.has(evt.key) && <Check size={9} className="text-white" />}
                                </div>
                                {evt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Credentials section */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2"
                  >
                    {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Connection credentials {needsApiKey && !needsWebhook ? "(API key)" : needsWebhook && !needsApiKey ? "(webhook)" : "(API key + webhook)"}
                  </button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-3 overflow-hidden"
                      >
                        {needsApiKey && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                              <Key size={11} /> API Key
                            </label>
                            <input
                              type="password"
                              className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                              placeholder={`${catalog?.label ?? appKey} API key`}
                              value={apiKey}
                              onChange={e => setApiKey(e.target.value)}
                            />
                          </div>
                        )}

                        {needsWebhook && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                              <Webhook size={11} /> Webhook Secret <span className="text-slate-600">(optional — for HMAC verification)</span>
                            </label>
                            <input
                              type="password"
                              className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                              placeholder="Webhook signing secret"
                              value={webhookSecret}
                              onChange={e => setWebhookSecret(e.target.value)}
                            />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
                  >
                    {error}
                  </motion.p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-white hover:border-slate-600 transition-all"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || selectedEvents.size === 0}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Keep Connected
                  </button>
                </div>

                {selectedEvents.size === 0 && (catalog?.events?.length ?? 0) > 0 && (
                  <p className="text-[10px] text-slate-500 text-center -mt-1">Select at least one event to track</p>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
