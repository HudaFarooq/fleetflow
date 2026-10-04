"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Bot, KeyRound, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean };

const SUGGESTIONS = [
  "Which vans are free right now?",
  "How did deliveries go this week?",
  "What's waiting for dispatch?",
  "When should the EVs charge tonight?",
];

const TOOL_LABEL: Record<string, string> = {
  fleet_status: "Checked the fleet",
  find_parcel: "Looked up a parcel",
  list_parcels: "Listed parcels",
  delivery_stats: "Read delivery stats",
  preview_routes: "Ran the route optimizer",
  preview_charging: "Ran the charging planner",
  current_time: "Checked the time",
};

const MAX_HISTORY = 12;

export function AssistantPanel() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: ["assistant-status", token], queryFn: () => api.assistantStatus(token!), enabled: open });

  const chat = useMutation({
    mutationFn: (history: Message[]) =>
      api.assistantChat(token!, history.filter((m) => !m.error).slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }))),
    onSuccess: (reply) => {
      setMessages((current) => [...current, { role: "assistant", content: reply.reply, tools: reply.tools_used }]);
      setRemaining(reply.remaining_today);
    },
    onError: (error) => setMessages((current) => [...current, { role: "assistant", content: error.message, error: true }]),
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chat.isPending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    chat.mutate(next);
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen((value) => !value)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-[80] grid size-14 place-items-center rounded-2xl bg-ink-950 text-brand-300 shadow-xl shadow-ink-950/30"
        aria-label={open ? "Close the dispatch assistant" : "Open the dispatch assistant"}
        aria-expanded={open}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? "x" : "bot"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
            {open ? <X className="size-6" /> : <Bot className="size-6" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="Dispatch assistant"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-24 right-5 z-[80] flex h-[min(36rem,calc(100vh-8rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex items-center gap-3 bg-ink-950 px-5 py-4 text-white">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-500/20 text-brand-300">
                <Sparkles className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-semibold">Dispatch assistant</p>
                <p className="text-xs text-slate-400">Answers from live fleet data · read-only</p>
              </div>
              {remaining !== null && <span className="text-xs text-slate-400">{remaining} left today</span>}
            </header>

            {status.data && !status.data.configured ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                  <KeyRound className="size-6" />
                </span>
                <p className="font-medium text-slate-900">Add a free AI key to switch this on</p>
                <ol className="space-y-1 text-left text-sm text-slate-600">
                  <li>1. Create a key at aistudio.google.com (free)</li>
                  <li>2. Add <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY=...</code> to backend/.env</li>
                  <li>3. Restart the API</li>
                </ol>
              </div>
            ) : (
              <>
                <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                  {messages.length === 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-sm text-slate-600">Ask about vehicles, parcels, performance or tonight&apos;s charging. Try:</p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => send(suggestion)}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-left text-sm text-slate-700 transition hover:border-brand-400 hover:bg-brand-50"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((message, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
                          message.role === "user" && "rounded-br-md bg-ink-900 text-white",
                          message.role === "assistant" && !message.error && "rounded-bl-md bg-slate-100 text-slate-800",
                          message.error && "rounded-bl-md bg-rose-50 text-rose-700",
                        )}
                      >
                        {message.content}
                      </div>
                      {message.tools && message.tools.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {[...new Set(message.tools)].map((tool) => (
                            <span key={tool} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                              {TOOL_LABEL[tool] ?? tool}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {chat.isPending && (
                    <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3" aria-label="Thinking">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="size-1.5 rounded-full bg-slate-400"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.12 }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <form
                  className="flex items-end gap-2 border-t border-slate-100 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    send(draft);
                  }}
                >
                  <label htmlFor="assistant-input" className="sr-only">Ask the assistant</label>
                  <textarea
                    id="assistant-input"
                    rows={1}
                    maxLength={500}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        send(draft);
                      }
                    }}
                    placeholder="Ask about your fleet…"
                    className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || chat.isPending}
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40"
                    aria-label="Send"
                  >
                    <ArrowUp className="size-5" />
                  </button>
                </form>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
