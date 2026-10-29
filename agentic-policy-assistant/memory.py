"""
memory.py  -  Task 2.1 (Memory).

FAISS-backed semantic memory of VERIFIED facts.

Write rule (write only verified facts):
  * the critic said valid, AND
  * the answer cites at least one [doc_id] that exists in the corpus, AND
  * it contains a quote that appears verbatim in that policy.
Anything else is rejected and the reason is returned.

Read rule ("cheapest sufficient first"):
  tier 0  exact question match (dict lookup, no embedding)       - cheapest
  tier 1  FAISS semantic match with similarity >= threshold      - cheap
          among the sufficient hits pick the SHORTEST answer (fewest tokens to pass on)
  tier 2  miss -> the agent must use tools                       - expensive
A hit becomes a short hint that is prepended to the question for the agent.

Storage: facts.jsonl is the source of truth (human-readable, no pickle);
the FAISS index is rebuilt from it on load.

Run on its own:
    python memory.py
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from langchain_community.vectorstores import FAISS
from langchain_community.vectorstores.utils import DistanceStrategy
from langchain_core.documents import Document

from models import DOC_ID_RE, QUOTE_RE, MemoryFact, Settings, get_settings
from prompts import MEMORY_HINT_TEMPLATE
from tools import get_corpus, get_embeddings


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip().lower()


def verify_fact(answer: str) -> Tuple[bool, List[str], str, str]:
    """Return (ok, doc_ids, first_verified_quote, reason)."""
    corpus = get_corpus()
    doc_ids = [d for d in dict.fromkeys(DOC_ID_RE.findall(answer)) if d in corpus]
    if not doc_ids:
        return False, [], "", "no valid [doc_id] in answer"
    cited_text = _norm(" ".join(corpus[d]["text"] for d in doc_ids))
    for q in QUOTE_RE.findall(answer):
        if _norm(q) in cited_text:
            return True, doc_ids, q, "verified"
    return False, doc_ids, "", "no verbatim quote from the cited policy"


class SemanticMemory:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.dir = Path(self.settings.memory_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "facts.jsonl"
        self.facts: List[MemoryFact] = []
        self.index: Optional[FAISS] = None
        self._load()

    # ---------------- persistence ---------------- #
    def _load(self) -> None:
        if self.path.exists():
            with open(self.path, encoding="utf-8") as f:
                self.facts = [MemoryFact(**json.loads(l)) for l in f if l.strip()]
        self._rebuild()

    def _rebuild(self) -> None:
        if not self.facts:
            self.index = None
            return
        docs = [Document(page_content=f.question, metadata={"i": i}) for i, f in enumerate(self.facts)]
        self.index = FAISS.from_documents(docs, get_embeddings(),
                                          distance_strategy=DistanceStrategy.MAX_INNER_PRODUCT)

    def reset(self) -> None:
        self.facts = []
        self.index = None
        if self.path.exists():
            self.path.unlink()

    def __len__(self) -> int:
        return len(self.facts)

    # ---------------- write ---------------- #
    def write(self, question: str, answer: str, critic_valid: bool) -> Tuple[bool, str]:
        if not critic_valid:
            return False, "rejected: critic marked the answer invalid"
        ok, doc_ids, quote, reason = verify_fact(answer)
        if not ok:
            return False, f"rejected: {reason}"
        if any(_norm(f.question) == _norm(question) for f in self.facts):
            return False, "skipped: already in memory"
        fact = MemoryFact(question=question, answer=answer, doc_ids=doc_ids, quote=quote,
                          created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        self.facts.append(fact)
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(fact.model_dump_json() + "\n")
        self._rebuild()
        return True, f"written: {doc_ids}"

    # ---------------- read ---------------- #
    def read(self, question: str, k: int = 3) -> Optional[dict]:
        """Cheapest sufficient entry first. Returns {fact, score, tier} or None."""
        for f in self.facts:                                   # tier 0: exact match
            if _norm(f.question) == _norm(question):
                return {"fact": f, "score": 1.0, "tier": "exact"}
        if self.index is None:
            return None
        hits = self.index.similarity_search_with_score(question, k=min(k, len(self.facts)))
        sufficient = [(self.facts[d.metadata["i"]], float(s)) for d, s in hits
                      if float(s) >= self.settings.memory_threshold]
        if not sufficient:
            return None
        fact, score = min(sufficient, key=lambda x: len(x[0].answer))   # cheapest of the sufficient
        return {"fact": fact, "score": round(score, 4), "tier": "semantic"}

    @staticmethod
    def to_hint(hit: dict) -> str:
        f: MemoryFact = hit["fact"]
        first_line = f.answer.splitlines()[0].replace("Answer: ", "")
        return MEMORY_HINT_TEMPLATE.format(score=hit["score"], answer=first_line[:300],
                                           doc_ids=", ".join(f"[{d}]" for d in f.doc_ids))


if __name__ == "__main__":
    import tempfile
    s = get_settings(memory_dir=Path(tempfile.mkdtemp()))   # demo uses a throwaway folder
    mem = SemanticMemory(s)
    q = "What is our remote work limit? Cite and quote."
    good = ('Answer: Employees may work remotely up to 3 days per week with prior manager approval. '
            '[remote_work_v3]\nQuote: "Employees may work remotely up to 3 days per week with prior '
            'manager approval." [remote_work_v3]')
    print("1) write unverified (no doc_id):", mem.write(q, "Answer: 3 days a week.", critic_valid=True))
    print("2) write when critic invalid   :", mem.write(q, good, critic_valid=False))
    print("3) write verified fact         :", mem.write(q, good, critic_valid=True))
    print("   memory size =", len(mem))
    print("4) read same question          :", mem.read(q)["tier"])
    hit = mem.read("what is the remote work limit? cite and quote")
    print("5) read paraphrase             :", hit and (hit["tier"], hit["score"]))
    print("6) read unrelated question     :", mem.read("Is MFA required for VPN?"))
    print("\nHint passed into the agent question:\n" + SemanticMemory.to_hint(mem.read(q)))
