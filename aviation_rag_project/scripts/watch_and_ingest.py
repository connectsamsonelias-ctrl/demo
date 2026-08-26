"""
Scheduled ingestion: run this periodically (via cron / Windows Task
Scheduler / a `docker exec` cron entry) to automatically parse and ingest
any new or changed PDFs dropped into data/manuals/.

Deliberately a one-shot script, not a long-running daemon watching the
filesystem - a cron/Task Scheduler entry that runs it every N minutes is
simpler to set up, easier to reason about, and self-heals if the machine
reboots (no daemon process to restart). It is safe to run repeatedly:
each manual is fingerprinted by its content hash, so already-ingested,
unchanged files are skipped every time.

Usage:
    python scripts/watch_and_ingest.py \
        --manuals-dir data/manuals \
        --db-path ./aviation_vector_db \
        --aircraft-model Airbus-A320

Exit code is always 0 on a normal run (including "nothing to do"); a
per-file ingestion failure is logged and that file is retried on the
next run, but does not stop the other files from being processed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag_engine import AdvancedAviationRAG  # noqa: E402
from scripts.parse_ata_chapters import (  # noqa: E402
    extract_page_text,
    split_pages_into_chunks,
)

logger = logging.getLogger("aviation_rag.watch_and_ingest")


def file_fingerprint(path: Path) -> str:
    """Content hash (not just mtime/size) so a file replaced with new
    content is always detected, even if a copy tool preserves timestamps."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def load_state(state_path: Path) -> dict[str, str]:
    if state_path.exists():
        with open(state_path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_state(state_path: Path, state: dict[str, str]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def find_new_or_changed(
    manuals_dir: Path, state: dict[str, str]
) -> list[tuple[Path, str]]:
    """Returns [(pdf_path, fingerprint), ...] for files whose fingerprint
    doesn't match what's recorded in state (new files, or edited ones)."""
    pending = []
    for pdf in sorted(manuals_dir.glob("*.pdf")):
        fp = file_fingerprint(pdf)
        if state.get(pdf.name) != fp:
            pending.append((pdf, fp))
    return pending


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manuals-dir", default="data/manuals")
    parser.add_argument("--db-path", default="./aviation_vector_db")
    parser.add_argument("--aircraft-model", default="Airbus-A320")
    parser.add_argument(
        "--state-file",
        default=None,
        help="Where to record which manuals have already been ingested. "
        "Defaults to <db-path>/_ingest_state.json (the vector DB directory "
        "is always writable, unlike data/manuals which is mounted read-only "
        "in Docker).",
    )
    parser.add_argument("--log-file", default=None)
    args = parser.parse_args()

    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if args.log_file:
        Path(args.log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(args.log_file))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
    )

    manuals_dir = Path(args.manuals_dir)
    if not manuals_dir.is_dir():
        logger.error("Manuals directory not found: %s", manuals_dir)
        return

    db_path = Path(args.db_path)
    state_path = Path(args.state_file) if args.state_file else db_path / "_ingest_state.json"
    state = load_state(state_path)

    pdf_files = sorted(manuals_dir.glob("*.pdf"))
    if not pdf_files:
        logger.info("No PDFs found in %s - nothing to do.", manuals_dir)
        return

    pending = find_new_or_changed(manuals_dir, state)
    if not pending:
        logger.info(
            "No new or changed manuals (%d already ingested and unchanged).",
            len(pdf_files),
        )
        return

    logger.info(
        "Found %d new/changed manual(s): %s",
        len(pending),
        [p.name for p, _ in pending],
    )

    rag = AdvancedAviationRAG(db_path=str(db_path))

    total_chunks = 0
    failures = 0
    for pdf, fingerprint in pending:
        try:
            pages = extract_page_text(str(pdf))
            chunks = split_pages_into_chunks(pages, args.aircraft_model)
            for chunk in chunks:
                rag.ingest_technical_chunk(
                    chunk_id=chunk["chunk_id"],
                    text_content=chunk["text_content"],
                    metadata=chunk["metadata"],
                )
            total_chunks += len(chunks)

            # Record success immediately after each file, not at the end,
            # so a crash partway through doesn't force already-ingested
            # files to be re-processed on the next run.
            state[pdf.name] = fingerprint
            save_state(state_path, state)
            logger.info("Ingested %s -> %d chunks", pdf.name, len(chunks))
        except Exception:
            failures += 1
            logger.exception(
                "Failed to ingest %s - will retry on the next scheduled run", pdf.name
            )

    logger.info(
        "Done. Ingested %d chunk(s) from %d file(s), %d failure(s).",
        total_chunks,
        len(pending) - failures,
        failures,
    )


if __name__ == "__main__":
    main()
