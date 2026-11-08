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
    gemini_model: str = "gemini-2.5-flash"

    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_treasury_keypair_path: str = ""
    solana_usdc_mint: str = ""
    bounty_amount: float = 5.0

    s3_endpoint: str = ""
    s3_bucket: str = "hydrant-halo"
    s3_access_key: str = ""
    s3_secret_key: str = ""

    offline_after_seconds: int = 30


settings = Settings()
