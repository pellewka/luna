"""Download the current NLM summaries; optionally read a previously downloaded XML file."""

import argparse
import json
from pathlib import Path
from urllib.error import URLError
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile

from app.config import Settings
from app.knowledge import build_index
from app.medlineplus import download_feed, parse_topics, write_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Update the public MedlinePlus knowledge corpus")
    parser.add_argument("--xml", type=Path, help="Use a local official Health Topics XML file")
    args = parser.parse_args()
    config = Settings()
    folder = config.corpus.parent
    aliases = json.loads((folder / "topic_aliases.json").read_text(encoding="utf-8"))
    xml, url = (args.xml.read_bytes(), "local XML") if args.xml else download_feed()
    payload = parse_topics(xml, aliases)
    if payload["source_topics"] < 900:
        raise ValueError("The feed appears incomplete (fewer than 900 English summaries)")
    if not args.xml:
        payload["download_url"] = url
    destination = folder / "medlineplus.json"
    previous = destination.read_bytes() if destination.exists() else None
    write_dataset(payload, destination)
    try:
        count = build_index(config.corpus, config.database)
    except Exception:
        if previous is None:
            destination.unlink(missing_ok=True)
        else:
            restored = destination.with_suffix(".restore")
            restored.write_bytes(previous)
            restored.replace(destination)
        raise
    print(f"MedlinePlus {payload['snapshot_date']}: {payload['source_topics']} topics imported.")
    print(f"Text index: {count} fragments. Your diary was not accessed.")
    print("For multilingual semantic search, run: npm run rag:index")


if __name__ == "__main__":
    try:
        main()
    except (URLError, ValueError, OSError, ParseError, BadZipFile) as error:
        raise SystemExit(f"Не удалось обновить базу: {error}") from None
