import { useState, useEffect, useCallback } from "react";
import { X, GitMerge, Loader2 } from "lucide-react";
import { API_BASE_URL } from "../../config";

const CHANNELS = ["web", "email", "linkedin", "crm", "enrichment", "billing", "automation", "custom"];

export default function SourceMappingsPanel() {
  const [unmapped, setUnmapped] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [mapping, setMapping]   = useState<{ nodeType: string; platform: string } | null>(null);
  const [form, setForm]         = useState({ appKey: "", appLabel: "", channel: "custom" });
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const tok = () => localStorage.getItem("iqpipe_token") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    const [uRes, mRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/source-mappings/unknown`, { headers: { Authorization: `Bearer ${tok()}` } }),
      fetch(`${API_BASE_URL}/api/source-mappings`,         { headers: { Authorization: `Bearer ${tok()}` } }),
    ]);
    if (uRes.ok) { const d = await uRes.json(); setUnmapped(d.unmapped || []); }
    if (mRes.ok) { const d = await mRes.json(); setMappings(d.sourceMappings || []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapping) return;
    setErr(null); setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/source-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ ...form, nodeType: mapping.nodeType, platform: mapping.platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMapping(null);
      setForm({ appKey: "", appLabel: "", channel: "custom" });
      await load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API_BASE_URL}/api/source-mappings/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${tok()}` },
    });
    setMappings(prev => prev.filter(m => m.id !== id));
  };

  const totalUnmapped = unmapped.reduce((sum, w) => sum + (w.unmappedNodes?.length ?? 0), 0);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-1">
        <GitMerge size={14} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-slate-100">Source Mappings</h2>
        {totalUnmapped > 0 && (
          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 ml-auto">
            {totalUnmapped} unmapped
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Map unknown n8n/Make nodes (HTTP Request, Database, Webhook) to a named source so iqpipe can
        track and display events from your internal systems.
      </p>

      {loading ? (
        <div className="text-xs text-slate-600 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Scanning workflows…</div>
      ) : (
        <>
          {unmapped.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Unmapped nodes — click to map</p>
              {unmapped.map((wf, i) => (
                <div key={i} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs font-medium text-slate-200 mb-2">{wf.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {wf.unmappedNodes.map((n: string) => (
                      <button key={n}
                        onClick={() => { setMapping({ nodeType: n, platform: wf.platform || "n8n" }); setErr(null); }}
                        className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:border-amber-400/60 rounded px-2 py-0.5 transition-colors">
                        {n.replace("n8n-nodes-base.", "")} +
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {mapping && (
            <form onSubmit={handleMap} className="mb-4 space-y-3 bg-slate-950/40 border border-indigo-500/20 rounded-xl p-4">
              <p className="text-[11px] text-indigo-300 font-medium">
                Mapping: <code className="text-slate-300 font-mono">{mapping.nodeType}</code>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">App key <span className="text-slate-600">(slug)</span></label>
                  <input required placeholder="internal-db" value={form.appKey}
                    onChange={e => setForm(f => ({ ...f, appKey: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Display name</label>
                  <input required placeholder="Internal Database" value={form.appLabel}
                    onChange={e => setForm(f => ({ ...f, appLabel: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Channel</label>
                  <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none">
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {err && <p className="text-[11px] text-rose-400">{err}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white disabled:opacity-50 transition-colors">
                  {saving ? "Saving…" : "Save mapping"}
                </button>
                <button type="button" onClick={() => { setMapping(null); setErr(null); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
              </div>
            </form>
          )}

          {mappings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Saved mappings</p>
              {mappings.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400">{m.nodeType.replace("n8n-nodes-base.", "")}</span>
                  <span className="text-slate-700 text-xs">→</span>
                  <span className="text-xs text-slate-300 font-medium flex-1">{m.appLabel}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{m.channel}</span>
                  <button onClick={() => handleDelete(m.id)} className="text-slate-600 hover:text-rose-400 transition-colors ml-1">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {unmapped.length === 0 && mappings.length === 0 && (
            <p className="text-xs text-slate-600">No unmapped nodes detected in your connected workflows.</p>
          )}
        </>
      )}
    </section>
  );
}
