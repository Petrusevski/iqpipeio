import { useState, useEffect } from "react";
import { X, Plus, Tag, Lock, Loader2 } from "lucide-react";
import { API_BASE_URL } from "../../config";

const CHANNELS = ["web", "email", "linkedin", "crm", "enrichment", "billing", "automation", "custom"];

interface Props { plan: string; }

export default function CustomEventTypesPanel({ plan }: Props) {
  const allowed = plan === "growth" || plan === "agency";
  const [types, setTypes]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ key: "", label: "", channel: "custom", category: "signal", description: "" });
  const [adding, setAdding]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const tok = () => localStorage.getItem("iqpipe_token") ?? "";

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/api/custom-event-types`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.customEventTypes) setTypes(d.customEventTypes); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [allowed]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setAdding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/custom-event-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTypes(prev => [...prev, data]);
      setForm({ key: "", label: "", channel: "custom", category: "signal", description: "" });
      setShowForm(false);
    } catch (e: any) { setErr(e.message); } finally { setAdding(false); }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/api/custom-event-types/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${tok()}` },
    });
    if (res.ok) setTypes(prev => prev.filter(t => t.id !== id));
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Tag size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-100">Custom Event Types</h2>
        {!allowed && (
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5 ml-auto flex items-center gap-1">
            <Lock size={8} /> Growth+
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Define your own event taxonomy for web visits, internal databases, or any custom source.
        Use these keys in the <code className="text-indigo-300 bg-slate-800 px-1 rounded">POST /api/events</code> endpoint.
      </p>

      {!allowed ? (
        <p className="text-xs text-slate-600">Upgrade to Growth or Agency to create custom event types.</p>
      ) : loading ? (
        <div className="text-xs text-slate-600 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          {types.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {types.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">{t.key}</span>
                  <span className="text-xs text-slate-300 flex-1">{t.label}</span>
                  <span className="text-[10px] text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">{t.channel}</span>
                  <span className="text-[10px] text-slate-500">{t.category}</span>
                  <button onClick={() => handleDelete(t.id)} className="text-slate-600 hover:text-rose-400 transition-colors ml-1">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              <Plus size={12} /> Add event type
            </button>
          ) : (
            <form onSubmit={handleAdd} className="space-y-3 bg-slate-950/40 border border-slate-800 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Key <span className="text-slate-600">(snake_case)</span></label>
                  <input required placeholder="page_viewed" value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Label</label>
                  <input required placeholder="Page Viewed" value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Channel</label>
                  <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none">
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none">
                    <option value="signal">signal</option>
                    <option value="outcome">outcome</option>
                  </select>
                </div>
              </div>
              <input placeholder="Description (optional)" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              {err && <p className="text-[11px] text-rose-400">{err}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={adding}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white disabled:opacity-50 transition-colors">
                  {adding ? "Adding…" : "Add"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setErr(null); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
