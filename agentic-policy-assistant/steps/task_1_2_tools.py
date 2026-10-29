"""
TASK 1.2 - Tools
  policy_search(query, k) with a FAISS retriever
  read_policy(doc_id) -> full text; typed error when missing
  (optional) calculator with safe division

Run:  python steps/task_1_2_tools.py    (or cell by cell in VS Code)
Code under test: tools.py
"""
# %% 1.2(a) Embeddings + FAISS index
import _setup
from _setup import header
from tools import get_embeddings, get_index, get_retriever

header("1.2(a) build the FAISS index")
print("embeddings :", type(get_embeddings()).__name__, "(OpenAI if OPENAI_API_KEY is set, else local hashing)")
print("index size :", get_index().index.ntotal, "vectors")
print("retriever  :", [d.metadata["doc_id"] for d in get_retriever(k=2).invoke("annual leave")])
# EXPECT: 10 vectors; retriever top-2 starts with annual_leave_v2

# %% 1.2(b) policy_search(query, k)
from tools import policy_search

header("1.2(b) policy_search")
for q in ["What is our remote work limit?", "travel meals cap INR", "Is MFA required for VPN?"]:
    hits = policy_search(q, k=3)
    print(f"\n{q}")
    for h in hits:
        print(f"   {h.doc_id:<20} score={h.score:.3f}  {h.snippet[:60]}...")
# EXPECT: top hit = remote_work_v3, travel_expense_v4, it_security_v5

# %% 1.2(c) read_policy(doc_id) and the typed error
from models import PolicyNotFoundError
from tools import read_policy

header("1.2(c) read_policy")
print(read_policy("travel_expense_v4")["text"])
try:
    read_policy("remote_work_v9.9")
except PolicyNotFoundError as e:
    print(f"\nraised {type(e).__name__} (code={e.code}): {e}")
    print("details:", e.details)
# EXPECT: full travel text, then PolicyNotFoundError with code POLICY_NOT_FOUND

# %% 1.2(d) Soft failure through the LangChain tool (what the agent sees)
import json
from tools import TOOLS, read_policy_tool

header("1.2(d) LangChain tool wrappers")
print("tools:", [t.name for t in TOOLS])
print(json.dumps(json.loads(read_policy_tool.invoke({"doc_id": "remote_work_v9.9"})), indent=2))
# EXPECT: {"ok": false, ... "error": "POLICY_NOT_FOUND", "hint": "Call policy_search ..."} - no exception

# %% 1.2(e) calculator with safe division
from models import CalculatorError
from tools import calculator

header("1.2(e) calculator")
print("12 * 4      =", calculator("12 * 4"))
print("1500 / 4    =", calculator("1500 / 4"))
for expr in ["10 / 0", "__import__('os').system('ls')", "2 ** 1000"]:
    try:
        calculator(expr)
    except CalculatorError as e:
        print(f"{expr:<32} -> {e.code}: {e}")
# EXPECT: 48, 375, then three CALCULATOR_ERROR lines
