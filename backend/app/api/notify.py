from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.sms import SmsError, demo_recipient, is_configured, mask_phone, send_sms

router = APIRouter(prefix="/api/v1/notify", tags=["notify"])


class SmsRequest(BaseModel):
    to: str | None = None
    body: str = Field(min_length=1, max_length=480)


class SmsStatus(BaseModel):
    configured: bool
    demo_to: str | None


class SmsResult(BaseModel):
    sid: str
    status: str
    to: str
    via: str


@router.get("/sms", response_model=SmsStatus)
async def sms_status() -> SmsStatus:
    demo = demo_recipient()
    return SmsStatus(configured=is_configured(), demo_to=mask_phone(demo) if demo else None)


@router.post("/sms", response_model=SmsResult)
async def sms_send(body: SmsRequest) -> SmsResult:
    try:
        return SmsResult(**await send_sms(body.to, body.body))
    except SmsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
