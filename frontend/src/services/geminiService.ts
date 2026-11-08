/**
 * geminiService — Incident Copilot.
 *
 * Posts to the backend (POST /api/v1/ask). The Gemini API key stays on the server.
 */
import type { Hydrant, Incident } from "@/types";

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

const WEEK = 7 * 86400000;

function trimHydrant(h: Hydrant) {
  return {
    id: h.id,
    address: h.address,
    street: h.street,
    neighborhood: h.neighborhood,
    status: h.status,
    riskScore: h.riskScore,
    riskLevel: h.riskLevel,
    obstructionType: h.obstructionType,
    obstructionDetail: h.obstructionDetail,
    monitored: h.monitored,
    statusSince: h.statusSince,
  };
}

function trimContext(ctx: CopilotContext) {
  const attention = ctx.hydrants.filter(
    (h) =>
      h.status === "blocked" ||
      h.status === "warning" ||
      h.status === "offline" ||
      h.riskLevel === "high" ||
      h.riskLevel === "critical",
  );
  const incidents = ctx.incidents
    .filter((i) => i.status === "active" || ctx.now - i.startedAt < WEEK)
    .slice(0, 40)
    .map((i) => ({
      id: i.id,
      hydrantId: i.hydrantId,
      obstructionType: i.obstructionType,
      status: i.status,
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt ?? null,
      detail: i.detail ?? null,
    }));
  return {
    now: ctx.now,
    selected: ctx.selected ? trimHydrant(ctx.selected) : null,
    attention: attention.slice(0, 40).map(trimHydrant),
    incidents,
  };
}

export const geminiService: CopilotService = {
  async ask(question, ctx) {
    const res = await fetch("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context: trimContext(ctx) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || `Request failed (${res.status})`);
    }
    const data = (await res.json()) as CopilotReply;
    return { text: data.text, cards: data.cards ?? [] };
  },
};
