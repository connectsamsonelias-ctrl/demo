import json

import pytest

from models import CalculatorError, PolicyNotFoundError, load_policies
from tools import calculator, policy_search, read_policy, read_policy_tool


def test_corpus_has_required_fields():
    policies = load_policies()
    assert len(policies) >= 6
    assert all(p.doc_id and p.text and p.date for p in policies)


@pytest.mark.parametrize("query,expected", [
    ("remote work limit", "remote_work_v3"),
    ("annual leave carry over", "annual_leave_v2"),
    ("travel meals cap INR", "travel_expense_v4"),
    ("MFA for VPN", "it_security_v5"),
])
def test_policy_search_top_hit(query, expected):
    hits = policy_search(query, k=3)
    assert len(hits) == 3
    assert hits[0].doc_id == expected
    assert hits[0].score >= hits[1].score


def test_policy_search_rejects_empty_query():
    with pytest.raises(Exception):
        policy_search("   ")


def test_read_policy_returns_full_text():
    doc = read_policy("it_security_v5")
    assert doc["doc_id"] == "it_security_v5"
    assert "VPN" in doc["text"]


def test_read_policy_missing_raises_typed_error():
    with pytest.raises(PolicyNotFoundError) as exc:
        read_policy("remote_work_v9.9")
    assert exc.value.code == "POLICY_NOT_FOUND"
    assert "policy_search" in exc.value.details["hint"]


def test_read_policy_tool_fails_softly():
    out = json.loads(read_policy_tool.invoke({"doc_id": "nope_v1"}))
    assert out["ok"] is False
    assert out["error"]["error"] == "POLICY_NOT_FOUND"


def test_calculator_basic_and_safe_division():
    assert calculator("12 * 4") == 48
    assert calculator("1500 / 3") == 500
    with pytest.raises(CalculatorError):
        calculator("10 / 0")


@pytest.mark.parametrize("expr", ["__import__('os')", "open('x')", "a + 1", "2 ** 1000"])
def test_calculator_blocks_unsafe_input(expr):
    with pytest.raises(CalculatorError):
        calculator(expr)
