import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, X } from "lucide-react";
import { useApp, useHydrantList, useSelected } from "@/stores/appStore";
import { geminiService, SUGGESTIONS, type CopilotReply, type InsightCard } from "@/services/geminiService";
import { Button } from "@/components/ui/primitives";
import { useReducedMotion } from "@/hooks";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  reply?: CopilotReply;
}

const TONE: Record<InsightCard["tone"], string> = {
  crit: "border-l-crit",
  warn: "border-l-warn",
  ok: "border-l-ok",
  neutral: "border-l-line",
};

function Card({ card }: { card: InsightCard }) {
  const select = useApp((s) => s.select);
  return (
    <div className={cn("mt-2 rounded border border-line border-l-2 bg-surface-1", TONE[card.tone])}>
      <div className="px-3 pt-2 text-xs font-medium text-text-1">{card.title}</div>
      {card.metrics && (
        <dl className="mt-2 flex divide-x divide-line border-y border-line">
          {card.metrics.map((m) => (
            <div key={m.label} className="flex-1 px-3 py-2">
              <dt className="text-2xs text-text-3">{m.label}</dt>
              <dd className="num text-sm text-text-1">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.bullets && card.bullets.length > 0 && (
        <ul className="space-y-1 px-3 py-2 text-xs text-text-2">
          {card.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-3" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
      )}
      {card.hydrantIds && card.hydrantIds.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
          {card.hydrantIds.map((id) => (
            <button key={id} onClick={() => select(id)} className="num h-6 rounded border border-line px-2 text-2xs text-text-2 hover:bg-surface-2 hover:text-text-1">
              {id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CopilotDrawer() {
  const toggle = useApp((s) => s.toggle);
  const selected = useSelected();
  const hydrants = useHydrantList();
  const reduced = useReducedMotion();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggle("copilotOpen");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [msgs, busy, reduced]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: question }]);
    setBusy(true);
    const s = useApp.getState();
    try {
      const reply = await geminiService.ask(question, { hydrants, incidents: s.incidents, selected: s.selectedId ? s.hydrants[s.selectedId] : null, now: Date.now() });
      setMsgs((m) => [...m, { id: Date.now() + 1, role: "assistant", text: reply.text, reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reach Hydrant Intelligence.";
      setMsgs((m) => [...m, { id: Date.now() + 1, role: "assistant", text: message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.aside
      role="dialog"
      aria-label="Hydrant Intelligence"
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="fixed bottom-3 right-3 top-[64px] z-40 flex w-[calc(100vw-24px)] max-w-[400px] flex-col overflow-hidden rounded-lg border border-line bg-surface-1 shadow-float"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div>
          <h2 className="text-base font-semibold">Hydrant Intelligence</h2>
          <p className="text-2xs text-text-3">
            Answers from Gemini
            {selected && (
              <>
                {" "}· Context: <span className="num">{selected.id}</span>
              </>
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => toggle("copilotOpen")} aria-label="Close Hydrant Intelligence">
          <X />
        </Button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.length === 0 && (
          <div>
            <p className="text-sm text-text-2">Ask about risk, recent incidents or inspection priorities. Answers use the hydrant you have selected when relevant.</p>
            <ul className="mt-3 space-y-1">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button onClick={() => void ask(s)} className="w-full rounded border border-line px-3 py-2 text-left text-sm text-text-1 hover:bg-surface-2">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-8 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-1">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="mr-4 text-sm text-text-1">
              <p>{m.text}</p>
              {m.reply?.cards.map((c) => <Card key={c.title} card={c} />)}
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-1 text-text-3" role="status" aria-label="Hydrant Intelligence is thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-pulse rounded-full bg-text-3" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
      </div>

      {msgs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void ask(s)} disabled={busy} className="h-6 shrink-0 rounded border border-line px-2 text-2xs text-text-2 hover:bg-surface-2 disabled:opacity-40">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          placeholder="Ask about hydrants, incidents, risk…"
          aria-label="Ask Hydrant Intelligence"
          className="max-h-32 min-h-8 flex-1 resize-none rounded border border-line-strong bg-surface-1 px-3 py-1.5 text-sm text-text-1 placeholder:text-text-3 focus-visible:border-accent focus-visible:outline-none"
        />
        <Button type="submit" variant="primary" size="icon" disabled={!input.trim() || busy} aria-label="Send question">
          <ArrowUp />
        </Button>
      </form>
    </motion.aside>
  );
}
