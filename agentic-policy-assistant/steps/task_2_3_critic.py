"""
TASK 2.3 - Critic
Minimal JSON output {valid: bool, issues: []}; checks doc_id presence and simple claims.

Run:  python steps/task_2_3_critic.py    (or cell by cell in VS Code)
Code under test: critic.py
"""
# %% 2.3(a) A correct answer
import _setup
from _setup import header
import json
from critic import critique

Q = "What is our remote work limit?"
header("2.3(a) valid answer")
good = ('Answer: Employees may work remotely up to 3 days per week with prior manager approval. [remote_work_v3]\n'
        'Quote: "Employees may work remotely up to 3 days per week with prior manager approval." [remote_work_v3]')
print(json.dumps(critique(Q, good)))
# EXPECT: {"valid": true, "issues": []}

# %% 2.3(b) Each check failing on purpose
header("2.3(b) failure cases")
cases = {
    "C1 no doc_id": "Answer: You can work remotely 3 days a week.",
    "C2 unknown doc_id": 'Answer: 3 days [remote_work_v7]\nQuote: "Employees may work remotely" [remote_work_v7]',
    "C3 fake quote": 'Answer: 3 days [remote_work_v3]\nQuote: "Staff can work from anywhere" [remote_work_v3]',
    "C4 wrong number": ('Answer: up to 4 days per week [remote_work_v3]\n'
                        'Quote: "Employees may work remotely up to 3 days per week" [remote_work_v3]'),
}
for name, ans in cases.items():
    print(f"{name:<18} -> {json.dumps(critique(Q, ans))}")

# %% 2.3(c) Critic on a live agent answer (with its tool trace)
from agent import build_agent

header("2.3(c) critic on the agent's answer for the multi-tool query")
res = build_agent(verbose=False).invoke("Compute 12 * 4 and then tell me meals cap with citation.")
print(res.answer)
print(json.dumps(critique("Compute 12 * 4 and then tell me meals cap with citation.", res.answer,
                          [t.model_dump() for t in res.tool_calls])))
# EXPECT: valid - 48 is allowed because it came from the calculator tool

# %% 2.3(d) Cited doc must have been read in this run
header("2.3(d) citation without reading the policy")
trace = [{"tool": "policy_search", "args": {"query": "remote"}, "ok": True}]
print(json.dumps(critique(Q, good, trace)))
# EXPECT: invalid - "[remote_work_v3] was never read with read_policy in this run"
