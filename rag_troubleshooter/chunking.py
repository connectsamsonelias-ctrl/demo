"""Structure-aware chunking for maintenance manuals.

Manuals aren't prose: they're headings, spec tables, numbered diagnostic
procedures, and safety warnings. A fixed-size text splitter will happily cut
a table in half or separate step 3 of a procedure from step 4, which makes
the retrieved context actively misleading for a troubleshooting agent.

This module instead:
  1. Splits the document into sections by Markdown heading hierarchy.
  2. Within each section, groups lines into typed blocks: table, procedure
     (numbered/bulleted list), safety_warning (blockquote containing a
     warning marker), or prose.
  3. Merges blocks into chunks up to a target size, but never splits a
     table, procedure, or safety_warning block across chunks.
  4. Prefixes each chunk with its manual title and section path so the
     chunk is self-describing when it's later handed to the LLM in
     isolation from its neighbors.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
TABLE_ROW_RE = re.compile(r"^\s*\|")
NUMBERED_RE = re.compile(r"^\s*\d+\.\s+")
BULLET_RE = re.compile(r"^\s*[-*]\s+")
BLOCKQUOTE_RE = re.compile(r"^\s*>")
WARNING_MARKER_RE = re.compile(r"⚠|WARNING|CAUTION|DANGER", re.IGNORECASE)


@dataclass
class Section:
    path: List[str]
    lines: List[str]


@dataclass
class Block:
    kind: str  # "table" | "procedure" | "safety_warning" | "note" | "prose"
    text: str


@dataclass
class Chunk:
    id: str
    text: str
    metadata: dict


def split_sections(body: str) -> List[Section]:
    """Walk a Markdown document and group lines under their heading path."""
    stack: List[tuple] = []  # (level, title)
    sections: List[Section] = []
    current_lines: List[str] = []

    def flush():
        if current_lines and any(line.strip() for line in current_lines):
            sections.append(Section(path=[t for _, t in stack], lines=list(current_lines)))
        current_lines.clear()

    for line in body.splitlines():
        match = HEADING_RE.match(line)
        if match:
            flush()
            level = len(match.group(1))
            title = match.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
        else:
            current_lines.append(line)
    flush()
    return sections


def _hard_kind(line: str) -> Optional[str]:
    """Classify a line that unambiguously *starts* a new block kind.

    Returns None for lines that carry no structural marker of their own -
    either a wrapped continuation of the previous line (e.g. the second
    physical line of a numbered step that wrapped without repeating "2.")
    or, if nothing is open yet, plain prose.
    """
    if TABLE_ROW_RE.match(line):
        return "table"
    if BLOCKQUOTE_RE.match(line):
        return "safety_warning" if WARNING_MARKER_RE.search(line) else "note"
    if NUMBERED_RE.match(line) or BULLET_RE.match(line):
        return "procedure"
    return None


def split_blocks(lines: List[str]) -> List[Block]:
    """Group section lines into typed blocks (table/procedure/warning/prose).

    A line with no structural marker of its own (no leading "N.", "-", "|",
    or ">") is treated as a continuation of whatever block is currently
    open, rather than as a new prose block. Manual text routinely wraps a
    single numbered step across multiple physical lines, and without this
    the wrapped continuation would be misclassified as prose and split away
    from the step it belongs to.
    """
    blocks: List[Block] = []
    buf: List[str] = []
    buf_kind: Optional[str] = None

    def flush():
        nonlocal buf, buf_kind
        text = "\n".join(buf).strip()
        if text:
            blocks.append(Block(kind=buf_kind or "prose", text=text))
        buf = []
        buf_kind = None

    for line in lines:
        if not line.strip():
            # A blank line ends prose, but numbered procedures often contain
            # a blank line between the intro and step 1, or between steps
            # with sub-notes, so keep those open.
            if buf_kind == "procedure":
                buf.append(line)
            else:
                flush()
            continue

        hard = _hard_kind(line)
        if hard is None:
            # Continuation line: extend whatever block is open, or start
            # prose if nothing is open.
            if buf_kind is None:
                buf_kind = "prose"
            buf.append(line)
        elif hard == buf_kind:
            buf.append(line)
        else:
            flush()
            buf_kind = hard
            buf.append(line)
    flush()
    return blocks


def merge_blocks_to_chunks(blocks: List[Block], max_chars: int = 900) -> List[List[Block]]:
    """Group blocks into chunks, never splitting a structural block."""
    groups: List[List[Block]] = []
    current: List[Block] = []
    current_len = 0

    ATOMIC_KINDS = {"table", "procedure", "safety_warning"}

    for block in blocks:
        if block.kind in ATOMIC_KINDS:
            if current:
                groups.append(current)
                current = []
                current_len = 0
            groups.append([block])
            continue

        block_len = len(block.text)
        if current and current_len + block_len > max_chars:
            groups.append(current)
            current = []
            current_len = 0
        current.append(block)
        current_len += block_len

    if current:
        groups.append(current)
    return groups


def build_chunks(source_file: str, front_matter: dict, body: str, max_chars: int = 900) -> List[Chunk]:
    """Turn a parsed Markdown manual into a list of retrieval-ready Chunks."""
    sections = split_sections(body)
    manual_title = front_matter.get("title", source_file)
    chunks: List[Chunk] = []
    idx = 0

    for section in sections:
        blocks = split_blocks(section.lines)
        for group in merge_blocks_to_chunks(blocks, max_chars=max_chars):
            text = "\n\n".join(b.text for b in group).strip()
            if not text:
                continue
            kinds = {b.kind for b in group}
            chunk_type = next(iter(kinds)) if len(kinds) == 1 else "mixed"
            section_path = " > ".join(section.path) if section.path else manual_title

            header = f"[{manual_title} | {section_path}]"
            full_text = f"{header}\n{text}"

            idx += 1
            manual_id = front_matter.get("manual_id", source_file)
            chunk_id = f"{manual_id}::{idx}"

            metadata = {
                "manual_id": manual_id,
                "title": manual_title,
                "model": front_matter.get("model", ""),
                "section_path": section_path,
                "chunk_type": chunk_type,
                "source_file": source_file,
                "contains_safety_warning": "safety_warning" in kinds,
            }
            chunks.append(Chunk(id=chunk_id, text=full_text, metadata=metadata))

    return chunks


def chunk_pdf_pages(source_file: str, pages: List[tuple], max_chars: int = 900) -> List[Chunk]:
    """Fallback chunker for PDFs that lack Markdown structure.

    PDFs extracted via pypdf give us plain text per page with no reliable
    heading markup, so we fall back to paragraph-bounded, size-limited
    windows and keep the page number as metadata (still enough for a
    citation like "Manual X, p.12").
    """
    chunks: List[Chunk] = []
    idx = 0
    manual_title = source_file

    for page_number, text in pages:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        current = ""
        for para in paragraphs:
            if current and len(current) + len(para) > max_chars:
                idx += 1
                chunks.append(_make_pdf_chunk(source_file, manual_title, page_number, idx, current))
                current = para
            else:
                current = f"{current}\n\n{para}" if current else para
        if current:
            idx += 1
            chunks.append(_make_pdf_chunk(source_file, manual_title, page_number, idx, current))

    return chunks


def _make_pdf_chunk(source_file, manual_title, page_number, idx, text) -> Chunk:
    header = f"[{manual_title} | p.{page_number}]"
    return Chunk(
        id=f"{source_file}::{idx}",
        text=f"{header}\n{text}",
        metadata={
            "manual_id": source_file,
            "title": manual_title,
            "model": "",
            "section_path": f"p.{page_number}",
            "chunk_type": "prose",
            "source_file": source_file,
            "contains_safety_warning": bool(WARNING_MARKER_RE.search(text)),
        },
    )
