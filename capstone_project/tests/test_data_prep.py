import pandas as pd

import data_prep


def test_quality_report(clean_df):
    q = data_prep.quality_report(data_prep.load_raw())
    assert q["rows"] == 1500 and q["columns"] == 46
    assert q["duplicate_rows"] == 0 and q["true_nulls"] == 0
    assert q["size_NA_placeholders"] == 270
    assert q["returns_without_purchase"] == 0
    assert q["sentiment_is_function_of_rating"] is True
    assert q["max_price_formula_gap"] < 0.01


def test_provenance_and_dictionary():
    raw = data_prep.load_raw()
    prov = data_prep.column_provenance(raw)
    assert (prov.source == "original").sum() == 35
    assert (prov.source == "engineered").sum() == 11
    dd = data_prep.data_dictionary(raw)
    assert len(dd) == raw.shape[1] and dd.description.str.len().min() > 3


def test_clean_marks_size_missing(clean_df):
    assert clean_df["size"].isna().sum() == 270
    assert "price_band" in clean_df.columns


def test_class_balance_purchase_is_balanced(clean_df):
    bal = data_prep.class_balance(clean_df)
    assert 0.45 < bal["purchase_flag"][1] < 0.55
