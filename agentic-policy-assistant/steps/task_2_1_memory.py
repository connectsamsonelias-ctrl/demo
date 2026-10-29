"""
TASK 2.1 - Memory
FAISS store for verified facts; write only when doc_id is present (and verified).
Read the "cheapest sufficient" entry first; pass hints into the question.

Run:  python steps/task_2_1_memory.py    (or cell by cell in VS Code)
Code under test: memory.py
"""
# %% 2.1(a) Fresh memory in a temporary folder (does not touch .memory/)
import _setup
from _setup import header
import tempfile
from pathlib import Path
from memory import SemanticMemory
from models import get_settings

header("2.1(a) empty memory")
s = get_settings(memory_dir=Path(tempfile.mkdtemp()))
mem = SemanticMemory(s)
print("memory dir:", s.memory_dir, "| facts:", len(mem), "| threshold:", s.memory_threshold)

# %% 2.1(b) Write rules: unverified facts are rejected
header("2.1(b) rejected writes")
Q = "What is our remote work limit? Cite and quote."
print("no doc_id        :", mem.write(Q, "Answer: 3 days a week.", critic_valid=True))
print("fake quote       :", mem.write(Q, 'Answer: 5 days [remote_work_v3]\nQuote: "5 days a week"', True))
print("unknown doc_id   :", mem.write(Q, 'Answer: [remote_work_v9]\nQuote: "Employees may work remotely"', True))
print("critic invalid   :", mem.write(Q, 'Answer: [remote_work_v3]\nQuote: "Employees may work remotely"', False))
print("facts stored     :", len(mem))
# EXPECT: four rejections, 0 facts

# %% 2.1(c) Verified writes
header("2.1(c) verified writes")
LONG = ('Answer: Employees may work remotely up to 3 days per week with prior manager approval. Remote '
        'employees must be reachable during core hours of 10:00 to 16:00 IST. [remote_work_v3]\n'
        'Quote: "Employees may work remotely up to 3 days per week with prior manager approval." [remote_work_v3]')
SHORT = ('Answer: Up to 3 days per week. [remote_work_v3]\n'
         'Quote: "Employees may work remotely up to 3 days per week" [remote_work_v3]')
print(mem.write(Q, LONG, critic_valid=True))
print(mem.write("Remote work limit per week?", SHORT, critic_valid=True))
print("facts stored:", len(mem), "| file:", mem.path)

# %% 2.1(d) Read: cheapest sufficient entry first
header("2.1(d) cheapest-sufficient read")
for q in [Q, "What is the remote work limit?", "How many days remote work?", "Is MFA required for VPN?"]:
    hit = mem.read(q)
    print(f"{q:<48} ->", "MISS" if not hit else
          f"{hit['tier']:<8} score={hit['score']:.2f}  answer_len={len(hit['fact'].answer)}")
# EXPECT: exact match; semantic hit choosing the SHORT answer (both are sufficient); two misses

# %% 2.1(e) Hint passed into the question -> agent skips the search step
from agent import build_agent

header("2.1(e) memory hint makes the agent cheaper")
agent = build_agent(s, verbose=False)
cold = agent.invoke(Q)
hint = SemanticMemory.to_hint(mem.read(Q))
warm = agent.invoke(Q + "\n\n" + hint)
print("hint:\n" + hint)
print("\ncold tool calls:", [t.tool for t in cold.tool_calls])
print("warm tool calls:", [t.tool for t in warm.tool_calls])
# EXPECT: cold = policy_search, read_policy ; warm = read_policy only
