import pytest

from agent import build_agent
from critic import critique
from eval import QUERIES, run_eval_v1, run_eval_v2
from memory import SemanticMemory
from models import DOC_ID_RE, QUOTE_RE


@pytest.fixture
def agent(settings):
    return build_agent(settings, verbose=False)


@pytest.mark.parametrize("item", QUERIES, ids=[q["id"] for q in QUERIES])
def test_answer_is_grounded_cited_and_quoted(agent, item):
    res = agent.invoke(item["q"])
    assert res.stopped_reason == "final_answer"
    assert item["expect_doc"] in DOC_ID_RE.findall(res.answer)
    assert QUOTE_RE.findall(res.answer)
    assert critique(item["q"], res.answer, [t.model_dump() for t in res.tool_calls])["valid"]


def test_bad_id_recovery_fails_softly_then_searches(agent):
    res = agent.invoke("Read policy remote_work_v9.9 and answer the limit.")
    tools = [(t.tool, t.ok) for t in res.tool_calls]
    assert tools[0] == ("read_policy", False)          # soft failure, no exception
    assert tools[1] == ("policy_search", True)         # recovery
    assert tools[2] == ("read_policy", True)
    assert "[remote_work_v3]" in res.answer


def test_multi_tool_calculator_then_policy(agent):
    res = agent.invoke("Compute 12 * 4 and then tell me meals cap with citation.")
    assert res.tool_calls[0].tool == "calculator"
    assert "48" in res.answer and "[travel_expense_v4]" in res.answer


def test_agent_respects_max_iterations(settings):
    s = settings.model_copy(update={"max_iterations": 1})
    res = build_agent(s, verbose=False).invoke("Is MFA required for VPN?")
    assert res.stopped_reason == "max_iterations"
    assert res.iterations == 1


def test_eval_v1_pass_rate_at_least_80(settings):
    rows = run_eval_v1(settings)
    assert sum(r["pass"] for r in rows) / len(rows) >= 0.8


def test_eval_v2_cold_then_warm(settings):
    cold = run_eval_v2(settings, reset_memory=True)
    warm = run_eval_v2(settings, reset_memory=False)
    assert sum(r["pass"] for r in cold) / len(cold) >= 0.8
    assert all(r["memory_hit"] for r in warm)
    assert sum(r["tool_calls"] for r in warm) < sum(r["tool_calls"] for r in cold)


def test_memory_writes_only_verified_facts(settings):
    mem = SemanticMemory(settings)
    q = "remote work limit?"
    assert not mem.write(q, "Answer: 3 days.", critic_valid=True)[0]                     # no doc_id
    assert not mem.write(q, 'Answer: x [remote_work_v3]\nQuote: "made up rule text"', True)[0]  # bad quote
    good = 'Answer: [remote_work_v3]\nQuote: "Employees may work remotely up to 3 days per week" [remote_work_v3]'
    assert not mem.write(q, good, critic_valid=False)[0]                                  # critic failed
    assert mem.write(q, good, critic_valid=True)[0]
    assert len(mem) == 1
