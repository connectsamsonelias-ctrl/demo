import clustering


def test_customer_features_complete(clean_df):
    c = clustering.customer_features(clean_df)
    assert len(c) == 250
    assert not c[clustering.CLUSTER_FEATURES].isna().any().any()


def test_segments_and_names(clean_df):
    r = clustering.run(clean_df)
    p = r["profile"]
    assert len(p) == clustering.CHOSEN_K
    assert p.segment_name.is_unique
    assert p.n_customers.sum() == 250
    most = p.sort_values("price_sensitivity_index").iloc[-1]
    assert most.segment_name.startswith("Deal Seekers")
    assert most.deep_discount_share == p.deep_discount_share.max()
    assert r["summary"]["silhouette"] > 0.2
