import numpy as np
import pytest

import supervised

LEAKY = {"rating_given", "review_sentiment_label", "returned_flag", "payment_mode",
         "delivery_type", "quantity", "purchase_flag"}


def test_no_leakage_in_purchase_features():
    assert not LEAKY & set(supervised.NUMERIC + supervised.CATEGORICAL)


def test_preprocessor_handles_missing_and_unknown(clean_df):
    prep = supervised.make_preprocessor(supervised.NUMERIC, supervised.CATEGORICAL)
    X = prep.fit_transform(clean_df[supervised.NUMERIC + supervised.CATEGORICAL])
    assert not np.isnan(X).any()
    new = clean_df.head(2).copy()
    new["brand"] = "NeverSeenBrand"
    assert prep.transform(new[supervised.NUMERIC + supervised.CATEGORICAL]).shape[1] == X.shape[1]


@pytest.fixture(scope="module")
def purchase_result(clean_df):
    return supervised.run_task(supervised.add_features(clean_df), "purchase_flag",
                               supervised.NUMERIC, supervised.CATEGORICAL, "purchase_flag")


def test_best_model_beats_dummy(purchase_result):
    comp = purchase_result["comparison"].set_index("model")
    best = purchase_result["best_model"]
    assert best != "Dummy (majority)"
    assert comp.loc[best, "test_roc_auc"] > comp.loc["Dummy (majority)", "test_roc_auc"] + 0.05


def test_metrics_valid_and_drivers(purchase_result):
    comp = purchase_result["comparison"]
    for col in ["test_accuracy", "test_f1", "test_roc_auc", "test_pr_auc"]:
        assert comp[col].between(0, 1).all()
    top = purchase_result["importance"].feature.head(3).tolist()
    assert "membership_level" in top
