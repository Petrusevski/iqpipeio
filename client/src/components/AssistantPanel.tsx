import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
} from "react";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
}

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

import { API_BASE_URL } from "../../config";
const API_BASE = API_BASE_URL;

// FIX: Updated to match the ID used in your Dashboard/Performance Page
const DEFAULT_WORKSPACE_ID = "demo-workspace-1";

export default function AssistantPanel({ isOpen, onClose }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m1",
      role: "assistant",
      content: `Hey, I'm iqpipe — your GTM intelligence analyst.

I read your data across prospecting tools, outbound sequences, meetings, pipeline, and revenue.`,
    },
  ]);

  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const containerClasses = useMemo(
    () =>
      [
        "fixed inset-y-0 right-0 w-full max-w-md bg-slate-950 border-l border-slate-800 shadow-xl shadow-slate-900/40 transform transition-transform duration-200 z-40 flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full",
      ].join(" "),
    [isOpen]
  );

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await fetch(`${API_BASE}/api/assistant/analysis-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: trimmed,
          workspaceId: DEFAULT_WORKSPACE_ID,
        }),
      });

      const payload = await res.json();

      // FIX: Ensure we only show the analysis text string, not the object
      const replyText =
        typeof payload?.analysis === "string"
          ? payload.analysis
          : "I couldn't analyze the data correctly.";

      const assistantMessage: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: replyText,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content:
          "Something went wrong while analyzing your GTM performance.\n" +
          (err?.message || ""),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await sendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <aside className={containerClasses} aria-hidden={!isOpen}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
        <div>
          <div className="text-sm font-semibold text-slate-50">
            iqpipe Intelligence
          </div>
          <div className="text-[11px] text-slate-400">
            Ask about performance, bottlenecks, and how to optimize.
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 text-lg"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "assistant"
                  ? "flex items-start gap-2"
                  : "flex items-start gap-2 justify-end"
              }
            >
              {m.role === "assistant" && (
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xs shrink-0">
                  R
                </div>
              )}
              <div
                className={
                  m.role === "assistant"
                    ? "max-w-[85%] rounded-2xl bg-slate-900 border border-slate-800 px-3 py-2 whitespace-pre-wrap text-slate-100"
                    : "max-w-[85%] rounded-2xl bg-indigo-500 text-slate-50 px-3 py-2 whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-xs shrink-0">
                  U
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-[10px] animate-pulse">
                …
              </div>
              <span>Analyzing data…</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-800 px-3 py-3 flex flex-col gap-2 bg-slate-950"
        >
          <textarea
            ref={textareaRef}
            rows={2}
            className="w-full text-sm bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="Ask iqpipe..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Enter to send · Shift+Enter for new line</span>
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-500 disabled:bg-slate-700 text-[11px] font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed"
            >
              <span>{isThinking ? "Analyzing…" : "Ask iqpipe"}</span>
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}