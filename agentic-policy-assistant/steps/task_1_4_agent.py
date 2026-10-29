"""
TASK 1.4 - Agent
Deterministic ReAct-style tool-calling agent with verbose tracing,
plus "bad id" recovery: fail softly, then search.

Run:  python steps/task_1_4_agent.py    (or cell by cell in VS Code)
Code under test: agent.py
"""
# %% 1.4(a) Build the agent (OpenAI temperature=0 if key set, else offline deterministic model)
import _setup
from _setup import header
from agent import build_agent
from models import get_settings

header("1.4(a) build the agent")
s = get_settings()
agent = build_agent(s, verbose=True)
print("LLM:", type(agent.llm).__name__, "| temperature:", s.temperature, "| max_iterations:", s.max_iterations)

# %% 1.4(b) One ReAct run with verbose trace (Thought -> Action -> Observation -> Answer)
header("1.4(b) ReAct trace")
res = agent.invoke("What is our remote work limit? Cite and quote.")
print("\niterations:", res.iterations, "| tool calls:", [t.tool for t in res.tool_calls],
      "| latency_ms:", res.latency_ms)
# EXPECT: policy_search -> read_policy -> answer with [remote_work_v3] and a quote

# %% 1.4(c) Bad-id recovery: read_policy fails softly, agent searches, then answers
header("1.4(c) bad id recovery")
res = agent.invoke("Read policy remote_work_v9.9 and answer the limit.")
print("\ntool sequence:", [(t.tool, "ok" if t.ok else "ERROR") for t in res.tool_calls])
# EXPECT: [('read_policy','ERROR'), ('policy_search','ok'), ('read_policy','ok')]

# %% 1.4(d) Multi-tool: calculator + policy
header("1.4(d) multi-tool")
res = agent.invoke("Compute 12 * 4 and then tell me meals cap with citation.")
print("\ntool sequence:", [t.tool for t in res.tool_calls])
# EXPECT: calculator -> policy_search -> read_policy; answer has 48 and [travel_expense_v4]

# %% 1.4(e) Step limit: max_iterations=1 forces a clean stop
header("1.4(e) max_iterations stop")
tiny = build_agent(s.model_copy(update={"max_iterations": 1}), verbose=True)
res = tiny.invoke("Is MFA required for VPN?")
print("stopped_reason:", res.stopped_reason)
# EXPECT: stopped_reason = max_iterations

# %% 1.4(f) Determinism: same question twice -> identical answer
header("1.4(f) determinism")
quiet = build_agent(s, verbose=False)
a1 = quiet.invoke("Is MFA required for VPN? Cite and quote.").answer
a2 = quiet.invoke("Is MFA required for VPN? Cite and quote.").answer
print("identical answers:", a1 == a2)
