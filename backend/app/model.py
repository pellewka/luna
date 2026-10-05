"""Ollama's documented HTTP API; no model SDK, tools or remote credentials."""

import httpx

from .config import Settings
from .schemas import GroundedAnswer, Usage

RETRIEVAL_INSTRUCTION = (
    "Instruct: Retrieve reliable patient education relevant to this health question.\nQuery: "
)


class ModelUnavailable(ValueError):
    """A local model cannot produce an answer; the app can show its reference fallback."""


class LocalModel:
    def __init__(self, settings: Settings):
        self.settings = settings

    def close(self) -> None:
        pass

    async def status(self) -> dict[str, str]:
        if not self.settings.generation_enabled:
            return {
                "state": "disabled",
                "message": "Генерация отключена. Доступна справочная сводка.",
            }
        try:
            async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
                response = await client.get(f"{self.settings.ollama_url}/api/tags")
                response.raise_for_status()
                names = {item["name"] for item in response.json()["models"]}
            expected = self.settings.chat_model
            if expected in names or f"{expected}:latest" in names:
                return {"state": "ready", "message": f"Модель {expected} найдена в Ollama."}
            return {
                "state": "missing",
                "message": f"Модель не скачана. В терминале компьютера выполните: ollama pull {expected}",
            }
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            return {
                "state": "unreachable",
                "message": "Ollama недоступна. Откройте её на компьютере с сервером и повторите проверку.",
            }

    async def embed(self, text: str, keep_alive: str = "0") -> list[float]:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
            response = await client.post(
                f"{self.settings.ollama_url}/api/embed",
                json={
                    "model": self.settings.embed_model,
                    "input": text,
                    "truncate": False,
                    "keep_alive": keep_alive,
                },
            )
            response.raise_for_status()
            return response.json()["embeddings"][0]

    async def generate(self, messages: list[dict[str, str]]) -> tuple[GroundedAnswer, Usage]:
        async with httpx.AsyncClient(
            timeout=self.settings.model_timeout, trust_env=False
        ) as client:
            response = await client.post(
                f"{self.settings.ollama_url}/api/chat",
                json={
                    "model": self.settings.chat_model,
                    "messages": messages,
                    "stream": False,
                    "think": False,
                    "format": GroundedAnswer.model_json_schema(),
                    "options": {"temperature": 0.1, "num_ctx": 8192, "num_predict": 800},
                    "keep_alive": "5m",
                },
            )
            response.raise_for_status()
            data = response.json()
            answer = GroundedAnswer.model_validate_json(data["message"]["content"])
            usage = Usage(
                input_tokens=data.get("prompt_eval_count", 0),
                output_tokens=data.get("eval_count", 0),
            )
            return answer, usage
