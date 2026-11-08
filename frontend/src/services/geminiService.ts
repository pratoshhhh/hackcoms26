/**
 * geminiService — Incident Copilot interface.
 *
 * MockGeminiService answers deterministically from the seeded dataset. It does not call
 * any model. To integrate, implement CopilotService against the backend
 * (POST /api/v1/copilot { question, context }) which calls Gemini with a response schema
 * matching CopilotReply. Never call Gemini directly from the browser with an API key.
 */
import type { Hydrant, Incident } from "@/types";
import { OBSTRUCTION_LABELS, neighborhoodStats } from "./analyticsService";
import { duration } from "@/utils/format";
import { addressLine } from "@/data/obstructions";

export interface InsightCard {
  title: string;
  tone: "crit" | "warn" | "ok" | "neutral";
  metrics?: { label: string; value: string }[];
  bullets?: string[];
  hydrantIds?: string[];
}

export interface CopilotReply {
  text: string;
  cards: InsightCard[];
  simulated: true;
}

export interface CopilotContext {
  hydrants: Hydrant[];
  incidents: Incident[];
  selected: Hydrant | null;
  now: number;
}

export interface CopilotService {
  ask(question: string, ctx: CopilotContext): Promise<CopilotReply>;
}

export const SUGGESTIONS = [
  "Why is this hydrant considered high-risk?",
  "Summarize obstruction incidents from the past week.",
  "Which hydrants require immediate inspection?",
  "What maintenance patterns are visible in this neighborhood?",
];

const DAY = 86400000;

function riskReply(ctx: CopilotContext): CopilotReply {
  const h = ctx.selected ?? [...ctx.hydrants].sort((a, b) => b.riskScore - a.riskScore)[0];
  const mine = ctx.incidents.filter((i) => i.hydrantId === h.id && i.kind === "obstruction");
  const recent = mine.filter((i) => ctx.now - i.startedAt < 30 * DAY);
  const resolved = mine.filter((i) => i.resolvedAt);
  const avg = resolved.length ? resolved.reduce((s, i) => s + i.resolvedAt! - i.startedAt, 0) / resolved.length : 0;
  const types = [...new Set(mine.map((i) => i.obstructionType).filter(Boolean))] as (keyof typeof OBSTRUCTION_LABELS)[];
  const factors: string[] = [];
  if (recent.length) factors.push(`${recent.length} obstruction${recent.length > 1 ? "s" : ""} in the last 30 days`);
  if (avg > 2 * 3600000) factors.push(`Slow to clear: average ${duration(avg)}`);
  if (h.status === "blocked") factors.push("Currently blocked");
  if (h.status === "warning") factors.push("Currently showing a possible obstruction");
  if (types.length) factors.push(`Recurring causes: ${types.map((t) => OBSTRUCTION_LABELS[t].toLowerCase()).join(", ")}`);
  if (!factors.length) factors.push("Few recorded incidents. Score is driven mainly by its site baseline.");
  return {
    simulated: true,
    text: `${ctx.selected ? "" : "No hydrant is selected, so here is the highest-risk one. "}${h.id} (${addressLine(h)}) has a risk score of ${h.riskScore}/100, rated ${h.riskLevel}.`,
    cards: [
      {
        title: `Risk factors · ${h.id}`,
        tone: h.riskLevel === "critical" || h.riskLevel === "high" ? "crit" : h.riskLevel === "moderate" ? "warn" : "ok",
        metrics: [
          { label: "Score", value: `${h.riskScore}` },
          { label: "Incidents, 30 days", value: `${recent.length}` },
          { label: "Avg clear time", value: avg ? duration(avg) : "—" },
        ],
        bullets: factors,
        hydrantIds: [h.id],
      },
    ],
  };
}

function weekReply(ctx: CopilotContext): CopilotReply {
  const week = ctx.incidents.filter((i) => i.kind === "obstruction" && ctx.now - i.startedAt < 7 * DAY);
  const active = week.filter((i) => i.status === "active");
  const byType = new Map<string, number>();
  week.forEach((i) => i.obstructionType && byType.set(i.obstructionType, (byType.get(i.obstructionType) ?? 0) + 1));
  const resolved = week.filter((i) => i.resolvedAt);
  const avg = resolved.length ? resolved.reduce((s, i) => s + i.resolvedAt! - i.startedAt, 0) / resolved.length : 0;
  return {
    simulated: true,
    text: `There were ${week.length} obstruction incidents in the past 7 days. ${active.length} are still open.`,
    cards: [
      {
        title: "Past 7 days",
        tone: active.length ? "warn" : "ok",
        metrics: [
          { label: "Incidents", value: `${week.length}` },
          { label: "Still open", value: `${active.length}` },
          { label: "Avg clear time", value: avg ? duration(avg) : "—" },
        ],
        bullets: [...byType.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `${OBSTRUCTION_LABELS[t as keyof typeof OBSTRUCTION_LABELS]}: ${n}`),
      },
    ],
  };
}

function inspectReply(ctx: CopilotContext): CopilotReply {
  const urgent = ctx.hydrants
    .filter((h) => h.status === "blocked" || (h.status === "offline" && h.monitored) || h.status === "warning")
    .sort((a, b) => {
      const rank = (h: Hydrant) => (h.status === "blocked" ? 0 : h.status === "warning" ? 1 : 2);
      return rank(a) - rank(b) || a.statusSince - b.statusSince;
    })
    .slice(0, 6);
  return {
    simulated: true,
    text: urgent.length
      ? `${urgent.length} hydrants need attention. Blocked hydrants come first, oldest first.`
      : "No hydrants currently need inspection.",
    cards: urgent.length
      ? [
          {
            title: "Inspection queue",
            tone: "crit",
            bullets: urgent.map(
              (h) =>
                `${h.id}, ${addressLine(h)}: ${h.status === "offline" ? "sensor offline" : h.obstructionDetail ?? (h.status === "blocked" ? "blocked" : "possible obstruction")} (${duration(ctx.now - h.statusSince)})`,
            ),
            hydrantIds: urgent.map((h) => h.id),
          },
        ]
      : [],
  };
}

function patternReply(ctx: CopilotContext): CopilotReply {
  const nb = ctx.selected?.neighborhood ?? "Downtown";
  const s = neighborhoodStats(ctx.hydrants, ctx.incidents, nb, ctx.now);
  const top = s.types[0];
  const hours = s.incidents.map((i) => new Date(i.startedAt).getHours());
  const overnight = hours.filter((h) => h < 7 || h >= 22).length;
  return {
    simulated: true,
    text: `${nb} has ${s.hydrants.length} hydrants and ${s.incidents.length} recorded obstructions over the past 60 days.`,
    cards: [
      {
        title: `Patterns · ${nb}`,
        tone: s.recent.length > 3 ? "warn" : "neutral",
        metrics: [
          { label: "Hydrants", value: `${s.hydrants.length}` },
          { label: "Incidents, 30 days", value: `${s.recent.length}` },
          { label: "Top cause", value: top ? top.label : "—" },
        ],
        bullets: [
          top ? `${top.label} accounts for ${Math.round((top.count / Math.max(1, s.incidents.length)) * 100)}% of obstructions.` : "No dominant cause.",
          s.incidents.length ? `${Math.round((overnight / s.incidents.length) * 100)}% start overnight (22:00–07:00). Consider pre-dawn checks after snowfall.` : "Not enough history for time-of-day patterns.",
          top?.type === "vehicle" ? "Vehicle blocks suggest parking enforcement near these hydrants." : "Pair plow routes with hydrant clearing after storms.",
        ],
      },
    ],
  };
}

export const mockGeminiService: CopilotService = {
  async ask(question, ctx) {
    const q = question.toLowerCase();
    await new Promise((r) => setTimeout(r, 650 + (q.length % 5) * 120));
    if (/risk|why/.test(q)) return riskReply(ctx);
    if (/week|summar|recent/.test(q)) return weekReply(ctx);
    if (/immediate|inspect|urgent|priority|attention/.test(q)) return inspectReply(ctx);
    if (/pattern|neighbo|area|maintenance/.test(q)) return patternReply(ctx);
    return {
      simulated: true,
      text: "In this demo build I can explain risk scores, summarize recent incidents, list hydrants needing inspection, and describe neighborhood patterns. Try one of the suggestions.",
      cards: [],
    };
  },
};

export const geminiService: CopilotService = mockGeminiService;
