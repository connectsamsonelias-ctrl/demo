"""
TASK 2.4 - Tests + docs
PyTests for tools, acceptance, and budget stop; README; run scripts;
(optional) SQLite checkpointing; JSON run report.

Run:  python steps/task_2_4_tests_docs.py    (or cell by cell in VS Code)
"""
# %% 2.4(a) Run the pytest suite
import _setup
from _setup import ROOT, header
import subprocess
import sys

header("2.4(a) pytest")
r = subprocess.run([sys.executable, "-m", "pytest", "-v", "tests"], cwd=ROOT, capture_output=True, text=True)
print(r.stdout[-4000:])
# EXPECT: all tests pass (tools, agent acceptance, graph budget)

# %% 2.4(b) SQLite checkpointing (optional extension)
import tempfile
from pathlib import Path
from graph import build_graph, run_graph
from memory import SemanticMemory
from models import get_settings

header("2.4(b) SQLite checkpointing")
tmp = Path(tempfile.mkdtemp())
s = get_settings(memory_dir=tmp / "mem", log_dir=tmp / "logs")
app = build_graph(s, memory=SemanticMemory(s), use_sqlite=True)
run_graph(app, "Is MFA required for VPN? Cite and quote.", thread_id="demo-thread")
snap = app.get_state({"configurable": {"thread_id": "demo-thread"}})
print("db file      :", s.log_dir / "checkpoints.sqlite")
print("saved state  :", {k: snap.values[k] for k in ("stop_reason", "steps", "memory_written")})
print("history size :", len(list(app.get_state_history({"configurable": {"thread_id": "demo-thread"}}))), "checkpoints")

# %% 2.4(c) CLI: demo (cold, warm, recovery) with a JSON run report
header("2.4(c) python app.py demo --quiet --report results/demo_report.json")
r = subprocess.run([sys.executable, "app.py", "demo", "--quiet", "--report", "results/demo_report.json"],
                   cwd=ROOT, capture_output=True, text=True)
print(r.stdout[-3000:])
print("report exists:", (ROOT / "results" / "demo_report.json").exists())
