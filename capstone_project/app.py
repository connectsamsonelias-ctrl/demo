"""Command-line entry point.

  python app.py ask "Recommend casual sneakers under Rs 4000"   [--report run.json]
  python app.py demo                                             [--report demo.json]
  python app.py eval [--retrieval-n 150] [--update-baseline]     [--report eval.json]
"""
import argparse
import json
import sys

import config

DEMO_QUERIES = [
    "Recommend casual sneakers under ₹4000 for daily wear.",
    "Can I return a discounted product after 7 days?",
    "Suggest products for a premium customer who prefers black formal shoes.",
    "Which customer segment seems most price-sensitive?",
    "Summarise the top three retrieved products and explain why they fit the query.",
    "Recommend a black watch under 5000 and tell me the warranty",
    "Do you offer gift wrapping?",
]


def _write_report(path: str, payload: dict) -> None:
    import llm
    with open(path, "w", encoding="utf-8") as f:
        f.write(llm.redact(json.dumps(payload, indent=2, ensure_ascii=False, default=str)))
    print(f"report written: {path}")


def _strip(out: dict) -> dict:
    return {k: out[k] for k in ("query", "route", "answer", "citations", "trace", "backend", "latency_s")}


def cmd_ask(args) -> int:
    import agent
    out = agent.Assistant(verbose=True).ask(args.query)
    if args.report:
        _write_report(args.report, _strip(out))
    return 0


def cmd_demo(args) -> int:
    import agent
    bot = agent.Assistant(verbose=True)
    runs = [_strip(bot.ask(q)) for q in DEMO_QUERIES]
    with open(config.RESULTS_DIR / "demo_runs.json", "w", encoding="utf-8") as f:
        json.dump(runs, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nsaved {len(runs)} demo runs -> results/demo_runs.json")
    if args.report:
        _write_report(args.report, {"backend": config.backend_name(), "runs": runs})
    return 0


def cmd_eval(args) -> int:
    import eval as evaluation
    res = evaluation.run(retrieval_n=args.retrieval_n, update_baseline=args.update_baseline)
    t = res["table"]
    print(t[["id", "expected_route", "actual_route", "checks_passed", "checks_total", "passed",
             "failed_checks"]].to_string(index=False))
    print("\nRetrieval:\n" + res["retrieval"].to_string(index=False))
    print("\nRegression checks:\n" + res["regression"][["metric", "current", "threshold", "baseline",
                                                         "passed"]].to_string(index=False))
    print("\nSummary:", json.dumps(res["metrics"], default=str, indent=1))
    if args.report:
        _write_report(args.report, {"timestamp": res["timestamp"], "metrics": res["metrics"],
                                    "results": t.drop(columns=["answer"]).to_dict("records")})
    return 0 if res["metrics"]["regression_passed"] else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Intelligent Retail Decision Assistant")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("ask", help="ask one question")
    a.add_argument("query")
    a.add_argument("--report")
    d = sub.add_parser("demo", help="run the demo queries with traces")
    d.add_argument("--report")
    e = sub.add_parser("eval", help="run the evaluation suite")
    e.add_argument("--retrieval-n", type=int, default=150)
    e.add_argument("--update-baseline", action="store_true")
    e.add_argument("--report")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    print(f"[backend: {config.backend_name()} | chat: {config.CHAT_MODEL} | embed: {config.EMBED_MODEL}]")
    return {"ask": cmd_ask, "demo": cmd_demo, "eval": cmd_eval}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
