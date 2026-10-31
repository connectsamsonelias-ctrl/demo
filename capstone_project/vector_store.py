"""Phase 4 - FAISS vector index (inner product on L2-normalised vectors = cosine)."""
import numpy as np

import embeddings

try:
    import faiss
    HAS_FAISS = True
except ImportError:          # numpy fallback keeps the project runnable without faiss
    faiss = None
    HAS_FAISS = False


class VectorStore:
    def __init__(self, docs: list, name: str, embedder=None):
        self.docs = docs
        self.name = name
        self.embedder = embedder or embeddings.make_embedder(cache_name=name)
        self.vectors = self.embedder.fit_transform([d["text"] for d in docs])
        self.dim = self.vectors.shape[1]
        if HAS_FAISS:
            self.index = faiss.IndexFlatIP(self.dim)
            self.index.add(self.vectors)
        else:
            self.index = None

    @property
    def engine(self) -> str:
        return "faiss.IndexFlatIP" if HAS_FAISS else "numpy-dot (faiss not installed)"

    def search(self, query: str, k: int = 5, candidate_ids=None) -> list:
        """Return [(doc, score)] best first. candidate_ids restricts results (metadata filter)."""
        q = self.embedder.transform([query])
        n = len(self.docs) if candidate_ids is not None else min(k, len(self.docs))
        if HAS_FAISS:
            scores, idx = self.index.search(q, n)
            pairs = zip(idx[0], scores[0])
        else:
            s = self.vectors @ q[0]
            order = np.argsort(-s)[:n]
            pairs = zip(order, s[order])
        out = []
        for i, s in pairs:
            if i < 0:
                continue
            doc = self.docs[int(i)]
            if candidate_ids is not None and doc["doc_id"] not in candidate_ids \
                    and doc.get("chunk_id") not in candidate_ids:
                continue
            out.append((doc, float(s)))
            if len(out) >= k:
                break
        return out

    def info(self) -> dict:
        return {"name": self.name, "n_docs": len(self.docs), "dim": int(self.dim),
                "engine": self.engine, "embedder": f"{self.embedder.backend}:{self.embedder.model}"}


_STORES = {}


def get_stores(rebuild: bool = False) -> dict:
    """Build (once per process/backend) the product and policy indexes."""
    import config
    import documents
    import os
    import llm
    key = config.backend_name()
    if rebuild or key not in _STORES:
        products, policies = documents.load_all()
        try:
            stores = {"product": VectorStore(products, "products"),
                      "policy": VectorStore(policies, "policies")}
            stores["product"].embedder.transform(["connectivity check"])   # catches a bad key even if vectors are cached
            _STORES[key] = stores
        except Exception as e:
            if key == "offline":
                raise
            # API unreachable / wrong key: say so loudly, then continue fully offline
            print("WARNING: embedding API failed ->", llm.redact(f"{type(e).__name__}: {str(e)[:200]}"))
            print("WARNING: switching to the OFFLINE backend (outputs will be labelled 'offline').")
            os.environ["RETAIL_OFFLINE"] = "1"
            return get_stores(rebuild=True)
    return _STORES[key]
