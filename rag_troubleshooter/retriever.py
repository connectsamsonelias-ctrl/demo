"""Hybrid retrieval over the ingested manual chunks.

Maintenance troubleshooting queries are a mix of two very different signal
types:
  - Exact tokens that matter precisely: error codes ("E45"), part numbers,
    model names. Semantic embeddings are surprisingly bad at these because
    "E45" and "E52" look nearly identical in embedding space.
  - Fuzzy natural-language symptoms ("compressor won't start", "loud
    grinding noise") where semantic similarity is exactly what you want.

So retrieval here combines BM25 keyword search (always available, no
network dependency) with Chroma semantic search (when available) using
Reciprocal Rank Fusion, rather than picking one strategy.
"""

import json
import re
from pathlib import Path
from typing import List, Optional

from rank_bm25 import BM25Okapi

TOKEN_RE = re.compile(r"[A-Za-z0-9]+")
RRF_K = 60


def _tokenize(text: str) -> List[str]:
    return TOKEN_RE.findall(text.lower())


class ManualRetriever:
    def __init__(self, store_dir):
        self.store_dir = Path(store_dir)
        chunks_path = self.store_dir / "chunks.jsonl"
        if not chunks_path.exists():
            raise FileNotFoundError(
                f"No index found at {chunks_path}. Run `ingest` first."
            )

        self.chunks = []
        with chunks_path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    self.chunks.append(json.loads(line))

        if not self.chunks:
            raise ValueError(f"Index at {chunks_path} is empty.")

        self.id_to_chunk = {c["id"]: c for c in self.chunks}
        self._bm25 = BM25Okapi([_tokenize(c["text"]) for c in self.chunks])
        self._collection = self._load_chroma_collection()

    def _load_chroma_collection(self):
        try:
            import chromadb

            client = chromadb.PersistentClient(path=str(self.store_dir / "chroma"))
            return client.get_collection("manuals")
        except Exception:
            return None

    @property
    def semantic_search_available(self) -> bool:
        return self._collection is not None

    def retrieve(self, query: str, k: int = 6, model: Optional[str] = None) -> List[dict]:
        """Return the top-k chunks for `query`, optionally filtered to an
        equipment model, fused across keyword and semantic search."""
        rrf_scores = {}
        fetch_n = min(max(k * 3, k), len(self.chunks))

        bm25_scores = self._bm25.get_scores(_tokenize(query))
        ranked_bm25 = sorted(range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True)
        bm25_added = 0
        for i in ranked_bm25:
            if bm25_added >= fetch_n:
                break
            chunk = self.chunks[i]
            if model and chunk["metadata"].get("model") not in (model, "", None):
                continue
            rrf_scores[chunk["id"]] = rrf_scores.get(chunk["id"], 0.0) + 1.0 / (RRF_K + bm25_added)
            bm25_added += 1

        if self._collection is not None:
            where = {"model": model} if model else None
            try:
                result = self._collection.query(query_texts=[query], n_results=fetch_n, where=where)
                ids = result.get("ids", [[]])[0]
                for rank, cid in enumerate(ids):
                    rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (RRF_K + rank)
            except Exception:
                pass

        ranked = sorted(rrf_scores.items(), key=lambda kv: kv[1], reverse=True)[:k]
        return [self.id_to_chunk[cid] for cid, _ in ranked]
