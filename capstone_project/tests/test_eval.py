import eval as evaluation


def test_eval_suite_meets_thresholds():
    res = evaluation.run(retrieval_n=30)
    m = res["metrics"]
    assert m["n_queries"] >= 5
    assert m["route_accuracy"] >= evaluation.THRESHOLDS["route_accuracy"]
    assert m["citation_validity"] == 1.0 and m["grounded_rate"] == 1.0
    assert m["hybrid_precision_at_5"] > m["semantic_precision_at_5"]
