"""Loaders that turn source manual files into (front_matter, body) or page text."""

import re
from pathlib import Path

import yaml

FRONT_MATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def load_markdown(path: Path):
    """Parse a Markdown manual with optional YAML front matter.

    Returns (front_matter: dict, body: str).
    """
    text = Path(path).read_text(encoding="utf-8")
    match = FRONT_MATTER_RE.match(text)
    if match:
        front_matter = yaml.safe_load(match.group(1)) or {}
        body = match.group(2)
    else:
        front_matter = {}
        body = text
    return front_matter, body


def load_pdf(path: Path):
    """Extract per-page text from a PDF manual.

    Returns a list of (page_number, text) tuples. Requires pypdf, which is
    only imported here so environments that only use Markdown manuals don't
    need it installed.
    """
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append((i, text))
    return pages
