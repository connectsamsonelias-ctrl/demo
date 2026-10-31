import pytest

import policy_qa


@pytest.mark.parametrize("q,doc", [
    ("Can I return a discounted product after 7 days?", "POL_RETURNS"),
    ("How long does express delivery take?", "POL_SHIPPING"),
    ("Is physical damage covered under watch warranty?", "POL_WARRANTY"),
    ("Can I exchange intimate wear?", "POL_EXCHANGE"),
    ("When will I get my refund for a prepaid order?", "POL_REFUND"),
])
def test_correct_policy_cited(q, doc):
    r = policy_qa.answer(q)
    assert r["citations"][0] == doc
    assert all(any(qt == e["sentence"] for e in r["evidence"]) for qt in r["quotes"])


def test_out_of_scope_refused():
    r = policy_qa.answer("Do you offer gift wrapping?")
    assert r["decision"] == "not_covered" and r["citations"] == []


def test_fake_citation_and_quote_removed(fake_llm):
    fake_llm('{"answer": "Yes, anytime.", "decision": "yes", "citations": ["POL_FAKE"],'
             ' "quotes": ["You can return anything forever."]}')
    r = policy_qa.answer("Can I return a discounted product after 7 days?")
    assert r["decision"] == "not_covered" and r["citations"] == []
    assert "no valid citation -> refused" in r["issues"]


def test_valid_llm_answer_kept(fake_llm):
    fake_llm('{"answer": "No - returns are only allowed within 7 days.", "decision": "no",'
             ' "citations": ["POL_RETURNS"], "quotes": ["Returns are allowed within 7 days of delivery'
             ' for unused products with original packaging."]}')
    r = policy_qa.answer("Can I return a discounted product after 7 days?")
    assert r["decision"] == "no" and r["citations"] == ["POL_RETURNS"]
