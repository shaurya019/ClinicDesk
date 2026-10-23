"""Settings from environment variables (.env). No secrets in code."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    # NeMo reads OPENAI_API_KEY itself; we only check it is present for a clear startup error.
    openai_api_key: str | None = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    mongo_uri: str = Field(default_factory=lambda: os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    mongo_db: str = Field(default_factory=lambda: os.getenv("MONGO_DB", "guardrails_p2"))
    config_path: Path = Field(default_factory=lambda: Path(os.getenv("NEMO_CONFIG_PATH", BACKEND_DIR / "config")))
    expose_prompts: bool = Field(default_factory=lambda: _bool("EXPOSE_PROMPTS", True))
    cors_origins: list[str] = Field(
        default_factory=lambda: os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","))
    max_history_turns: int = 6        # how many previous messages we send back to NeMo
    max_message_chars: int = 1000     # app-level limit, enforced by Pydantic before NeMo runs
