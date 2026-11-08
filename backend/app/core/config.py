from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo-root .env (gitignored). Resolved from this file so cwd does not matter.
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    app_mode: Literal["production", "demo"] = "demo"

    database_url: str = "postgresql://halo:halo@localhost:5432/halo"
    rabbitmq_url: str = "amqp://halo:halo@localhost:5672/"

    reviewer_api_key: str = "change-me"
    device_shared_secret: str = "change-me"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    twilio_messaging_service_sid: str = ""
    twilio_demo_to_number: str = ""

    s3_endpoint: str = ""
    s3_bucket: str = "hydrant-halo"
    s3_access_key: str = ""
    s3_secret_key: str = ""

    offline_after_seconds: int = 30


settings = Settings()
