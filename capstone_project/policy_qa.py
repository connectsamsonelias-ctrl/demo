"""Phase 4 - policy question answering grounded in retrieved policy evidence, with citations."""
import json
import re

import config
import llm
import vector_store

SYSTEM_PROMPT = """You answer customer questions about store policies.
Use ONLY the EVIDENCE below. Do not use outside knowledge or assume anything not written.
- If the evidence does not clearly answer the question, use decision "not_covered" and say you
  cannot confirm it from the policy documents, suggesting the customer contact support.
- Be conservative: if an answer depends on a condition (e.g. discount level, unused item),
  state the condition and use decision "conditional".
- Quote the exact evidence sentence(s) you relied on, word for word.
Return a JSON object with keys:
  "answer": str (max 3 sentences), "decision": "yes" | "no" | "conditional" | "not_covered",
  "citations": [policy doc_id, ...], "quotes": [exact sentence, ...]"""

NOT_COVERED = ("I could not find this in our policy documents, so I cannot confirm it. "
               "Please contact customer support for help with this question.")


def retrieve(question: str, k: int = 4, max_docs: int = 2) -> dict:
    store = vector_store.get_stores()["policy"]
    hits = store.search(question, k=k)
    threshold = config.MIN_SCORE[config.backend_name()]["policy"]
    strong = [(d, s) for d, s in hits if s >= threshold]
    doc_ids = []
    for d, _ in strong:
        if d["doc_id"] not in doc_ids:
            doc_ids.append(d["doc_id"])
    doc_ids = doc_ids[:max_docs]
    # expand to every sentence of the selected policies so conditions are not cut off
    evidence = [{"doc_id": d["doc_id"], "chunk_id": d["chunk_id"], "sentence": d["sentence"]}
                for d in store.docs if d["doc_id"] in doc_ids]
    evidence.sort(key=lambda e: (doc_ids.index(e["doc_id"]), e["chunk_id"]))
    return {"question": question, "threshold": threshold,
            "hits": [{"chunk_id": d["chunk_id"], "doc_id": d["doc_id"], "score": round(s, 4),
                      "sentence": d["sentence"]} for d, s in hits],
            "doc_ids": doc_ids, "evidence": evidence,
            "status": "ok" if doc_ids else "not_covered"}


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s%]", " ", t.lower())).strip()


def validate(out: dict, ret: dict) -> tuple:
    """Keep only citations/quotes that exist in the retrieved evidence."""
    allowed = set(ret["doc_ids"])
    issues = []
    cites = [c for c in (out.get("citations") or []) if c in allowed]
    issues += [f"removed citation {c}" for c in (out.get("citations") or []) if c not in allowed]
    ev_sentences = {e["sentence"]: e["doc_id"] for e in ret["evidence"]}
    quotes = []
    for q in out.get("quotes") or []:
        match = next((s for s in ev_sentences if _norm(q) and _norm(q) in _norm(s)), None)
        if match:
            quotes.append(match)
            if ev_sentences[match] not in cites:
                cites.append(ev_sentences[match])
        else:
            issues.append("removed unsupported quote")
    decision = str(out.get("decision", "")).lower()
    if decision not in {"yes", "no", "conditional", "not_covered"}:
        decision = "conditional"
    if decision != "not_covered" and not cites:
        issues.append("no valid citation -> refused")
        return {"answer": NOT_COVERED, "decision": "not_covered", "citations": [], "quotes": []}, issues
    if decision != "not_covered" and not quotes:
        quotes = [e["sentence"] for e in ret["evidence"] if e["doc_id"] == cites[0]][:1]
    return {"answer": str(out.get("answer", "")).strip(), "decision": decision,
            "citations": cites, "quotes": quotes}, issues


def _fallback(ret: dict):
    """Deterministic extractive answer: quote the best-matching policy sentences."""
    def f():
        best = [h for h in ret["hits"] if h["doc_id"] in ret["doc_ids"]][:2]
        quotes = list(dict.fromkeys(h["sentence"] for h in best))
        main = ret["doc_ids"][0]
        extra = [e["sentence"] for e in ret["evidence"] if e["doc_id"] == main and e["sentence"] not in quotes]
        quotes += extra[:1]
        cites = list(dict.fromkeys(e["doc_id"] for e in ret["evidence"] if e["sentence"] in quotes))
        text = " ".join(f"[{ev}] {q}" for q in quotes
                        for ev in [next(e["doc_id"] for e in ret["evidence"] if e["sentence"] == q)])
        return {"answer": f"According to our policy: {text}", "decision": "conditional",
                "citations": cites, "quotes": quotes}
    return f


def answer(question: str) -> dict:
    ret = retrieve(question)
    if ret["status"] == "not_covered":
        return {**ret, "answer": NOT_COVERED, "decision": "not_covered", "citations": [],
                "quotes": [], "issues": [], "llm": {"skipped": True}}
    ev = "\n".join(f"[{e['doc_id']}] {e['sentence']}" for e in ret["evidence"])
    out, meta = llm.chat_json(SYSTEM_PROMPT, f"QUESTION: {question}\nEVIDENCE:\n{ev}", _fallback(ret))
    clean, issues = validate(out, ret)
    return {**ret, **clean, "issues": issues, "llm": meta}


def format_answer(res: dict) -> str:
    lines = [res["answer"]]
    for q in res.get("quotes", []):
        doc = next((e["doc_id"] for e in res["evidence"] if e["sentence"] == q), "?")
        lines.append(f'  > "{q}" [{doc}]')
    lines.append(f"Sources: {', '.join(res['citations']) or 'none'} | decision: {res['decision']}")
    return "\n".join(lines)
