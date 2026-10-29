"""
TASK 1.5 - Evaluation Version 1
6-10 canned questions; print latency, steps, has_docid, pass/fail; save logs.

Run:  python steps/task_1_5_eval_v1.py    (or cell by cell in VS Code)
Code under test: eval.py (QUERIES, run_eval_v1, print_table)
"""
# %% 1.5(a) The canned question set
import _setup
from _setup import header
from eval import QUERIES

header("1.5(a) canned questions")
for q in QUERIES:
    print(f"{q['id']}  expect [{q['expect_doc']}]  {q['q']}")
# EXPECT: 8 questions incl. the 6 starter queries

# %% 1.5(b) Run eval v1 (agent only) and print the table
from eval import print_table, run_eval_v1

header("1.5(b) evaluation table")
rows = run_eval_v1()
rate = print_table(rows)
assert rate >= 0.8, "acceptance target is >= 80%"
# EXPECT: pass rate 8/8 (target >= 80% MET)

# %% 1.5(c) Inspect the saved logs
import json
from models import get_settings

header("1.5(c) saved logs")
log_dir = get_settings().log_dir
latest = sorted(log_dir.glob("eval_v1_*.jsonl"))[-1]
print("latest log:", latest)
first = json.loads(latest.read_text().splitlines()[0])
print("fields:", list(first.keys()))
print("trace of Q1:")
for t in first["trace"]:
    print(f"   step {t['step']}  {t['tool']}({t['args']})  ok={t['ok']}  {t['latency_ms']} ms")
