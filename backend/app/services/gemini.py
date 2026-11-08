"""Answer operational questions via Gemini.

The API key comes from GEMINI_API_KEY in the gitignored repo-root .env.
The browser never sees it.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.db.context import load_ops_snapshot

_SYSTEM = """You answer questions about Fire Fighters operations.

You receive two JSON sources:
- database: rows from Postgres (hydrants, risk scores, incidents, recent BLOCKED transitions). Use these when they contain rows.
- screen: what the user is looking at in the app. Prefer this for the current map: selected hydrant, hydrants that need attention, and recent incidents.

A hydrant needs attention when its status is blocked, warning, or offline, or it has an open incident. Cite risk scores and recorded causes (obstruction type, obstruction detail, or state-change reason). If a cause was not recorded, say so.

Do not invent hydrants, scores, or events. If neither source has rows that answer the question, say the data is empty.

Reply with one JSON object and no markdown:
{"text": "answer paragraph", "cards": [{"title": "...", "tone": "crit|warn|ok|neutral", "metrics": [{"label": "...", "value": "..."}], "bullets": ["..."], "hydrantIds": ["..."]}]}
tone is crit for blocked or critical risk, warn for warning or moderate risk, ok when clear, otherwise neutral. hydrantIds must be ids present in the sources. Use an empty cards array when a card would not help.
"""


class Metric(BaseModel):
    label: str
    value: str


class InsightCard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    tone: Literal["crit", "warn", "ok", "neutral"]
    metrics: list[Metric] = Field(default_factory=list)
    bullets: list[str] = Field(default_factory=list)
    hydrant_ids: list[str] = Field(default_factory=list, alias="hydrantIds")


class CopilotReply(BaseModel):
    text: str
    cards: list[InsightCard] = Field(default_factory=list)


def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=settings.gemini_api_key)


def _parse_reply(raw: str) -> CopilotReply:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].removesuffix("```").strip()
    try:
        return CopilotReply.model_validate_json(text)
    except Exception:
        return CopilotReply(text=text, cards=[])


async def answer_question(question: str, context: dict[str, Any] | None = None) -> CopilotReply:
    snapshot = await load_ops_snapshot()
    try:
        response = await asyncio.wait_for(
            _client().aio.models.generate_content(
                model=settings.gemini_model,
                contents=(
                    "database:\n"
                    f"{json.dumps(snapshot)}\n\n"
                    "screen:\n"
                    f"{json.dumps(context or {})}\n\n"
                    f"Question: {question}"
                ),
                config=types.GenerateContentConfig(system_instruction=_SYSTEM),
            ),
            timeout=45,
        )
    except TimeoutError as exc:
        raise RuntimeError("Gemini did not respond in time") from exc
    if not response.text:
        raise RuntimeError("Gemini returned an empty answer")
    reply = _parse_reply(response.text)
    if not reply.text.strip():
        raise RuntimeError("Gemini returned an empty answer")
    return reply
