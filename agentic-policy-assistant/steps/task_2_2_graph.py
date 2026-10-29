"""
TASK 2.2 - Graph orchestration
Nodes: plan -> memory_read -> agent_answer -> critic -> memory_write -> stop
Router with a budget (max_steps) and a single retry if the critic fails.

Run:  python steps/task_2_2_graph.py    (or cell by cell in VS Code)
Code under test: graph.py
"""
# %% 2.2(a) Build and show the graph
import _setup
from _setup import header
import tempfile
from pathlib import Path
from graph import build_graph, print_run, run_graph
from memory import SemanticMemory
from models import get_settings

header("2.2(a) compiled graph (Mermaid - paste into https://mermaid.live)")
s = get_settings(memory_dir=Path(tempfile.mkdtemp()))
mem = SemanticMemory(s)
app = build_graph(s, memory=mem)
print(app.get_graph().draw_mermaid())

# %% 2.2(b) Cold run
header("2.2(b) COLD run - memory empty")
Q = "What is our remote work limit? Cite and quote."
print_run(run_graph(app, Q))
# EXPECT: memory_hit=False, tool_calls=2, memory_written=True, stop_reason=completed

# %% 2.2(c) Warm run
header("2.2(c) WARM run - memory hit")
print_run(run_graph(app, Q))
# EXPECT: memory_hit=True, tool_calls=1, memory_written=False (already stored)

# %% 2.2(d) Budget stop
header("2.2(d) budget stop with max_steps=3")
print_run(run_graph(app, "Is MFA required for VPN?", max_steps=3))
# EXPECT: steps=3/3, stop_reason=budget_exhausted, critic never ran

# %% 2.2(e) Critic fails -> exactly one retry
from models import AgentResult, ToolCallTrace

class ScriptedAgent:
    """First answer has no citation (critic fails), second is correct."""
    def __init__(self, answers):
        self.answers, self.calls = answers, 0
    def invoke(self, q):
        self.calls += 1
        read = ToolCallTrace(step=1, tool="read_policy", args={"doc_id": "it_security_v5"},
                             ok=True, output_preview="", latency_ms=0)
        return AgentResult(answer=self.answers[min(self.calls, len(self.answers)) - 1],
                           iterations=2, tool_calls=[read])

GOOD = ('Answer: MFA is required for VPN. [it_security_v5]\nQuote: "Multi-factor authentication (MFA) '
        'is required for all VPN connections" [it_security_v5]')
header("2.2(e-1) retry then success")
st = run_graph(build_graph(s, memory=SemanticMemory(get_settings(memory_dir=Path(tempfile.mkdtemp()))),
                           agent=ScriptedAgent(["Answer: yes.", GOOD])), "Is MFA required for VPN?")
print_run(st)
header("2.2(e-2) retry then stop (still invalid)")
st = run_graph(build_graph(s, memory=SemanticMemory(get_settings(memory_dir=Path(tempfile.mkdtemp()))),
                           agent=ScriptedAgent(["Answer: yes.", "Answer: still yes."])), "Is MFA required for VPN?")
print_run(st)
# EXPECT: (e-1) retries=1, critic valid ; (e-2) retries=1, stop_reason=critic_failed, nothing written

# %% 2.2(f) Evaluation v2 over the full graph: cold then warm
from eval import print_table, run_eval_v2

header("2.2(f) eval v2 - COLD")
print_table(run_eval_v2(reset_memory=True, tag="eval_v2_cold"))
header("2.2(f) eval v2 - WARM")
print_table(run_eval_v2(reset_memory=False, tag="eval_v2_warm"))
# EXPECT: both 8/8; warm rows show memory_hit=True and fewer tool_calls
