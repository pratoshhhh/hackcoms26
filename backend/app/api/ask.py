from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.gemini import CopilotReply, answer_question

router = APIRouter(prefix="/api/v1", tags=["ask"])


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    context: dict[str, Any] | None = None


@router.post("/ask", response_model=CopilotReply)
async def ask(body: AskRequest) -> CopilotReply:
    return await answer_question(body.question, body.context)
