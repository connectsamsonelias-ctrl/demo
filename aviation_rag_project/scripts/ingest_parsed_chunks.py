"""
Loads the JSON produced by parse_ata_chapters.py and ingests every chunk
into the local AdvancedAviationRAG vector store.

Usage:
    python scripts/ingest_parsed_chunks.py data/parsed_chunks.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag_engine import AdvancedAviationRAG  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("chunks_json", help="Path to parsed_chunks.json")
    parser.add_argument("--db-path", default="./aviation_vector_db")
    args = parser.parse_args()

    with open(args.chunks_json, encoding="utf-8") as f:
        chunks = json.load(f)

    rag = AdvancedAviationRAG(db_path=args.db_path)
    for chunk in chunks:
        rag.ingest_technical_chunk(
            chunk_id=chunk["chunk_id"],
            text_content=chunk["text_content"],
            metadata=chunk["metadata"],
        )

    print(f"Ingested {len(chunks)} chunks into {args.db_path}")


if __name__ == "__main__":
    main()
