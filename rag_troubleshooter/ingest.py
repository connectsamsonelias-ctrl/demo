"""Build the retrieval index from a directory of manuals.

Produces two artifacts under `store_dir`:
  - chunks.jsonl: the canonical chunk store (id, text, metadata), used both
    as the source of truth for BM25 keyword search and to hydrate results
    from the vector store.
  - chroma/: a persistent Chroma collection holding the semantic embeddings,
    built with Chroma's bundled embedding model so no separate embedding
    API key is required.

If chromadb isn't installed or the embedding model can't be reached, ingest
still succeeds and the retriever transparently falls back to BM25-only
keyword search (see retriever.py).
"""

import json
from pathlib import Path
from typing import List

from .chunking import Chunk, build_chunks, chunk_pdf_pages
from .loaders import load_markdown, load_pdf

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANUALS_DIR = PACKAGE_ROOT / "manuals"
DEFAULT_STORE_DIR = PACKAGE_ROOT / ".rag_store"
CHUNKS_FILENAME = "chunks.jsonl"


def ingest_manuals(manuals_dir=DEFAULT_MANUALS_DIR, store_dir=DEFAULT_STORE_DIR, max_chars: int = 900) -> dict:
    manuals_dir = Path(manuals_dir)
    store_dir = Path(store_dir)
    store_dir.mkdir(parents=True, exist_ok=True)

    if not manuals_dir.exists():
        raise FileNotFoundError(f"Manuals directory not found: {manuals_dir}")

    all_chunks: List[Chunk] = []
    files_processed = 0
    for path in sorted(manuals_dir.glob("*")):
        if path.suffix.lower() == ".md":
            front_matter, body = load_markdown(path)
            all_chunks.extend(build_chunks(path.name, front_matter, body, max_chars=max_chars))
            files_processed += 1
        elif path.suffix.lower() == ".pdf":
            pages = load_pdf(path)
            all_chunks.extend(chunk_pdf_pages(path.name, pages, max_chars=max_chars))
            files_processed += 1

    chunks_path = store_dir / CHUNKS_FILENAME
    with chunks_path.open("w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps({"id": chunk.id, "text": chunk.text, "metadata": chunk.metadata}) + "\n")

    n_embedded = _build_vector_index(all_chunks, store_dir)

    return {
        "files_processed": files_processed,
        "n_chunks": len(all_chunks),
        "n_embedded": n_embedded,
        "store_dir": str(store_dir),
    }


def _build_vector_index(chunks: List[Chunk], store_dir: Path) -> int:
    try:
        import chromadb
    except ImportError:
        return 0

    try:
        client = chromadb.PersistentClient(path=str(store_dir / "chroma"))
        try:
            client.delete_collection("manuals")
        except Exception:
            pass
        collection = client.create_collection("manuals")

        if not chunks:
            return 0

        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            collection.add(
                ids=[c.id for c in batch],
                documents=[c.text for c in batch],
                metadatas=[c.metadata for c in batch],
            )
        return len(chunks)
    except Exception:
        # Embedding model download or Chroma init failed (e.g. no network).
        # Ingestion still succeeds; retriever falls back to BM25-only.
        return 0
