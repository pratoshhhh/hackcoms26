/**
 * Vercel Function for Hydrant Intelligence.
 * GEMINI_API_KEY stays in the project environment and is never sent to the browser.
 */

export const maxDuration = 60;

const SYSTEM = `You answer questions about Hydrant Halo operations.

You receive two JSON sources:
- database: rows from Postgres (hydrants, risk scores, incidents, recent BLOCKED transitions). Use these when they contain rows.
- screen: what the user is looking at in the app. Prefer this for the current map: selected hydrant, hydrants that need attention, and recent incidents.

A hydrant needs attention when its status is blocked, warning, or offline, or it has an open incident. Cite risk scores and recorded causes (obstruction type, obstruction detail, or state-change reason). If a cause was not recorded, say so.

Do not invent hydrants, scores, or events. If neither source has rows that answer the question, say the data is empty.

Reply with one JSON object and no markdown:
{"text": "answer paragraph", "cards": [{"title": "...", "tone": "crit|warn|ok|neutral", "metrics": [{"label": "...", "value": "..."}], "bullets": ["..."], "hydrantIds": ["..."]}]}
tone is crit for blocked or critical risk, warn for warning or moderate risk, ok when clear, otherwise neutral. hydrantIds must be ids present in the sources. Use an empty cards array when a card would not help.
`;

const TONES = new Set(["crit", "warn", "ok", "neutral"]);

interface InsightCard {
  title: string;
  tone: "crit" | "warn" | "ok" | "neutral";
  metrics: { label: string; value: string }[];
  bullets: string[];
  hydrantIds: string[];
}

interface CopilotReply {
  text: string;
  cards: InsightCard[];
}

function parseReply(raw: string): CopilotReply {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.split("\n").slice(1).join("\n").replace(/```$/, "").trim();
  }
  try {
    const parsed = JSON.parse(text) as { text?: unknown; cards?: unknown };
    if (typeof parsed.text !== "string" || !parsed.text.trim()) {
      return { text: text, cards: [] };
    }
    const cards = Array.isArray(parsed.cards)
      ? parsed.cards.flatMap((card): InsightCard[] => {
          if (!card || typeof card !== "object") return [];
          const row = card as Record<string, unknown>;
          if (typeof row.title !== "string" || !TONES.has(String(row.tone))) return [];
          const metrics = Array.isArray(row.metrics)
            ? row.metrics.flatMap((metric) => {
                if (!metric || typeof metric !== "object") return [];
                const item = metric as Record<string, unknown>;
                if (typeof item.label !== "string" || typeof item.value !== "string") return [];
                return [{ label: item.label, value: item.value }];
              })
            : [];
          const bullets = Array.isArray(row.bullets) ? row.bullets.filter((item): item is string => typeof item === "string") : [];
          const hydrantIds = Array.isArray(row.hydrantIds)
            ? row.hydrantIds.filter((item): item is string => typeof item === "string")
            : [];
          return [{ title: row.title, tone: row.tone as InsightCard["tone"], metrics, bullets, hydrantIds }];
        })
      : [];
    return { text: parsed.text, cards };
  } catch {
    return { text, cards: [] };
  }
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return new Response("GEMINI_API_KEY is not set on the server", { status: 500 });
  }

  let body: { question?: unknown; context?: unknown };
  try {
    body = (await request.json()) as { question?: unknown; context?: unknown };
  } catch {
    return new Response("Expected a JSON body", { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return new Response("Question is required", { status: 400 });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const contents = `database:\n{}\n\nscreen:\n${JSON.stringify(body.context ?? {})}\n\nQuestion: ${body.question.trim()}`;

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: contents }] }],
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch (error) {
    console.error("Gemini request failed", error instanceof Error ? error.message : error);
    return new Response("Gemini did not respond in time", { status: 504 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error("Gemini error", upstream.status, detail.slice(0, 500));
    return new Response("Gemini request failed", { status: 502 });
  }

  const payload = (await upstream.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const reply = parseReply(raw);
  if (!reply.text.trim()) {
    console.error("Gemini returned an empty answer");
    return new Response("Gemini returned an empty answer", { status: 502 });
  }
  return Response.json(reply);
}
