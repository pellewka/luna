"""Server configuration. No medical records or chat transcripts are persisted."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    database: Path = ROOT / "data" / "knowledge.sqlite3"
    corpus: Path = ROOT / "knowledge" / "articles.json"
    ollama_url: str = field(
        default_factory=lambda: os.getenv("LUNA_OLLAMA_URL", "http://127.0.0.1:11434")
    )
    chat_model: str = field(default_factory=lambda: os.getenv("LUNA_CHAT_MODEL", "qwen3:4b"))
    embed_model: str = field(
        default_factory=lambda: os.getenv("LUNA_EMBED_MODEL", "qwen3-embedding:0.6b")
    )
    generation_enabled: bool = field(
        default_factory=lambda: os.getenv("LUNA_GENERATION_ENABLED", "true").lower() == "true"
    )
    api_token: str = field(default_factory=lambda: os.getenv("LUNA_API_TOKEN", ""))
    allowed_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            value.strip()
            for value in os.getenv(
                "LUNA_ALLOWED_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081"
            ).split(",")
            if value.strip()
        )
    )
    model_timeout: float = field(
        default_factory=lambda: float(os.getenv("LUNA_MODEL_TIMEOUT", "90"))
    )
    model_backend: str = field(default_factory=lambda: os.getenv("LUNA_MODEL_BACKEND", "ollama"))
    base_model_path: Path = field(
        default_factory=lambda: (
            Path(os.getenv("LUNA_BASE_MODEL_PATH", str(ROOT / "models" / "qwen3-8b-4bit")))
            .expanduser()
            .resolve()
        )
    )
    adapter_path: Path = field(
        default_factory=lambda: (
            Path(os.getenv("LUNA_ADAPTER_PATH", str(ROOT / "models" / "luna-lora")))
            .expanduser()
            .resolve()
        )
    )

    @property
    def active_model(self) -> str:
        return "Qwen3-8B + Luna LoRA" if self.model_backend == "mlx" else self.chat_model

    def __post_init__(self) -> None:
        if self.model_backend not in {"ollama", "mlx"}:
            raise ValueError("LUNA_MODEL_BACKEND must be ollama or mlx")
        # Avoid accidentally sending health questions to a cloud model server.
        url = urlparse(self.ollama_url)
        if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("LUNA_OLLAMA_URL must point to a local Ollama server")
        if self.chat_model.endswith("-cloud") or self.embed_model.endswith("-cloud"):
            raise ValueError("This prototype only supports locally downloaded models")
