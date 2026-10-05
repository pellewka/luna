"""Load trained LoRA weights locally. One worker owns all MLX model operations."""

import asyncio
import importlib.util
import platform
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from training.artifacts import validate_adapter

from .mlx_runtime import generate_text
from .model import LocalModel, ModelUnavailable
from .schemas import GroundedAnswer, Usage


class TrainedModel(LocalModel):
    def __init__(self, settings):
        super().__init__(settings)
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="luna-model")
        self.active = None
        self.stop = Event()
        self.loaded = None

    def validate(self, *, check_base: bool = False) -> dict:
        if platform.system() != "Darwin" or platform.machine() != "arm64":
            raise ModelUnavailable("Дообученная модель запускается на Mac с Apple Silicon.")
        if importlib.util.find_spec("mlx_lm") is None:
            raise ModelUnavailable(
                "Среда MLX не установлена. Запустите npm run ai:serve из папки приложения."
            )
        return validate_adapter(
            self.settings.base_model_path,
            self.settings.adapter_path,
            check_base=check_base,
            require_evaluation=True,
        )

    async def status(self) -> dict[str, str]:
        if not self.settings.generation_enabled:
            return {
                "state": "disabled",
                "message": "Генерация отключена. Доступна справочная сводка.",
            }
        try:
            await asyncio.to_thread(self.validate)
            return {
                "state": "ready",
                "message": "Веса Qwen3-8B с дообучением «Луна» найдены. Первый ответ включает загрузку модели.",
            }
        except (OSError, ValueError, KeyError, TypeError):
            return {
                "state": "missing",
                "message": "Дообученная модель не готова. На Mac выполните ai:prepare-model, ai:train и ai:evaluate через npm run.",
            }

    def generate_sync(self, messages: list[dict[str, str]], stop: Event):
        try:
            if self.loaded is None:
                self.validate(check_base=True)
                from mlx_lm import load

                self.loaded = load(
                    str(self.settings.base_model_path),
                    adapter_path=str(self.settings.adapter_path),
                    trust_remote_code=False,
                )
                self.loaded[0].eval()
            if stop.is_set():
                raise TimeoutError("Загрузка модели превысила время ожидания.")
            text, usage = generate_text(*self.loaded, messages, stop)
            return GroundedAnswer.model_validate_json(text), usage
        except TimeoutError:
            raise
        except (ImportError, OSError, RuntimeError, KeyError) as failure:
            raise ModelUnavailable(
                "Не удалось загрузить или выполнить дообученную модель. Проверьте терминал сервера, память и результат ai:evaluate."
            ) from failure

    async def generate(self, messages: list[dict[str, str]]) -> tuple[GroundedAnswer, Usage]:
        if self.active is not None and not self.active.done():
            raise ModelUnavailable(
                "Модель ещё завершает предыдущий ответ. Повторите вопрос немного позже."
            )
        self.stop = Event()
        self.active = self.worker.submit(self.generate_sync, messages, self.stop)
        try:
            return await asyncio.wait_for(
                asyncio.wrap_future(self.active),
                timeout=self.settings.model_timeout,
            )
        except (TimeoutError, asyncio.CancelledError):
            self.stop.set()
            raise

    def close(self) -> None:
        self.stop.set()
        self.worker.shutdown(wait=False, cancel_futures=True)
