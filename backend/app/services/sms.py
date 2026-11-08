"""Send SMS through Twilio's REST API.

Credentials come from TWILIO_* in the gitignored repo-root .env and never reach the browser.
"""

from __future__ import annotations

import re

import httpx

from app.core.config import settings

_E164 = re.compile(r"\+\d{10,15}")
# Trial accounts reject custom text (error 572006) and only accept these names as Body.
TRIAL_TEMPLATE = "sms_internal_alerts"


class SmsError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def normalize_phone(raw: str) -> str | None:
    """'(585) 555-1234' → '+15855551234'. Bare 10-digit numbers are assumed to be US."""
    raw = raw.strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        candidate = f"+{digits}"
    elif len(digits) == 10:
        candidate = f"+1{digits}"
    elif len(digits) == 11 and digits.startswith("1"):
        candidate = f"+{digits}"
    else:
        return None
    return candidate if _E164.fullmatch(candidate) else None


def mask_phone(phone: str) -> str:
    return re.sub(r"\d(?=\d{2})", "•", phone)


def is_configured() -> bool:
    return bool(
        settings.twilio_account_sid
        and settings.twilio_auth_token
        and (settings.twilio_from_number or settings.twilio_messaging_service_sid)
    )


def demo_recipient() -> str | None:
    return normalize_phone(settings.twilio_demo_to_number) if settings.twilio_demo_to_number else None


async def send_sms(to: str | None, body: str) -> dict[str, str]:
    """Send one SMS. With no `to`, it goes to TWILIO_DEMO_TO_NUMBER."""
    if not is_configured():
        raise SmsError("Twilio is not configured on the server", 503)
    target = normalize_phone(to) if to else demo_recipient()
    if not target:
        raise SmsError("Recipient must be a valid phone number" if to else "TWILIO_DEMO_TO_NUMBER is not set", 400)

    data = {"To": target, "Body": body}
    if settings.twilio_messaging_service_sid:
        data["MessagingServiceSid"] = settings.twilio_messaging_service_sid
    else:
        data["From"] = settings.twilio_from_number

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"

    async def post(form: dict[str, str]) -> tuple[int, dict]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(url, data=form, auth=(settings.twilio_account_sid, settings.twilio_auth_token))
        except httpx.HTTPError as exc:
            raise SmsError(f"Twilio did not respond: {exc}", 504) from exc
        payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        return response.status_code, payload

    status_code, payload = await post(data)
    via = "alert"
    # A trial account answers 572006 for any text that isn't a template name. Resend the
    # built-in internal-alert template so the demo phone still gets a message.
    if status_code >= 400 and _trial_template_only(payload) and body != TRIAL_TEMPLATE:
        status_code, payload = await post({**data, "Body": TRIAL_TEMPLATE})
        via = "trial_template"
    if status_code >= 400:
        raise SmsError(str(payload.get("message") or f"Twilio error {status_code}"), 502)
    return {
        "sid": str(payload.get("sid", "")),
        "status": str(payload.get("status", "")),
        "to": mask_phone(target),
        "via": via,
    }


def _trial_template_only(payload: dict) -> bool:
    code = payload.get("code")
    message = str(payload.get("message") or "")
    return code == 572006 or "predefined SMS templates" in message
