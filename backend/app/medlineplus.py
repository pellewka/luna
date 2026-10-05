"""Import only the public-domain Health Topic summaries from NLM's XML feed."""

import hashlib
import io
import json
import re
import zipfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, build_opener
from xml.etree import ElementTree

INDEX_URL = "https://medlineplus.gov/xml.html"
TERMS_URL = "https://medlineplus.gov/about/using/usingcontent/"
MAX_DOWNLOAD = 16 * 1024 * 1024
MAX_XML = 64 * 1024 * 1024
CHUNK_SIZE = 1800


class SummaryText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        elif tag in {"p", "li", "h2", "h3", "h4", "br"}:
            self.parts.append("\n\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        elif tag in {"p", "li", "h2", "h3", "h4"}:
            self.parts.append("\n\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

    def text(self) -> str:
        paragraphs = [re.sub(r"\s+", " ", p).strip() for p in "".join(self.parts).split("\n\n")]
        return "\n\n".join(p for p in paragraphs if p)


def summary_text(element: ElementTree.Element) -> str:
    parser = SummaryText()
    html = element.text or ""
    html += "".join(ElementTree.tostring(child, encoding="unicode") for child in element)
    parser.feed(html)
    return parser.text()


def split_summary(text: str, limit: int = CHUNK_SIZE) -> list[str]:
    """Keep paragraph/sentence boundaries and a short overlap, without truncating the source."""
    pieces = []
    for paragraph in text.split("\n\n"):
        while len(paragraph) > limit:
            end = paragraph.rfind(". ", 0, limit - 1)
            end = end + 1 if end >= limit // 2 else paragraph.rfind(" ", 0, limit)
            end = end if end > 0 else limit
            pieces.append(paragraph[:end].strip())
            paragraph = paragraph[end:].strip()
        if paragraph:
            pieces.append(paragraph)
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        joined = "\n\n".join(p for p in (current, piece) if p)
        if len(joined) <= limit:
            current = joined
            continue
        chunks.append(current)
        overlap = current.split("\n\n")[-1]
        current = (
            overlap + "\n\n" + piece
            if len(overlap) <= 240 and len(overlap) + len(piece) + 2 <= limit
            else piece
        )
    if current:
        chunks.append(current)
    return chunks


def parse_topics(xml: bytes, aliases: dict) -> dict:
    if len(xml) > MAX_XML or re.search(rb"<!ENTITY", xml, re.I):
        raise ValueError("XML is too large or contains entity declarations")
    root = ElementTree.fromstring(xml)
    if root.tag != "health-topics":
        raise ValueError("Expected the MedlinePlus Health Topics XML feed")
    generated = root.attrib["date-generated"]
    snapshot = datetime.strptime(generated.split()[0], "%m/%d/%Y").date().isoformat()
    articles = []
    topics = set()
    translated = set()
    skipped = 0
    for topic in root.findall("health-topic"):
        if topic.get("language") != "English":
            continue
        url = topic.attrib["url"]
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or parsed.netloc != "medlineplus.gov"
            or not re.fullmatch(r"/[a-z0-9]+\.html", parsed.path)
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(f"Unexpected Health Topic URL: {url}")
        element = topic.find("full-summary")
        text = summary_text(element) if element is not None else ""
        if not text:
            skipped += 1
            continue
        document_id = "medlineplus-" + topic.attrib["id"]
        if document_id in topics:
            raise ValueError("Duplicate health topic ID")
        topics.add(document_id)
        slug = Path(parsed.path).stem
        russian = aliases.get(slug, {})
        if russian:
            translated.add(slug)
        title = topic.attrib["title"]
        display_title = russian.get("title", title)
        terms = [title, russian.get("keywords", ""), display_title]
        for tag in ("also-called", "see-reference", "mesh-heading/descriptor"):
            terms.extend(node.text or "" for node in topic.findall(tag))
        for index, chunk in enumerate(split_summary(text), 1):
            articles.append(
                {
                    "id": f"{document_id}-{index:02d}",
                    "document_id": document_id,
                    "title": display_title,
                    "keywords": " ".join(dict.fromkeys(t for t in terms if t)),
                    "text": chunk,
                    "url": url,
                    "publisher": "MedlinePlus · National Library of Medicine",
                    "checked_at": snapshot,
                    "language": "en",
                }
            )
    if not articles:
        raise ValueError("No English summaries found")
    return {
        "dataset": "MedlinePlus Health Topics",
        "source": INDEX_URL,
        "terms": TERMS_URL,
        "attribution": "Source: MedlinePlus, National Library of Medicine.",
        "snapshot_date": snapshot,
        "source_sha256": hashlib.sha256(xml).hexdigest(),
        "source_topics": len(topics),
        "russian_topic_aliases": len(translated),
        "skipped_empty_summaries": skipped,
        "note": "English public-domain summaries only. Russian titles are local search labels, not official translations. No linked websites, A.D.A.M. articles or ASHP drug monographs are imported.",
        "articles": articles,
    }


def download_feed() -> tuple[bytes, str]:
    opener = build_opener(OfficialRedirect())
    with opener.open(INDEX_URL, timeout=60) as response:
        page = response.read(1024 * 1024 + 1)
    if len(page) > 1024 * 1024:
        raise ValueError("Unexpectedly large download index")
    links = re.findall(
        r'href="([^\"]*mplus_topics_compressed_\d{4}-\d{2}-\d{2}\.zip)"', page.decode("utf-8")
    )
    if not links:
        raise ValueError("NLM download page has changed; no official XML archive found")
    url = urljoin(INDEX_URL, sorted(links, reverse=True)[0])
    if not re.fullmatch(
        r"https://medlineplus\.gov/xml/mplus_topics_compressed_\d{4}-\d{2}-\d{2}\.zip", url
    ):
        raise ValueError("The feed must be downloaded from medlineplus.gov/xml/")
    parts = []
    size = 0
    with opener.open(url, timeout=60) as response:
        while part := response.read(65536):
            size += len(part)
            if size > MAX_DOWNLOAD:
                raise ValueError("NLM archive exceeds the download size limit")
            parts.append(part)
    with zipfile.ZipFile(io.BytesIO(b"".join(parts))) as archive:
        files = [entry for entry in archive.infolist() if entry.filename.endswith(".xml")]
        if len(files) != 1 or files[0].file_size > MAX_XML:
            raise ValueError("Unexpected XML archive structure or size")
        return archive.read(files[0]), url


class OfficialRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        url = urlparse(newurl)
        if url.scheme != "https" or url.netloc != "medlineplus.gov":
            raise ValueError("Download redirected outside the official NLM host")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def write_dataset(payload: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    try:
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
