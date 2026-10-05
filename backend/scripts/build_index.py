"""python -m scripts.build_index [--semantic]"""

import argparse

import httpx

from app.config import Settings
from app.indexing import embed_articles
from app.knowledge import build_index, load_articles


def main() -> None:
    parser = argparse.ArgumentParser(description="Index Luna's curated, public knowledge corpus")
    parser.add_argument(
        "--semantic", action="store_true", help="Build embeddings using local Ollama"
    )
    parser.add_argument("--batch-size", type=int, default=4, choices=range(1, 33), metavar="1..32")
    parser.add_argument("--refresh", action="store_true", help="Recompute cached embeddings")
    args = parser.parse_args()
    config = Settings()
    vectors = None
    if args.semantic:
        articles = load_articles(config.corpus)
        vectors = embed_articles(
            articles,
            config,
            config.database.parent / "embedding-cache.sqlite3",
            args.batch_size,
            args.refresh,
        )
    count = build_index(config.corpus, config.database, vectors, config.embed_model)
    print(f"Ready: {count} articles; {'hybrid' if vectors else 'text'} index at {config.database}")


if __name__ == "__main__":
    try:
        main()
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise SystemExit(
            "Не удалось получить векторы. Откройте Ollama и выполните "
            "ollama pull qwen3-embedding:0.6b. Прежний индекс сохранён; "
            "готовые пакеты сохранены в кэше. Повторите команду для продолжения. "
            f"Подробности: {error}"
        ) from None
