import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  BookOpen, Search, X, ChevronRight, ArrowLeft,
  ThumbsUp, ThumbsDown, RefreshCw, Lightbulb,
  AlertCircle, Tag, Layers, BookMarked, Wrench,
  FileText, TrendingUp, CheckCircle2,
} from "lucide-react";
import { API_BASE_URL } from "../../config";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  id:              string;
  slug:            string;
  title:           string;
  summary:         string;
  category:        string;
  difficulty:      string;
  featured:        boolean;
  tags:            string[];
  useCase:         string[];
  platform:        string[];
  viewCount:       number;
  helpfulCount:    number;
  notHelpfulCount: number;
  updatedAt:       string;
  body?:           string;
  related?:        Article[];
  snippet?:        string;
  rank?:           number;
}

interface SearchResult {
  query:   string;
  count:   number;
  results: Article[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "all",             label: "All",             icon: Layers    },
  { key: "guide",           label: "Guides",          icon: BookMarked },
  { key: "playbook",        label: "Playbooks",       icon: Lightbulb  },
  { key: "troubleshooting", label: "Troubleshooting", icon: Wrench     },
  { key: "concept",         label: "Concepts",        icon: FileText   },
  { key: "reference",       label: "Reference",       icon: Tag        },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  intermediate: "bg-amber-500/10  text-amber-400  border-amber-500/20",
  advanced:     "bg-rose-500/10   text-rose-400   border-rose-500/20",
};

const CATEGORY_COLORS: Record<string, string> = {
  guide:           "bg-indigo-500/10  text-indigo-300  border-indigo-500/20",
  playbook:        "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
  troubleshooting: "bg-amber-500/10   text-amber-300   border-amber-500/20",
  concept:         "bg-cyan-500/10    text-cyan-300    border-cyan-500/20",
  reference:       "bg-slate-500/10   text-slate-300   border-slate-500/20",
};

// ─── Lightweight markdown → JSX renderer ─────────────────────────────────────
// Handles: ##/### headings, **bold**, `inline code`, ``` code blocks,
// | tables |, - bullet lists, blank-line paragraphs.

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inlineFormat = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[.+?\]\([^)]+\))/g);
    return parts.map((p, pi) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return <strong key={pi} className="text-white font-semibold">{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`"))
        return <code key={pi} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 text-[0.82em] font-mono">{p.slice(1, -1)}</code>;
      const linkMatch = p.match(/^\[(.+?)\]\(([^)]+)\)$/);
      if (linkMatch)
        return <span key={pi} className="text-indigo-400 underline cursor-default">{linkMatch[1]}</span>;
      return p;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} className="my-4 rounded-xl bg-slate-900 border border-slate-800 p-4 overflow-x-auto text-[0.82em] font-mono text-slate-300 leading-relaxed whitespace-pre">
          {codeLines.join("\n")}
        </pre>
      );
      i++;
      continue;
    }

    // Table
    if (line.includes("|") && lines[i + 1]?.includes("---")) {
      const headers = line.split("|").map(s => s.trim()).filter(Boolean);
      i += 2; // skip separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(s => s.trim()).filter(Boolean));
        i++;
      }
      nodes.push(
        <div key={key++} className="my-4 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-sm text-slate-300">{inlineFormat(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={key++} className="text-base font-bold text-white mt-7 mb-3 pb-2 border-b border-slate-800">{line.slice(3)}</h2>);
      i++; continue;
    }
    // H3
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={key++} className="text-sm font-semibold text-slate-200 mt-5 mb-2">{line.slice(4)}</h3>);
      i++; continue;
    }
    // H4
    if (line.startsWith("#### ")) {
      nodes.push(<h4 key={key++} className="text-sm font-medium text-slate-300 mt-4 mb-1">{line.slice(5)}</h4>);
      i++; continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={key++} className="my-3 space-y-1.5 pl-1">
          {items.map((it, ii) => (
            <li key={ii} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500/60 shrink-0" />
              <span>{inlineFormat(it)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) { i++; continue; }

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("- ") && !lines[i].startsWith("```") && !lines[i].includes("|")) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      nodes.push(
        <p key={key++} className="text-sm text-slate-300 leading-relaxed my-2">
          {inlineFormat(paraLines.join(" "))}
        </p>
      );
    }
  }

  return nodes;
}

// ─── Article card (list view) ─────────────────────────────────────────────────

function ArticleCard({ article, onClick }: { article: Article; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/30 hover:bg-slate-900/80 transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[article.category] ?? CATEGORY_COLORS.reference}`}>
            {article.category}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[article.difficulty] ?? DIFFICULTY_COLORS.beginner}`}>
            {article.difficulty}
          </span>
          {article.featured && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-300 border-indigo-500/20 flex items-center gap-1">
              <TrendingUp size={9} />Featured
            </span>
          )}
        </div>
        <ChevronRight size={14} className="text-slate-700 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5" />
      </div>

      <h3 className="text-sm font-semibold text-white mb-2 group-hover:text-indigo-200 transition-colors leading-snug">
        {article.title}
      </h3>
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
        {article.snippet ?? article.summary}
      </p>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {article.tags.slice(0, 4).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-600">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Article detail view ──────────────────────────────────────────────────────

function ArticleDetail({
  article,
  onBack,
  onFeedback,
  onOpen,
}: {
  article: Article;
  onBack:  () => void;
  onFeedback: (slug: string, helpful: boolean) => void;
  onOpen: (slug: string) => void;
}) {
  const [voted, setVoted] = useState<"helpful" | "not_helpful" | null>(null);

  const handleVote = (helpful: boolean) => {
    if (voted) return;
    setVoted(helpful ? "helpful" : "not_helpful");
    onFeedback(article.slug, helpful);
  };

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-6"
      >
        <ArrowLeft size={13} />
        Back to articles
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[article.category] ?? CATEGORY_COLORS.reference}`}>
            {article.category}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[article.difficulty] ?? DIFFICULTY_COLORS.beginner}`}>
            {article.difficulty}
          </span>
        </div>
        <h1 className="text-xl font-bold text-white leading-tight mb-3">{article.title}</h1>
        <p className="text-sm text-slate-400 leading-relaxed">{article.summary}</p>
      </div>

      {/* Body */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        {article.body ? renderMarkdown(article.body) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </div>

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {article.tags.map(tag => (
            <span key={tag} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Feedback */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
        {voted ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={15} />
            Thanks for your feedback!
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">Was this helpful?</span>
            <button
              onClick={() => handleVote(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-lg border border-slate-700 hover:border-emerald-500/30 hover:bg-emerald-500/5"
            >
              <ThumbsUp size={12} /> Yes
            </button>
            <button
              onClick={() => handleVote(false)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500/30 hover:bg-rose-500/5"
            >
              <ThumbsDown size={12} /> No
            </button>
          </div>
        )}
      </div>

      {/* Related articles */}
      {article.related && article.related.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Related articles</h4>
          <div className="space-y-2">
            {article.related.map(rel => (
              <button
                key={rel.slug}
                onClick={() => onOpen(rel.slug)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/30 hover:bg-slate-900/80 transition-all group text-left"
              >
                <BookOpen size={13} className="text-slate-600 shrink-0" />
                <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors flex-1">{rel.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[rel.category] ?? ""}`}>{rel.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const location = useLocation();
  const [query,         setQuery]         = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [articles,      setArticles]      = useState<Article[]>([]);
  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [openArticle,   setOpenArticle]   = useState<Article | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [searching,     setSearching]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [searchEventId, setSearchEventId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load articles ──────────────────────────────────────────────────────────
  const loadArticles = useCallback(async (category: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (category !== "all") params.set("category", category);
      const res = await fetch(`${API_BASE_URL}/api/kb/articles?${params}`);
      if (!res.ok) throw new Error("Failed to load articles");
      const data: Article[] = await res.json();
      setArticles(data);
    } catch {
      setError("Failed to load knowledge base.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadArticles(activeCategory); }, [activeCategory, loadArticles]);

  // Reset to list view whenever the user navigates to this page (including same-path re-clicks)
  useEffect(() => { setOpenArticle(null); }, [location.key]);

  // ── Search with debounce ───────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchEventId(null);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: "12" });
        const res = await fetch(`${API_BASE_URL}/api/kb/search?${params}`);
        if (!res.ok) throw new Error();
        const data: SearchResult = await res.json();
        setSearchResults(data.results);

        // Log search event
        const evtRes = await fetch(`${API_BASE_URL}/api/kb/search-event`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ query: query.trim(), resultsCount: data.count }),
        });
        if (evtRes.ok) {
          const evtData = await evtRes.json();
          setSearchEventId(evtData.id);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query]);

  // ── Open article (fetch full body) ────────────────────────────────────────
  const openArticleBySlug = async (slug: string) => {
    try {
      const token = localStorage.getItem("iqpipe_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/kb/articles/${slug}`, { headers });
      if (!res.ok) return;
      const data: Article = await res.json();
      setOpenArticle(data);
      window.scrollTo(0, 0);

      // Record click on search event
      if (searchEventId) {
        fetch(`${API_BASE_URL}/api/kb/search-event/${searchEventId}/click`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ articleSlug: slug }),
        }).catch(() => {});
      }
    } catch { /* silent */ }
  };

  // ── Feedback ──────────────────────────────────────────────────────────────
  const submitFeedback = async (slug: string, helpful: boolean) => {
    try {
      const token = localStorage.getItem("iqpipe_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      await fetch(`${API_BASE_URL}/api/kb/feedback`, {
        method: "POST",
        headers,
        body:   JSON.stringify({ articleSlug: slug, helpful }),
      });
    } catch { /* silent */ }
  };

  // ── Displayed list ────────────────────────────────────────────────────────
  const displayList = searchResults ?? articles;
  const isSearching = query.trim().length > 0;

  // ── Article detail ────────────────────────────────────────────────────────
  if (openArticle) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-950 min-h-0">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <ArticleDetail
            article={openArticle}
            onBack={() => setOpenArticle(null)}
            onFeedback={submitFeedback}
            onOpen={openArticleBySlug}
          />
        </div>
      </div>
    );
  }

  // ── List / search view ────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 min-h-0">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <BookOpen size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Knowledge Base</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Guides, playbooks, and troubleshooting for IQPipe.
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search articles… (e.g. duplicate leads, n8n setup, GDPR)"
            className="w-full pl-10 pr-10 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-900 transition-colors"
          />
          {searching && (
            <RefreshCw size={13} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
          )}
          {query && !searching && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Category tabs — hidden during search */}
        {!isSearching && (
          <div className="flex items-center gap-1 mb-6 flex-wrap">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    activeCategory === cat.key
                      ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/25"
                      : "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  <Icon size={11} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Search header */}
        {isSearching && (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <Search size={13} />
            {searching ? "Searching…" : `${searchResults?.length ?? 0} result${searchResults?.length !== 1 ? "s" : ""} for "${query}"`}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 mb-6">
            <AlertCircle size={14} />{error}
          </div>
        )}

        {/* Loading skeleton */}
        {(loading || (searching && !searchResults)) && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-pulse">
                <div className="flex gap-2 mb-3">
                  <div className="h-4 w-16 bg-slate-800 rounded-full" />
                  <div className="h-4 w-14 bg-slate-800 rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-slate-800 rounded mb-2" />
                <div className="h-3 w-full bg-slate-800 rounded mb-1" />
                <div className="h-3 w-5/6 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && !searching && displayList.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <BookOpen size={22} className="text-slate-600" />
            </div>
            <p className="text-base font-semibold text-slate-300 mb-1">
              {isSearching ? "No articles found" : "No articles in this category"}
            </p>
            <p className="text-sm text-slate-600 max-w-xs">
              {isSearching
                ? `Try different keywords or browse by category.`
                : `Try a different category or search for a topic.`}
            </p>
            {isSearching && (
              <button
                onClick={() => setQuery("")}
                className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Articles grid */}
        {!loading && !(searching && !searchResults) && displayList.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayList.map(article => (
              <ArticleCard
                key={article.slug}
                article={article}
                onClick={() => openArticleBySlug(article.slug)}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
