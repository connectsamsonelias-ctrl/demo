"""Phase 1 - load, inspect, document and clean the retail interaction dataset."""
import json

import numpy as np
import pandas as pd

import config

# Columns that form the base tabular dataset (customer / product / interaction).
ORIGINAL_GROUPS = {
    "Customer profile": ["customer_id", "age", "gender", "city_tier", "state", "income_band",
                         "occupation", "membership_level"],
    "Customer history": ["days_since_last_purchase", "avg_order_value", "total_orders",
                         "preferred_channel"],
    "Product profile": ["product_id", "category", "sub_category", "brand", "color", "size",
                        "material", "season", "is_returnable"],
    "Commercial data": ["base_price", "discount_percent", "final_price", "avg_product_rating",
                        "stock_level"],
    "Interaction data": ["purchase_flag", "quantity", "payment_mode", "delivery_type",
                         "time_on_page", "added_to_cart", "wishlist_flag"],
    "Post-purchase": ["returned_flag", "rating_given"],
}

# Text-rich columns added for GenAI, with the rule used to reproduce each one.
ENGINEERED = {
    "review_sentiment_label": "Derived from rating_given (2=negative, 3=neutral, 4-5=positive)",
    "product_title": "Template: brand + color + sub_category + material + category",
    "product_description": "Template sentence from color, sub_category, brand, material, use case, category",
    "customer_review_text": "Synthetic review sentence chosen to match review_sentiment_label",
    "customer_query": "Synthetic shopper query: color + sub_category + use case + budget (~final_price + Rs.1000)",
    "policy_doc_id": "Policy id from retail_policies.json linked to the row",
    "policy_text_snippet": "Text of that policy (data/retail_policies.json)",
    "image_path": "Placeholder path images/<product_id>.jpg (optional multimodal, not used)",
    "recommended_use_case": "Synthetic intended use (Travel, Daily Wear, Office, Sports, ...)",
    "style_tags": "Comma-joined color, material, use case",
    "occasion_tags": "Same as recommended_use_case, used for semantic search",
}

DESCRIPTIONS = {
    "customer_id": "Customer identifier", "age": "Customer age (years)", "gender": "Customer gender",
    "city_tier": "City tier (Tier-1/2/3)", "state": "Indian state",
    "income_band": "Income band (Low/Medium/High)", "occupation": "Occupation",
    "membership_level": "Loyalty tier (Bronze/Silver/Gold/Platinum)",
    "days_since_last_purchase": "Recency in days",
    "avg_order_value": "Historic average order value (Rs.)", "total_orders": "Historic order count",
    "preferred_channel": "App / Web / Store", "product_id": "Product identifier (reused across listings)",
    "category": "Shoes / Apparel / Accessories", "sub_category": "Product sub-type", "brand": "Brand",
    "base_price": "List price (Rs.)", "discount_percent": "Discount (%)",
    "final_price": "Price after discount (Rs.)", "avg_product_rating": "Average product rating (1-5)",
    "stock_level": "Units in stock", "color": "Color", "size": "Size S/M/L/XL ('NA' = missing)",
    "material": "Material", "season": "Season", "is_returnable": "1 if product is returnable",
    "purchase_flag": "1 if the interaction ended in a purchase (PRIMARY TARGET)",
    "quantity": "Units in the interaction", "payment_mode": "Payment method",
    "delivery_type": "Standard / Express", "time_on_page": "Seconds on product page",
    "added_to_cart": "1 if added to cart", "wishlist_flag": "1 if wishlisted",
    "returned_flag": "1 if returned (SECONDARY TARGET, purchases only)",
    "rating_given": "Rating given by customer (2-5); post-outcome, excluded from models",
}
DESCRIPTIONS.update(ENGINEERED)

TARGETS = ["purchase_flag", "added_to_cart", "returned_flag", "rating_given"]


def load_raw(path=None) -> pd.DataFrame:
    # keep_default_na=False so the literal "NA" in `size` is handled explicitly.
    return pd.read_csv(path or config.RAW_CSV, keep_default_na=False, na_values=[""])


def load_policies(path=None) -> dict:
    with open(path or config.POLICY_JSON, encoding="utf-8") as f:
        return json.load(f)


def schema_summary(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({"dtype": df.dtypes.astype(str), "n_unique": df.nunique(),
                         "example": df.iloc[0]})


def quality_report(df: pd.DataFrame) -> dict:
    gap = (df.final_price - df.base_price * (1 - df.discount_percent / 100)).abs().max()
    rating_vs_sent = pd.crosstab(df.rating_given, df.review_sentiment_label)
    one_label_per_rating = bool((rating_vs_sent.gt(0).sum(axis=1) == 1).all())
    return {
        "rows": len(df), "columns": df.shape[1],
        "customers": int(df.customer_id.nunique()), "products": int(df.product_id.nunique()),
        "duplicate_rows": int(df.duplicated().sum()),
        "true_nulls": int(df.isna().sum().sum()),
        "size_NA_placeholders": int((df["size"] == "NA").sum()),
        "max_price_formula_gap": round(float(gap), 4),
        "returns_without_purchase": int(((df.returned_flag == 1) & (df.purchase_flag == 0)).sum()),
        "sentiment_is_function_of_rating": one_label_per_rating,
        "discount_40_never_returnable": bool((df.loc[df.discount_percent == 40, "is_returnable"] == 0).all()),
    }


def class_balance(df: pd.DataFrame) -> dict:
    out = {}
    for t in TARGETS:
        sub = df[df.purchase_flag == 1] if t == "returned_flag" else df
        out[t] = sub[t].value_counts(normalize=True).sort_index().round(3).to_dict()
    return out


def column_provenance(df: pd.DataFrame) -> pd.DataFrame:
    group_of = {c: g for g, cols in ORIGINAL_GROUPS.items() for c in cols}
    missing = set(df.columns) - set(group_of) - set(ENGINEERED)
    assert not missing, f"undocumented columns: {missing}"
    return pd.DataFrame({
        "column": df.columns,
        "source": ["original" if c in group_of else "engineered" for c in df.columns],
        "feature_group": [group_of.get(c, "GenAI enrichment") for c in df.columns],
    })


def data_dictionary(df: pd.DataFrame) -> pd.DataFrame:
    prov = column_provenance(df).set_index("column")
    dd = pd.DataFrame({
        "column": df.columns, "dtype": df.dtypes.astype(str).values,
        "feature_group": prov.loc[df.columns, "feature_group"].values,
        "source": prov.loc[df.columns, "source"].values,
        "n_unique": df.nunique().values,
        "description": [DESCRIPTIONS[c] for c in df.columns],
        "how_reproduced": [ENGINEERED.get(c, "from base dataset") for c in df.columns],
    })
    dd.to_csv(config.RESULTS_DIR / "data_dictionary.csv", index=False)
    return dd


def clean(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["size"] = out["size"].replace("NA", np.nan)     # explicit missing, imputed in Phase 2
    out["price_band"] = pd.cut(out.final_price, [0, 1500, 3000, 5000, np.inf],
                               labels=["<1.5k", "1.5k-3k", "3k-5k", "5k+"]).astype(str)
    out.to_csv(config.CLEAN_CSV, index=False)
    return out


def load_clean() -> pd.DataFrame:
    if not config.CLEAN_CSV.exists():
        return clean(load_raw())
    return pd.read_csv(config.CLEAN_CSV)
