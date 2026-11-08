/**
 * Hydrant Intelligence: question-and-answer panel over the live hydrant dataset.
 * Answers come from the deterministic mock in geminiService until the backend
 * Gemini endpoint exists, and every answer says so.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, CalendarRange, Check, Copy, ListChecks, MapPinned, RotateCcw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useActiveIncidents, useApp, useHydrantList, useSelected } from "@/stores/appStore";
import { geminiService, type CopilotReply, type InsightCard } from "@/services/geminiService";
import { Button, Tip } from "@/components/ui/primitives";
import { StatusIcon } from "@/components/hydrants/status";
import { addressLine } from "@/data/obstructions";
import { useReducedMotion } from "@/hooks";
import { cn } from "@/lib/utils";

export const INTELLIGENCE_NAME = "Hydrant Intelligence";

/** Brand mark: a sensor's scan arc over a hydrant dot. Deliberately not a sparkle. */
export function IntelligenceMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-text-1", className)} aria-hidden>
      <svg viewBox="0 0 16 16" className="size-[70%]">
        <path d="M3 9.5a5 5 0 0 1 10 0" fill="none" stroke="rgb(var(--surface-1))" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.6 9.5a2.4 2.4 0 0 1 4.8 0" fill="none" stroke="rgb(var(--surface-1))" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.25" r="1.6" fill="rgb(var(--crit))" />
      </svg>
    </span>
  );
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  reply?: CopilotReply;
}

const TONE: Record<InsightCard["tone"], { bar: string; dot: string }> = {
  crit: { bar: "bg-crit", dot: "bg-crit" },
  warn: { bar: "bg-warn", dot: "bg-warn" },
  ok: { bar: "bg-ok", dot: "bg-ok" },
  neutral: { bar: "bg-line-strong", dot: "bg-text-3" },
};

function HydrantRow({ id }: { id: string }) {
  const h = useApp((s) => s.hydrants[id]);
  const select = useApp((s) => s.select);
  if (!h) return null;
  return (
    <button
      onClick={() => select(id, { fly: true })}
      className="group flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2"
    >
      <StatusIcon status={h.status} className="size-3.5 shrink-0" />
      <span className="num shrink-0 text-xs text-text-1">{id}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-text-3">{addressLine(h)}</span>
      <span className="text-2xs text-text-3 opacity-0 transition-opacity group-hover:opacity-100">Show on map</span>
    </button>
  );
}

function Card({ card }: { card: InsightCard }) {
  const t = TONE[card.tone];
  return (
    <div className="relative mt-3 overflow-hidden rounded-lg border border-line bg-surface-1">
      <span className={cn("absolute inset-y-0 left-0 w-0.5", t.bar)} aria-hidden />
      <div className="flex items-center gap-2 px-3 pt-2.5 text-xs font-medium text-text-1">
        <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
        {card.title}
      </div>
      {card.metrics && (
        <dl className="mt-2.5 grid grid-flow-col auto-cols-fr border-t border-line">
          {card.metrics.map((m, i) => (
            <div key={m.label} className={cn("px-3 py-2", i > 0 && "border-l border-line")}>
              <dt className="text-2xs text-text-3">{m.label}</dt>
              <dd className="num mt-0.5 text-md text-text-1">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.bullets && card.bullets.length > 0 && (
        <ul className="space-y-1.5 border-t border-line px-3 py-2.5 text-xs text-text-2">
          {card.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-[7px] h-px w-2 shrink-0 bg-text-3" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {card.hydrantIds && card.hydrantIds.length > 0 && (
        <div className="border-t border-line py-1">
          {card.hydrantIds.map((id) => (
            <HydrantRow key={id} id={id} />
          ))}
        </div>
      )}
    </div>
  );
}

function Answer({ m }: { m: Msg }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const lines = [m.text, ...(m.reply?.cards ?? []).flatMap((c) => [c.title, ...(c.metrics ?? []).map((x) => `${x.label}: ${x.value}`), ...(c.bullets ?? []).map((b) => `- ${b}`)])];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };
  return (
    <div className="group/answer">
      <div className="flex items-center gap-2">
        <IntelligenceMark className="size-5" />
        <span className="text-xs font-medium text-text-1">{INTELLIGENCE_NAME}</span>
        <span className="rounded border border-line px-1.5 text-2xs text-text-3">Simulated</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text-1">{m.text}</p>
      {m.reply?.cards.map((c) => <Card key={c.title} card={c} />)}
      <div className="mt-1.5 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/answer:opacity-100">
        <Tip content={copied ? "Copied" : "Copy answer"} side="bottom">
          <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label="Copy answer">
            {copied ? <Check /> : <Copy />}
          </Button>
        </Tip>
      </div>
    </div>
  );
}

/** Progress lines describe what the answer is actually computed from. */
function Thinking({ hydrants, incidents }: { hydrants: number; incidents: number }) {
  const steps = [`Checking ${hydrants} hydrants`, `Reviewing ${incidents} incidents`, "Writing the answer"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => Math.min(v + 1, steps.length - 1)), 380);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <IntelligenceMark className="size-5" />
      <span className="relative h-4 overflow-hidden text-xs text-text-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={i} className="block" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.15 }}>
            {steps[i]}…
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

export default function HydrantIntelligence() {
  const toggle = useApp((s) => s.toggle);
  const select = useApp((s) => s.select);
  const selected = useSelected();
  const hydrants = useHydrantList();
  const incidents = useApp((s) => s.incidents);
  const active = useActiveIncidents();
  const reduced = useReducedMotion();
  const onMap = useLocation().pathname === "/map";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(
    () => [
      { icon: ShieldAlert, q: selected ? `Why is ${selected.id} considered high-risk?` : "Which hydrant is the highest risk, and why?" },
      { icon: ListChecks, q: "Which hydrants need inspection right now?" },
      { icon: CalendarRange, q: "Summarize obstruction incidents from the past week." },
      { icon: MapPinned, q: `What maintenance patterns show up in ${selected?.neighborhood ?? "Downtown"}?` },
    ],
    [selected],
  );

  const pulse = useMemo(() => {
    const blocked = hydrants.filter((h) => h.status === "blocked").length;
    const offline = hydrants.filter((h) => h.monitored && h.status === "offline").length;
    return [
      { label: "Blocked now", value: blocked, cls: blocked ? "text-crit" : "text-text-1" },
      { label: "Open incidents", value: active.length, cls: "text-text-1" },
      { label: "Sensors offline", value: offline, cls: offline ? "text-warn" : "text-text-1" },
    ];
  }, [hydrants, active.length]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggle("copilotOpen");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [msgs, busy, reduced]);

  // Grow the composer with its content, up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: question }]);
    setBusy(true);
    const s = useApp.getState();
    const reply = await geminiService.ask(question, { hydrants, incidents: s.incidents, selected: s.selectedId ? s.hydrants[s.selectedId] : null, now: Date.now() });
    setMsgs((m) => [...m, { id: Date.now() + 1, role: "assistant", text: reply.text, reply }]);
    setBusy(false);
  };

  return (
    <motion.aside
      role="dialog"
      aria-label={INTELLIGENCE_NAME}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className={cn(
        "fixed bottom-3 right-3 top-[64px] z-40 flex w-[calc(100vw-24px)] max-w-[420px] flex-col overflow-hidden rounded-xl border border-line bg-surface-1 shadow-float",
        // Sit beside the hydrant panel instead of covering it when there's room.
        onMap && selected && "xl:right-[464px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-3.5">
        <IntelligenceMark className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">{INTELLIGENCE_NAME}</h2>
          <p className="truncate text-2xs text-text-3">Answers from live hydrant and incident data · simulated</p>
        </div>
        {msgs.length > 0 && (
          <Tip content="New conversation">
            <Button variant="ghost" size="icon-sm" onClick={() => setMsgs([])} disabled={busy} aria-label="New conversation">
              <RotateCcw />
            </Button>
          </Tip>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => toggle("copilotOpen")} aria-label={`Close ${INTELLIGENCE_NAME}`}>
          <X />
        </Button>
      </div>

      {/* Context: what the answers are scoped to */}
      <div className="mx-4 mb-3 flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs">
        {selected ? (
          <>
            <StatusIcon status={selected.status} className="size-3.5 shrink-0" />
            <span className="num shrink-0 text-text-1">{selected.id}</span>
            <span className="min-w-0 flex-1 truncate text-text-3">{addressLine(selected)}</span>
            <button onClick={() => select(null)} className="shrink-0 rounded px-1.5 py-0.5 text-text-3 hover:bg-surface-3 hover:text-text-1">
              Use all
            </button>
          </>
        ) : (
          <>
            <span className="size-1.5 shrink-0 rounded-full bg-text-3" aria-hidden />
            <span className="text-text-2">
              All <span className="num">{hydrants.length}</span> hydrants
            </span>
            <span className="min-w-0 flex-1 truncate text-text-3">· select one on the map to focus</span>
          </>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-4" aria-live="polite">
        {msgs.length === 0 ? (
          <div>
            <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-line">
              {pulse.map((p, i) => (
                <div key={p.label} className={cn("px-3 py-2.5", i > 0 && "border-l border-line")}>
                  <dt className="text-2xs text-text-3">{p.label}</dt>
                  <dd className={cn("num mt-0.5 text-lg", p.cls)}>{p.value}</dd>
                </div>
              ))}
            </dl>

            <h3 className="mb-2 mt-6 text-2xs font-medium uppercase tracking-wider text-text-3">Try asking</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {suggestions.map(({ icon: Icon, q }) => (
                <li key={q}>
                  <button onClick={() => void ask(q)} className="group flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-text-1 hover:bg-surface-2">
                    <Icon className="size-4 shrink-0 text-text-3 group-hover:text-text-1" strokeWidth={1.5} />
                    <span className="flex-1">{q}</span>
                    <ArrowUp className="size-3.5 shrink-0 rotate-45 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-6">
            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-text-1 px-3.5 py-2 text-sm text-surface-1">{m.text}</p>
                </div>
              ) : (
                <Answer key={m.id} m={m} />
              ),
            )}
            {busy && <Thinking hydrants={hydrants.length} incidents={incidents.length} />}
          </div>
        )}
      </div>

      {msgs.length > 0 && !busy && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
          {suggestions.map(({ q }) => (
            <button key={q} onClick={() => void ask(q)} className="h-7 shrink-0 rounded-full border border-line px-3 text-2xs text-text-2 hover:bg-surface-2 hover:text-text-1">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        className="px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <div className="rounded-xl border border-line-strong bg-surface-1 transition-colors focus-within:border-accent">
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
            placeholder={selected ? `Ask about ${selected.id}, or any hydrant…` : "Ask about hydrants, incidents, risk…"}
            aria-label={`Ask ${INTELLIGENCE_NAME}`}
            className="block max-h-32 w-full resize-none bg-transparent px-3 pt-2.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="pl-1 text-2xs text-text-3">Enter to send · Shift+Enter for a new line</span>
            <Button type="submit" variant="primary" size="icon-sm" className="rounded-lg" disabled={!input.trim() || busy} aria-label="Send question">
              <ArrowUp />
            </Button>
          </div>
        </div>
      </form>
    </motion.aside>
  );
}
