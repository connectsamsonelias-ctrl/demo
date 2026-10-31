import pytest

import rag
import vector_store


@pytest.mark.parametrize("q,expect", [
    ("casual sneakers under ₹4000", {"max_price": 4000, "sub_category": "Sneakers"}),
    ("black formal shoes", {"color": "Black", "sub_category": "Formal", "category": "Shoes"}),
    ("jeans between 1000 and 2000", {"min_price": 1000, "max_price": 2000, "sub_category": "Jeans"}),
    ("watch under 5k", {"max_price": 5000, "sub_category": "Watch"}),
    ("Nike t-shirt for gym", {"brand": "Nike", "sub_category": "Tshirt", "occasion": "Sports"}),
])
def test_parse_query(q, expect):
    c = rag.parse_query(q)
    for k, v in expect.items():
        assert c[k] == v, (k, c)


def test_index_built():
    info = vector_store.get_stores()["product"].info()
    assert info["n_docs"] == 1497 and info["dim"] > 10


def test_budget_and_type_respected():
    r = rag.recommend("Recommend casual sneakers under ₹4000 for daily wear.")
    assert r["status"] == "ok" and r["recommendations"]
    assert all(x["price"] <= 4000 for x in r["results"])
    assert all(x["sub_category"] == "Sneakers" for x in r["results"])


def test_relaxation_is_reported():
    r = rag.retrieve("red watch under 500")
    assert "color" in r["relaxed_filters"]


def test_weak_query_returns_nothing():
    r = rag.recommend("gift card")
    assert r["status"] == "weak" and r["recommendations"] == []


def test_hallucinated_ids_are_dropped(fake_llm):
    ret = rag.retrieve("black formal shoes")
    good = ret["results"][0]["doc_id"]
    fake_llm('{"recommendations": [{"doc_id": "FAKE-9", "title": "x", "price": 1, "why": "x"},'
             f' {{"doc_id": "{good}", "title": "wrong", "price": 99999, "why": "fits"}}],'
             ' "summary": "s", "supporting_ids": ["FAKE-9"], "caveats": ""}')
    r = rag.recommend("black formal shoes")
    assert [x["doc_id"] for x in r["recommendations"]] == [good]
    assert r["recommendations"][0]["price"] == ret["results"][0]["price"]
    assert r["llm"]["dropped_ids"] == ["FAKE-9"]
