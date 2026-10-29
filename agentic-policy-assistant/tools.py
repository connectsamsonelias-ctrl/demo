"""
tools.py  -  Task 1.2 (Tools).

  * policy_search(query, k)  - FAISS retriever over data/policies.jsonl
  * read_policy(doc_id)      - full text; raises PolicyNotFoundError when missing
  * calculator(expression)   - safe arithmetic (AST-based, safe division)

The plain Python functions raise typed errors (the "tool contract").
The LangChain tool wrappers (TOOLS) catch those errors and return a soft JSON
error to the agent, so a bad doc_id never crashes the run - the agent reads the
error + hint and recovers by calling policy_search.

Embeddings: OpenAI text-embedding-3-small when OPENAI_API_KEY is set,
otherwise a deterministic local hashing embedder (no downloads, no network).

Run on its own:
    python tools.py
"""
from __future__ import annotations

import ast
import hashlib
import json
import math
import operator
import re
from functools import lru_cache
from typing import Dict, List

import numpy as np
from langchain_community.vectorstores import FAISS
from langchain_community.vectorstores.utils import DistanceStrategy
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.tools import tool

from models import (
    CalculatorError,
    PolicyNotFoundError,
    PolicyToolError,
    SearchHit,
    ToolResult,
    get_settings,
    load_policies,
)

# --------------------------------------------------------------------------- #
# Embeddings
# --------------------------------------------------------------------------- #
STOPWORDS = {
    "a", "an", "the", "is", "are", "of", "to", "for", "and", "or", "in", "on", "our",
    "what", "whats", "how", "many", "much", "any", "can", "be", "it", "we", "do", "does",
    "me", "tell", "then", "with", "by", "at", "as", "this", "that", "cite", "quote",
    "and", "policy", "rule", "there", "i", "you", "my", "per", "must", "may",
}


def _stem(tok: str) -> str:
    for suf, rep in (("ies", "y"), ("ied", "y"), ("ing", ""), ("ly", ""), ("ed", ""), ("es", ""), ("s", "")):
        if tok.endswith(suf) and len(tok) - len(suf) >= 3:
            stem = tok[: -len(suf)] + rep
            # "capped" -> "capp" -> "cap"
            if suf in ("ed", "ing") and len(stem) >= 3 and stem[-1] == stem[-2]:
                stem = stem[:-1]
            return stem
    return tok


def tokenize(text: str) -> List[str]:
    toks = re.findall(r"[a-z0-9]+", text.lower().replace("_", " "))
    return [_stem(t) for t in toks if t not in STOPWORDS]


class HashingEmbeddings(Embeddings):
    """Deterministic bag-of-words + bigram hashing embedder (L2-normalised)."""

    def __init__(self, dim: int = 4096):
        self.dim = dim

    def _bucket(self, feature: str) -> int:
        return int(hashlib.md5(feature.encode()).hexdigest(), 16) % self.dim

    def _embed(self, text: str) -> List[float]:
        vec = np.zeros(self.dim, dtype=np.float32)
        toks = tokenize(text)
        for t in toks:
            vec[self._bucket(t)] += 1.0
        for a, b in zip(toks, toks[1:]):
            vec[self._bucket(f"{a}_{b}")] += 0.5
        norm = float(np.linalg.norm(vec))
        return (vec / norm).tolist() if norm else vec.tolist()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    s = get_settings()
    if s.use_openai:
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(model=s.embedding_model)
    return HashingEmbeddings()


# --------------------------------------------------------------------------- #
# Corpus + FAISS index
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_corpus() -> Dict[str, dict]:
    return {p.doc_id: p.model_dump() for p in load_policies()}


@lru_cache(maxsize=1)
def get_index() -> FAISS:
    docs = [
        Document(
            # doc_id words are indexed too, so "remote work" matches remote_work_v3
            page_content=f"{p['doc_id'].replace('_', ' ')}. {p['text']}",
            metadata={"doc_id": p["doc_id"], "date": p["date"]},
        )
        for p in get_corpus().values()
    ]
    return FAISS.from_documents(
        docs,
        get_embeddings(),
        distance_strategy=DistanceStrategy.MAX_INNER_PRODUCT,  # normalised -> cosine
    )


def get_retriever(k: int = 3):
    """LangChain retriever view of the same FAISS index."""
    return get_index().as_retriever(search_kwargs={"k": k})


# --------------------------------------------------------------------------- #
# Plain tool functions (typed contract)
# --------------------------------------------------------------------------- #
def policy_search(query: str, k: int = 3) -> List[SearchHit]:
    if not query or not query.strip():
        raise PolicyToolError("query must be a non-empty string")
    k = max(1, min(int(k), 10))
    results = get_index().similarity_search_with_score(query, k=k)
    hits = [
        SearchHit(
            doc_id=d.metadata["doc_id"],
            date=d.metadata["date"],
            score=round(float(score), 4),
            snippet=get_corpus()[d.metadata["doc_id"]]["text"][:160],
        )
        for d, score in results
    ]
    return sorted(hits, key=lambda h: h.score, reverse=True)


def read_policy(doc_id: str) -> dict:
    doc_id = (doc_id or "").strip().strip("[]")
    corpus = get_corpus()
    if doc_id not in corpus:
        raise PolicyNotFoundError(
            f"No policy with doc_id '{doc_id}'",
            doc_id=doc_id,
            hint="Call policy_search with the topic to find the correct doc_id.",
        )
    return corpus[doc_id]


_BIN_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def calculator(expression: str) -> float:
    """Safely evaluate + - * / // % ** on numbers. No names, calls or attributes."""
    expr = (expression or "").replace("x", "*").replace("×", "*").replace(",", "")

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
            return _UNARY_OPS[type(node.op)](_eval(node.operand))
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
            left, right = _eval(node.left), _eval(node.right)
            if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)) and right == 0:
                raise CalculatorError("division by zero", expression=expression)
            if isinstance(node.op, ast.Pow) and abs(right) > 10:
                raise CalculatorError("exponent too large", expression=expression)
            return _BIN_OPS[type(node.op)](left, right)
        raise CalculatorError(f"unsupported expression element: {type(node).__name__}",
                              expression=expression)

    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as e:
        raise CalculatorError(f"invalid expression: {expression!r}", expression=expression) from e
    result = _eval(tree)
    if isinstance(result, float) and (math.isnan(result) or math.isinf(result)):
        raise CalculatorError("result is not finite", expression=expression)
    return int(result) if float(result).is_integer() else round(result, 6)


# --------------------------------------------------------------------------- #
# LangChain tool wrappers (soft failure -> JSON error the agent can read)
# --------------------------------------------------------------------------- #
def _wrap(tool_name: str, fn, *args) -> str:
    try:
        data = fn(*args)
        if isinstance(data, list):
            data = [d.model_dump() if hasattr(d, "model_dump") else d for d in data]
        return ToolResult(ok=True, tool=tool_name, data=data).model_dump_json()
    except PolicyToolError as e:
        return ToolResult(ok=False, tool=tool_name, error=e.to_dict()).model_dump_json()


@tool("policy_search")
def policy_search_tool(query: str, k: int = 3) -> str:
    """Search the internal policy corpus. Returns the top-k policies as
    {doc_id, date, score, snippet}. Use this first when you do not know the doc_id."""
    return _wrap("policy_search", policy_search, query, k)


@tool("read_policy")
def read_policy_tool(doc_id: str) -> str:
    """Read the full text of one policy by its exact doc_id (e.g. remote_work_v3).
    Returns an error with code POLICY_NOT_FOUND if the doc_id does not exist."""
    return _wrap("read_policy", read_policy, doc_id)


@tool("calculator")
def calculator_tool(expression: str) -> str:
    """Evaluate a basic arithmetic expression such as '12 * 4' or '1500 / 3'."""
    return _wrap("calculator", calculator, expression)


TOOLS = [policy_search_tool, read_policy_tool, calculator_tool]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}


if __name__ == "__main__":
    print("Embeddings:", type(get_embeddings()).__name__)
    print("\n1) policy_search('remote work limit', k=3)")
    for h in policy_search("remote work limit", k=3):
        print(f"   {h.doc_id:<20} score={h.score:.3f}  {h.snippet[:70]}...")

    print("\n2) read_policy('travel_expense_v4')")
    print("  ", read_policy("travel_expense_v4")["text"][:120], "...")

    print("\n3) read_policy('remote_work_v9.9')  -> typed error")
    try:
        read_policy("remote_work_v9.9")
    except PolicyNotFoundError as e:
        print(f"   raised {type(e).__name__}: {e} | {e.to_dict()}")

    print("\n4) same call through the LangChain tool (soft failure)")
    print("  ", read_policy_tool.invoke({"doc_id": "remote_work_v9.9"}))

    print("\n5) calculator('12 * 4') =", calculator("12 * 4"))
    try:
        calculator("10 / 0")
    except CalculatorError as e:
        print("   calculator('10 / 0') ->", e.to_dict())
    try:
        calculator("__import__('os').system('ls')")
    except CalculatorError as e:
        print("   injection attempt ->", e.to_dict()["message"])
