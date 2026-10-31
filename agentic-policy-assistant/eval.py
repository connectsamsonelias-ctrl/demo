"""
eval.py  -  Task 1.5 (Evaluation v1, agent only) and the v2 eval used in Part 2 (full graph).

Prints a table with latency, steps, has_docid, has_quote, memory hit, critic and pass/fail,
saves per-query JSONL logs to logs/ and a CSV + JSON report to results/.

Acceptance (pass) for one query:
  * has_docid          - answer contains a [doc_id] token
  * expected doc cited - the right policy is cited
  * has_quote          - a verbatim quote from the cited policy
  * keywords           - the key facts (e.g. "3 days") are in the answer
  * within budget      - agent finished before max_iterations (and graph before max_steps)
Target: >= 80% of queries pass.

Run on its own:
    python eval.py              # v1: agent only
    python eval.py --version 2  # v2: full graph (cold run: memory reset first)
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from agent import build_agent
from models import DOC_ID_RE, QUOTE_RE, Settings, get_settings
from tools import get_corpus

# graph.py and memory.py (Part 2) are imported inside run_eval_v2, so this file
# already works in Part 1 before those files exist.

QUERIES = [
    {"id": "Q1", "q": "What is our remote work limit? Cite and quote.",
     "expect_doc": "remote_work_v3", "keywords": ["3 days"]},
    {"id": "Q2", "q": "How many annual leave days and can they be carried over? Cite and quote.",
     "expect_doc": "annual_leave_v2", "keywords": ["24 days", "8"]},
    {"id": "Q3", "q": "What's the travel meals cap (INR) and any receipt rule? Cite and quote.",
     "expect_doc": "travel_expense_v4", "keywords": ["1,500", "receipt"]},
    {"id": "Q4", "q": "Is MFA required for VPN? Cite and quote.",
     "expect_doc": "it_security_v5", "keywords": ["VPN"]},
    {"id": "Q5", "q": "Read policy remote_work_v9.9 and answer the limit.",
     "expect_doc": "remote_work_v3", "keywords": ["3 days"], "kind": "recovery"},
    {"id": "Q6", "q": "Compute 12 * 4 and then tell me meals cap with citation.",
     "expect_doc": "travel_expense_v4", "keywords": ["48", "1,500"], "kind": "multi-tool"},
    {"id": "Q7", "q": "What is the overtime rate on public holidays? Cite and quote.",
     "expect_doc": "overtime_v1", "keywords": ["2 times"]},
    {"id": "Q8", "q": "Does unused learning budget carry over? Cite and quote.",
     "expect_doc": "learning_budget_v2", "keywords": ["does not carry over"]},
]


def setup_logging(settings: Settings, tag: str) -> Path:
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    path = settings.log_dir / f"{tag}_{datetime.now():%Y%m%d_%H%M%S}.log"
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
    root = logging.getLogger("policy_assistant")
    root.setLevel(logging.INFO)
    root.handlers = [handler]
    return path


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def score_row(item: dict, answer: str, iterations: int, max_iter: int, stop_ok: bool = True) -> dict:
    cited = DOC_ID_RE.findall(answer)
    corpus = get_corpus()
    cited_text = _norm(" ".join(corpus[d]["text"] for d in set(cited) if d in corpus))
    quotes = QUOTE_RE.findall(answer)
    # every quote must appear verbatim in a cited policy
    has_quote = bool(quotes) and all(_norm(q) in cited_text for q in quotes)
    kw_ok = all(k.lower() in answer.lower() for k in item["keywords"])
    within = iterations <= max_iter and stop_ok
    passed = bool(cited) and item["expect_doc"] in cited and has_quote and kw_ok and within
    return {"has_docid": bool(cited), "cited": ",".join(dict.fromkeys(cited)),
            "has_quote": has_quote, "keywords_ok": kw_ok, "within_budget": within, "pass": passed}


def run_eval_v1(settings: Optional[Settings] = None, verbose: bool = False) -> List[dict]:
    """Agent only (Part 1)."""
    s = settings or get_settings()
    log_path = setup_logging(s, "eval_v1")
    agent = build_agent(s, verbose=verbose)
    rows = []
    for item in QUERIES:
        res = agent.invoke(item["q"])
        row = {"id": item["id"], "question": item["q"], "latency_ms": res.latency_ms,
               "steps": res.iterations, "tool_calls": len(res.tool_calls),
               **score_row(item, res.answer, res.iterations, s.max_iterations,
                           res.stopped_reason == "final_answer"),
               "answer": res.answer, "trace": [t.model_dump() for t in res.tool_calls]}
        rows.append(row)
    _save(rows, s, "eval_v1", log_path)
    return rows


def run_eval_v2(settings: Optional[Settings] = None, reset_memory: bool = True,
                verbose: bool = False, use_sqlite: bool = False, tag: str = "eval_v2") -> List[dict]:
    """Full graph (Part 2). reset_memory=True -> cold run; False -> warm run."""
    from graph import build_graph, run_graph
    from memory import SemanticMemory
    s = settings or get_settings()
    log_path = setup_logging(s, tag)
    mem = SemanticMemory(s)
    if reset_memory:
        mem.reset()
    app = build_graph(s, memory=mem, verbose=verbose, use_sqlite=use_sqlite)
    rows = []
    for item in QUERIES:
        st = run_graph(app, item["q"])
        within_graph = st.get("stop_reason") == "completed" and st.get("steps", 0) <= st.get("max_steps", s.max_steps)
        row = {"id": item["id"], "question": item["q"], "latency_ms": st["latency_ms"],
               "steps": st.get("steps"), "agent_iters": st.get("agent_iterations"),
               "tool_calls": len(st.get("tool_calls", [])),
               "memory_hit": st.get("memory_hit", False), "retries": st.get("retries", 0),
               "critic_valid": st.get("critic", {}).get("valid", False),
               "mem_write": st.get("memory_written", False),
               **score_row(item, st.get("answer", ""), st.get("agent_iterations") or 0,
                           s.max_iterations, within_graph),
               "stop_reason": st.get("stop_reason"), "answer": st.get("answer", ""),
               "trace": st.get("trace", []), "tool_trace": st.get("tool_calls", [])}
        row["pass"] = row["pass"] and row["critic_valid"]
        rows.append(row)
    _save(rows, s, tag, log_path)
    return rows


def _save(rows: List[dict], s: Settings, tag: str, log_path: Path) -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    jsonl = s.log_dir / f"{tag}_{ts}.jsonl"
    with open(jsonl, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, default=str) + "\n")
    s.results_dir.mkdir(parents=True, exist_ok=True)
    cols = [k for k in rows[0] if k not in ("answer", "trace", "tool_trace")]
    with open(s.results_dir / f"{tag}_{ts}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"\nlogs   : {log_path}\n         {jsonl}\nresults: {s.results_dir / f'{tag}_{ts}.csv'}")


def print_table(rows: List[dict]) -> float:
    cols = [c for c in ["id", "latency_ms", "steps", "agent_iters", "tool_calls", "memory_hit",
                        "retries", "has_docid", "has_quote", "critic_valid", "mem_write",
                        "cited", "pass"] if c in rows[0]]
    widths = {c: max(len(c), *(len(str(r[c])) for r in rows)) for c in cols}
    line = " | ".join(c.ljust(widths[c]) for c in cols)
    print(line + "\n" + "-" * len(line))
    for r in rows:
        print(" | ".join(str(r[c]).ljust(widths[c]) for c in cols))
    rate = sum(r["pass"] for r in rows) / len(rows)
    avg = sum(r["latency_ms"] for r in rows) / len(rows)
    print("-" * len(line))
    print(f"pass rate: {sum(r['pass'] for r in rows)}/{len(rows)} = {rate:.0%} "
          f"(target >= 80%: {'MET' if rate >= 0.8 else 'NOT MET'})  avg latency: {avg:.1f} ms")
    return rate


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", type=int, choices=[1, 2], default=1)
    ap.add_argument("--warm", action="store_true", help="v2: keep memory from the previous run")
    args = ap.parse_args()
    t0 = time.perf_counter()
    if args.version == 1:
        rows = run_eval_v1()
    else:
        rows = run_eval_v2(reset_memory=not args.warm, tag="eval_v2_warm" if args.warm else "eval_v2_cold")
    print_table(rows)
