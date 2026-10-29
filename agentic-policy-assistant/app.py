"""
app.py  -  CLI entry point.

    python app.py ask "Is MFA required for VPN? Cite and quote."     # one query through the graph
    python app.py ask "..." --agent-only                              # agent without graph/memory
    python app.py eval --version 1                                    # Task 1.5 table
    python app.py eval --version 2                                    # graph eval, cold (memory reset)
    python app.py eval --version 2 --warm                             # graph eval, warm (memory kept)
    python app.py demo                                                # cold run, warm run, error recovery
    python app.py reset-memory

Extra flags:  --sqlite (SQLite checkpointing)   --report out.json (JSON run report)   --quiet
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from agent import build_agent
from eval import print_table, run_eval_v1, run_eval_v2, setup_logging
from graph import build_graph, print_run, run_graph
from memory import SemanticMemory
from models import get_settings


def _report(path: str | None, payload) -> None:
    if path:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        print(f"\nJSON report written to {path}")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="Policy Assistant Agent")
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("ask")
    a.add_argument("question")
    a.add_argument("--agent-only", action="store_true")

    e = sub.add_parser("eval")
    e.add_argument("--version", type=int, choices=[1, 2], default=2)
    e.add_argument("--warm", action="store_true")

    sub.add_parser("demo")
    sub.add_parser("reset-memory")

    for p in (a, e, sub.choices["demo"]):
        p.add_argument("--sqlite", action="store_true", help="SQLite checkpointing (logs/checkpoints.sqlite)")
        p.add_argument("--report", help="write a JSON run report to this path")
        p.add_argument("--quiet", action="store_true", help="hide the agent's step-by-step trace")

    args = ap.parse_args(argv)
    s = get_settings()
    print(f"[backend: {'OpenAI ' + s.model_name if s.use_openai else 'offline deterministic model'}]")

    if args.cmd == "reset-memory":
        SemanticMemory(s).reset()
        print("memory cleared")
        return

    if args.cmd == "ask":
        setup_logging(s, "ask")
        if args.agent_only:
            res = build_agent(s, verbose=not args.quiet).invoke(args.question)
            _report(args.report, res.model_dump())
            return
        app = build_graph(s, verbose=not args.quiet, use_sqlite=args.sqlite)
        state = run_graph(app, args.question)
        print("\n" + "=" * 70)
        print_run(state)
        _report(args.report, dict(state))
        return

    if args.cmd == "eval":
        if args.version == 1:
            rows = run_eval_v1(s)
        else:
            rows = run_eval_v2(s, reset_memory=not args.warm, use_sqlite=args.sqlite,
                               tag="eval_v2_warm" if args.warm else "eval_v2_cold")
        rate = print_table(rows)
        _report(args.report, {"pass_rate": rate, "rows": rows})
        return

    if args.cmd == "demo":
        setup_logging(s, "demo")
        mem = SemanticMemory(s)
        mem.reset()
        app = build_graph(s, memory=mem, verbose=not args.quiet, use_sqlite=args.sqlite)
        runs = {}
        for title, q in [("1) COLD RUN (memory empty)", "What is our remote work limit? Cite and quote."),
                         ("2) WARM RUN (same question, memory hit)", "What is our remote work limit? Cite and quote."),
                         ("3) ERROR-RECOVERY (bad doc_id)", "Read policy remote_work_v9.9 and answer the limit.")]:
            print("\n" + "#" * 70 + f"\n# {title}\n" + "#" * 70)
            state = run_graph(app, q)
            print("\n--- summary ---")
            print_run(state)
            runs[title] = dict(state)
        _report(args.report, runs)


if __name__ == "__main__":
    main()
