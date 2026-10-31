"""Phase 4 - text embeddings.

openai  : text-embedding-3-small through the OpenAI-compatible (Vocareum) endpoint,
          cached on disk so re-running the notebook does not re-bill.
offline : TF-IDF (word 1-2 grams) fitted on the corpus - deterministic stand-in for tests
          and for running without a key.
"""
import hashlib
import os
import time

import numpy as np

import config


def _normalize(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype="float32")
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


def get_client():
    from openai import OpenAI
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url=config.base_url(),
                  timeout=60, max_retries=2)


class OpenAIEmbedder:
    backend = "openai"

    def __init__(self, model: str = None, client=None, cache_name: str = None):
        self.model = model or config.EMBED_MODEL
        self.client = client
        self.cache_name = cache_name
        self._query_cache = {}

    def _client(self):
        if self.client is None:
            self.client = get_client()
        return self.client

    def _embed(self, texts: list) -> np.ndarray:
        out = []
        for i in range(0, len(texts), 256):
            batch = texts[i:i + 256]
            for attempt in range(3):
                try:
                    resp = self._client().embeddings.create(model=self.model, input=batch)
                    out.extend(d.embedding for d in resp.data)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
        return _normalize(np.array(out))

    def fit_transform(self, texts: list) -> np.ndarray:
        key = hashlib.md5(("\n".join(texts) + self.model).encode("utf-8")).hexdigest()[:12]
        path = config.PROCESSED_DIR / f"emb_{self.cache_name or 'corpus'}_{key}.npy"
        if path.exists():
            return np.load(path)
        vecs = self._embed(texts)
        np.save(path, vecs)
        return vecs

    def transform(self, texts: list) -> np.ndarray:
        missing = [t for t in texts if t not in self._query_cache]
        if missing:
            for t, v in zip(missing, self._embed(missing)):
                self._query_cache[t] = v
        return np.stack([self._query_cache[t] for t in texts])


class OfflineEmbedder:
    backend = "offline"
    model = "tfidf-1-2gram"

    def __init__(self, **_):
        from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
        # generic words that appear in every policy/product text carry no signal
        stop = sorted(ENGLISH_STOP_WORDS | {"policy", "policies", "store", "need", "want",
                                            "recommend", "suggest", "please"})
        self.vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, lowercase=True,
                                   stop_words=stop, token_pattern=r"(?u)\b[\w-]+\b")

    def fit_transform(self, texts: list) -> np.ndarray:
        return _normalize(self.vec.fit_transform(texts).toarray())

    def transform(self, texts: list) -> np.ndarray:
        return _normalize(self.vec.transform(texts).toarray())


def make_embedder(cache_name: str = None):
    if config.use_offline():
        return OfflineEmbedder()
    return OpenAIEmbedder(cache_name=cache_name)
