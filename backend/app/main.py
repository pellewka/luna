"""Run from backend/: python -m uvicorn app.main:app --no-access-log"""

import asyncio
import hmac
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .knowledge import INDEX_SCHEMA, KnowledgeBase, build_index, corpus_digest
from .mlx_model import TrainedModel
from .model import LocalModel
from .schemas import ChatRequest, ChatResponse
from .service import answer_question


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    slots = asyncio.Semaphore(1 if config.model_backend == "mlx" else 2)
    traffic: OrderedDict[str, deque[float]] = OrderedDict()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        corpus_hash = corpus_digest(config.corpus)
        info = knowledge.info() if config.database.exists() else {}
        if info.get("corpus_sha256") != corpus_hash or info.get("schema_version") != INDEX_SCHEMA:
            build_index(config.corpus, config.database)
        try:
            yield
        finally:
            model.close()

    application = FastAPI(title="Luna Assistant", version="2.5.0", lifespan=lifespan)
    knowledge = KnowledgeBase(config.database)
    model = TrainedModel(config) if config.model_backend == "mlx" else LocalModel(config)

    @application.middleware("http")
    async def access_control(request: Request, call_next):
        # A browser origin is never an authentication mechanism.
        if request.method != "OPTIONS":
            token = request.headers.get("authorization", "")
            client = request.client.host if request.client else ""
            if config.api_token:
                if not hmac.compare_digest(token.encode(), f"Bearer {config.api_token}".encode()):
                    return JSONResponse({"detail": "Неверный ключ подключения."}, status_code=401)
            elif client not in {"127.0.0.1", "::1", "testclient"}:
                return JSONResponse(
                    {"detail": "Для доступа по сети настройте LUNA_API_TOKEN."}, status_code=403
                )
            origin = request.headers.get("origin")
            if origin and origin not in config.allowed_origins:
                return JSONResponse({"detail": "Источник запроса не разрешён."}, status_code=403)
            if request.method == "POST":
                size = 0
                chunks = []
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > 65536:
                        return JSONResponse(
                            {"detail": "Сообщение слишком большое."}, status_code=413
                        )
                    chunks.append(chunk)
                request._body = b"".join(chunks)
                now = time.monotonic()
                queue = traffic.setdefault(client, deque())
                traffic.move_to_end(client)
                while queue and now - queue[0] > 60:
                    queue.popleft()
                if len(queue) >= 15:
                    return JSONResponse(
                        {"detail": "Слишком много запросов. Попробуйте через минуту."},
                        status_code=429,
                    )
                queue.append(now)
                while len(traffic) > 1000:
                    traffic.popitem(last=False)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.allowed_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @application.get("/health")
    async def health():
        return {
            "status": "ok",
            "version": "2.5.0",
            "features": ["diary", "medication-timeline", "labs"],
            "knowledge": knowledge.info(),
            "generation_enabled": config.generation_enabled,
            "chat_model": config.active_model,
            "model": await model.status(),
        }

    @application.post("/v1/chat", response_model=ChatResponse)
    async def chat(request: ChatRequest):
        try:
            await asyncio.wait_for(slots.acquire(), timeout=0.1)
        except TimeoutError:
            raise HTTPException(503, "Помощник занят. Повторите запрос немного позже.") from None
        try:
            return await answer_question(request, config, knowledge, model)
        finally:
            slots.release()

    return application


app = create_app()
