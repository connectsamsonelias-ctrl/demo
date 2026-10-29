from graph import build_graph, run_graph
from memory import SemanticMemory
from models import AgentResult, ToolCallTrace

Q = "Is MFA required for VPN? Cite and quote."
GOOD = ('Answer: MFA is required for VPN. [it_security_v5]\nQuote: "Multi-factor authentication (MFA) '
        'is required for all VPN connections" [it_security_v5]')
READ = ToolCallTrace(step=1, tool="read_policy", args={"doc_id": "it_security_v5"}, ok=True,
                     output_preview="", latency_ms=0)


class ScriptedAgent:
    """Returns pre-set answers in order, so we can force critic failures."""
    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = 0

    def invoke(self, question):
        self.calls += 1
        ans = self.answers[min(self.calls - 1, len(self.answers) - 1)]
        return AgentResult(answer=ans, iterations=2, tool_calls=[READ])


def test_happy_path_visits_all_nodes(settings):
    app = build_graph(settings, memory=SemanticMemory(settings))
    st = run_graph(app, Q)
    assert [t["node"] for t in st["trace"]] == ["plan", "memory_read", "agent_answer", "critic", "memory_write"]
    assert st["stop_reason"] == "completed"
    assert st["steps"] <= settings.max_steps
    assert st["memory_written"] is True


def test_budget_stop(settings):
    app = build_graph(settings, memory=SemanticMemory(settings))
    st = run_graph(app, Q, max_steps=3)
    assert st["stop_reason"] == "budget_exhausted"
    assert st["steps"] == 3
    assert "critic" not in [t["node"] for t in st["trace"]]
    assert not st.get("memory_written")                     # nothing written when budget runs out


def test_single_retry_then_success(settings):
    agent = ScriptedAgent(["Answer: yes, MFA is needed.", GOOD])
    app = build_graph(settings, memory=SemanticMemory(settings), agent=agent)
    st = run_graph(app, Q)
    assert agent.calls == 2
    assert st["retries"] == 1
    assert st["critic"]["valid"] is True
    assert st["stop_reason"] == "completed"


def test_single_retry_then_stop_without_memory_write(settings):
    mem = SemanticMemory(settings)
    agent = ScriptedAgent(["Answer: yes.", "Answer: still no citation."])
    app = build_graph(settings, memory=mem, agent=agent)
    st = run_graph(app, Q)
    assert agent.calls == 2                                 # exactly one retry, never more
    assert st["stop_reason"] == "critic_failed"
    assert len(mem) == 0


def test_warm_run_hits_memory(settings):
    mem = SemanticMemory(settings)
    app = build_graph(settings, memory=mem)
    cold = run_graph(app, Q)
    warm = run_graph(app, Q)
    assert cold["memory_hit"] is False and warm["memory_hit"] is True
    assert len(warm["tool_calls"]) < len(cold["tool_calls"])


def test_sqlite_checkpointing(settings):
    app = build_graph(settings, memory=SemanticMemory(settings), use_sqlite=True)
    st = run_graph(app, Q, thread_id="t1")
    assert st["stop_reason"] == "completed"
    assert (settings.log_dir / "checkpoints.sqlite").exists()
    saved = app.get_state({"configurable": {"thread_id": "t1"}})
    assert saved.values["question"] == Q
