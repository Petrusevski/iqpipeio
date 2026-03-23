import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "./useAdmin";
import { Loader2, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface UserRow {
  id:        string;
  email:     string;
  fullName:  string;
  createdAt: string;
  workspace: { id: string; name: string; plan: string; trialEndsAt: string | null; createdAt: string } | null;
}

const PLAN_BADGE: Record<string, string> = {
  trial:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  free:    "bg-slate-700/50 text-slate-400 border-slate-600",
  starter: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  growth:  "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  agency:  "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export default function AdminUsersPage() {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [q,       setQ]       = useState("");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set("q", q);
      const data = await adminFetch<{ users: UserRow[]; total: number }>(`/users?${params}`);
      setUsers(data.users);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(); };
  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Users</h1>
          <p className="text-xs text-slate-500">{total} total</p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email or name…"
              className="bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-52"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white transition-colors">
            Search
          </button>
          <button type="button" onClick={load} className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors">
            <RefreshCw size={13} />
          </button>
        </form>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-slate-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-800">
              <tr>
                {["Name", "Email", "Workspace", "Plan", "Signed up"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-slate-200 font-medium whitespace-nowrap">{u.fullName}</td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{u.workspace?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {u.workspace?.plan ? (
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium capitalize ${PLAN_BADGE[u.workspace.plan] ?? PLAN_BADGE.free}`}>
                        {u.workspace.plan}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page} of {pages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
