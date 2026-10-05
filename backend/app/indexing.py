"""Batch and resume embeddings of public knowledge. Patient data never enters this cache."""

import hashlib
import json
import math
import sqlite3
from pathlib import Path

import httpx

from .config import Settings
from .knowledge import Article


def valid_vector(value: object) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(isinstance(x, (int, float)) and math.isfinite(x) for x in value)
        and any(value)
    )


def embed_articles(
    articles: list[Article],
    settings: Settings,
    cache_path: Path,
    batch_size: int = 4,
    refresh: bool = False,
    transport: httpx.BaseTransport | None = None,
) -> list[list[float]]:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    vectors: list[list[float] | None] = [None] * len(articles)
    with (
        httpx.Client(timeout=180, trust_env=False, transport=transport) as client,
        sqlite3.connect(cache_path) as cache,
    ):
        response = client.get(f"{settings.ollama_url}/api/tags")
        response.raise_for_status()
        names = {settings.embed_model, settings.embed_model + ":latest"}
        digest = next(
            (
                item.get("digest")
                for item in response.json()["models"]
                if item.get("name") in names or item.get("model") in names
            ),
            None,
        )
        if not digest:
            raise ValueError(
                f"Install the embedding model first: ollama pull {settings.embed_model}"
            )
        namespace = settings.embed_model + ":" + digest
        cache.execute(
            "CREATE TABLE IF NOT EXISTS embeddings "
            "(model TEXT, content_hash TEXT, vector TEXT, PRIMARY KEY(model, content_hash))"
        )
        pending = []
        for index, article in enumerate(articles):
            text = f"{article.title}\n{article.keywords}\n{article.text}"
            content_hash = hashlib.sha256(text.encode()).hexdigest()
            saved = (
                None
                if refresh
                else cache.execute(
                    "SELECT vector FROM embeddings WHERE model=? AND content_hash=?",
                    (namespace, content_hash),
                ).fetchone()
            )
            if saved and valid_vector(value := json.loads(saved[0])):
                vectors[index] = value
            else:
                pending.append((index, content_hash, text))
        complete = len(articles) - len(pending)
        print(f"Embeddings: {complete}/{len(articles)} available in cache.", flush=True)
        for offset in range(0, len(pending), batch_size):
            batch = pending[offset : offset + batch_size]
            response = client.post(
                f"{settings.ollama_url}/api/embed",
                json={
                    "model": settings.embed_model,
                    "input": [text for _, _, text in batch],
                    "truncate": False,
                    "keep_alive": "5m",
                },
            )
            response.raise_for_status()
            values = response.json()["embeddings"]
            if len(values) != len(batch) or any(not valid_vector(value) for value in values):
                raise ValueError("Ollama returned an invalid embedding batch")
            for (index, content_hash, _), value in zip(batch, values, strict=True):
                vectors[index] = value
                cache.execute(
                    "INSERT OR REPLACE INTO embeddings VALUES (?, ?, ?)",
                    (namespace, content_hash, json.dumps(value)),
                )
            cache.commit()
            complete += len(batch)
            print(f"Embeddings: {complete}/{len(articles)}", flush=True)
    if any(vector is None for vector in vectors):
        raise ValueError("Incomplete embedding set")
    return [vector for vector in vectors if vector is not None]
