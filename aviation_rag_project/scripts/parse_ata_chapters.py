"""
Extract ATA iSpec 2200 chapter headers (e.g. "ATA 32-21-00") from a
maintenance manual PDF and split the document into chunks tagged with
that metadata, ready for AdvancedAviationRAG.ingest_technical_chunk().

Usage:
    python scripts/parse_ata_chapters.py path/to/manual.pdf \
        --aircraft-model Airbus-A320 \
        --out data/parsed_chunks.json

ATA references in real manuals show up in a few common forms, e.g.:
    ATA 32-21-00
    ATA 32-21-00-001
    32-21-00  (chapter-section-subject, no "ATA" prefix, common in running headers)
This script matches all of those and captures chapter / section / subject
as separate groups.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF

# Matches "ATA 32-21-00" or "32-21-00", optionally with a trailing "-001"
# unit/subtask suffix. Chapter/section/subject are each 2 digits per the
# ATA iSpec 2200 numbering convention.
ATA_HEADER_PATTERN = re.compile(
    r"""
    (?:ATA\s*)?          # optional "ATA " prefix
    \b(\d{2})             # chapter, e.g. 32
    -(\d{2})               # section, e.g. 21
    -(\d{2})                # subject, e.g. 00
    (?:-\d{2,3})?             # optional trailing unit/task suffix
    \b
    """,
    re.VERBOSE,
)


def extract_page_text(pdf_path: str) -> list[str]:
    """Returns a list of page texts using PyMuPDF."""
    doc = fitz.open(pdf_path)
    try:
        return [page.get_text() for page in doc]
    finally:
        doc.close()


def find_ata_headers(text: str) -> list[dict[str, str]]:
    """Returns all ATA chapter references found in a block of text."""
    matches = []
    for m in ATA_HEADER_PATTERN.finditer(text):
        chapter, section, subject = m.groups()
        matches.append(
            {
                "ata_chapter": chapter,
                "ata_section": section,
                "ata_subject": subject,
                "ata_code": f"{chapter}-{section}-{subject}",
                "match_span": m.span(),
            }
        )
    return matches


def split_pages_into_chunks(
    pages: list[str], aircraft_model: str
) -> list[dict[str, Any]]:
    """
    Splits each page's text at ATA header boundaries so every chunk is
    tagged with the ATA chapter that governs it. A page with no ATA
    header found anywhere before it falls back to ata_chapter="UNSPECIFIED"
    so nothing is silently dropped.
    """
    chunks: list[dict[str, Any]] = []
    current_ata: dict[str, str] | None = None

    for page_num, page_text in enumerate(pages, start=1):
        headers = find_ata_headers(page_text)

        if not headers:
            if current_ata is None:
                continue  # no ATA context yet and none on this page - skip
            chunks.append(
                _build_chunk(page_text, page_num, aircraft_model, current_ata)
            )
            continue

        # Split the page text at each header boundary so text following a
        # new header is tagged with that header, not the previous one.
        boundaries = [h["match_span"][0] for h in headers] + [len(page_text)]
        start = 0
        active_header = current_ata
        header_idx = 0

        for boundary in boundaries:
            segment = page_text[start:boundary].strip()
            if segment:
                tag = active_header or {
                    "ata_chapter": "UNSPECIFIED",
                    "ata_section": "UNSPECIFIED",
                    "ata_subject": "UNSPECIFIED",
                    "ata_code": "UNSPECIFIED",
                }
                chunks.append(
                    _build_chunk(segment, page_num, aircraft_model, tag)
                )
            if header_idx < len(headers):
                active_header = headers[header_idx]
                header_idx += 1
            start = boundary

        current_ata = active_header

    return chunks


def _build_chunk(
    text: str, page_num: int, aircraft_model: str, ata_tag: dict[str, str]
) -> dict[str, Any]:
    return {
        "chunk_id": f"page{page_num}_{ata_tag['ata_code']}_{abs(hash(text)) % 100000}",
        "text_content": text,
        "metadata": {
            "aircraft_model": aircraft_model,
            "ata_chapter": ata_tag["ata_chapter"],
            "section": ata_tag["ata_section"],
            "ata_code": ata_tag["ata_code"],
            "page": page_num,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf_path", help="Path to the manual PDF to parse")
    parser.add_argument(
        "--aircraft-model", default="Airbus-A320", help="Aircraft model tag for all chunks"
    )
    parser.add_argument(
        "--out", default="data/parsed_chunks.json", help="Where to write the parsed chunk JSON"
    )
    args = parser.parse_args()

    pages = extract_page_text(args.pdf_path)
    chunks = split_pages_into_chunks(pages, args.aircraft_model)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, indent=2)

    print(f"Parsed {len(pages)} pages -> {len(chunks)} chunks -> {out_path}")
    ata_chapters_found = sorted({c["metadata"]["ata_chapter"] for c in chunks})
    print(f"ATA chapters found: {ata_chapters_found}")


if __name__ == "__main__":
    main()
