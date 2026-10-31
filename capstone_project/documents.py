"""Phase 3 - turn tabular rows into retrieval-ready product and policy documents."""
import json
import re

import pandas as pd

import config
import data_prep

# Engineered synonym keywords per sub-category so natural shopper words match
# (e.g. "trainers" -> Sneakers, "dress shoes" -> Formal). Documented assumption.
SUBCAT_KEYWORDS = {
    "Sneakers": "sneakers trainers casual shoes", "Casual": "casual shoes loafers everyday shoes",
    "Running": "running shoes sports shoes jogging gym", "Formal": "formal shoes office dress shoes",
    "Shirt": "shirt formal shirt office wear", "Jeans": "jeans denim trousers pants",
    "Tshirt": "t-shirt tee casual top", "Jacket": "jacket outerwear winter coat",
    "Backpack": "backpack bag travel bag laptop bag", "Cap": "cap hat headwear",
    "Watch": "watch wristwatch timepiece", "Wallet": "wallet purse card holder",
}

POLICY_TOPICS = {
    "POL_RETURNS": "Returns policy: return window, unused items, discounted items",
    "POL_EXCHANGE": "Exchange policy: size exchange, intimate wear, final sale",
    "POL_SHIPPING": "Shipping and delivery policy: standard and express delivery times",
    "POL_REFUND": "Refund policy: quality inspection, prepaid refund timeline",
    "POL_WARRANTY": "Warranty policy: watches and accessories, manufacturing defects, physical damage",
}


def _sku_ids(df: pd.DataFrame) -> pd.Series:
    """product_id is reused for different items, so a listing = (product_id, product_title)."""
    keys = df[["product_id", "product_title"]].drop_duplicates()
    keys["sku_id"] = keys.product_id + "-" + (keys.groupby("product_id").cumcount() + 1).astype(str)
    return df.merge(keys, on=["product_id", "product_title"], how="left")["sku_id"]


def product_text(r: dict) -> str:
    ret = "returnable" if r["is_returnable"] else "not returnable (final sale)"
    return (f"{r['product_title']}. Category: {r['category']} > {r['sub_category']}. "
            f"Brand: {r['brand']}. Color: {r['color']}. Material: {r['material']}. "
            f"Season: {r['season']}. Best for: {r['recommended_use_case']}. "
            f"Style tags: {r['style_tags']}. Occasion: {r['occasion_tags']}. "
            f"Keywords: {SUBCAT_KEYWORDS.get(r['sub_category'], '')}. "
            f"Price: Rs. {r['final_price']:.0f} (MRP Rs. {r['base_price']:.0f}, "
            f"{r['discount_percent']}% off). Average rating {r['avg_product_rating']:.1f}/5. "
            f"This item is {ret}. Description: {r['product_description']} "
            f"Customer review: {r['review_snippet']}")


def build_product_docs(df: pd.DataFrame) -> list:
    d = df.copy()
    d["sku_id"] = _sku_ids(d).values
    docs = []
    for sku, g in d.groupby("sku_id", sort=False):
        first = g.iloc[0]
        rec = {
            "doc_id": sku, "product_id": first.product_id, "product_title": first.product_title,
            "category": first.category, "sub_category": first.sub_category, "brand": first.brand,
            "color": first.color, "material": first.material, "season": first.season,
            "recommended_use_case": first.recommended_use_case, "style_tags": first.style_tags,
            "occasion_tags": first.occasion_tags, "product_description": first.product_description,
            "final_price": round(float(g.final_price.median()), 2),
            "base_price": round(float(g.base_price.median()), 2),
            "discount_percent": int(g.discount_percent.max()),
            "avg_product_rating": round(float(g.avg_product_rating.mean()), 2),
            "is_returnable": int(g.is_returnable.min()),
            "sizes": sorted(s for s in g["size"].dropna().astype(str).unique()),
            "review_snippet": first.customer_review_text,
            "review_sentiments": g.review_sentiment_label.value_counts().to_dict(),
            "n_interactions": int(len(g)), "purchase_rate": round(float(g.purchase_flag.mean()), 3),
            "sample_customer_query": first.customer_query,
            "image_path": first.image_path,
        }
        rec["text"] = product_text(rec)
        docs.append(rec)
    return docs


def split_sentences(text: str) -> list:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def build_policy_docs(policies: dict) -> list:
    """One chunk per sentence (so answers can quote precisely) plus the policy topic."""
    docs = []
    for pid, text in policies.items():
        for i, sent in enumerate(split_sentences(text), start=1):
            docs.append({"doc_id": pid, "chunk_id": f"{pid}#{i}", "topic": POLICY_TOPICS.get(pid, pid),
                         "sentence": sent, "full_text": text,
                         "text": f"{POLICY_TOPICS.get(pid, pid)}. {sent}"})
    return docs


def save_jsonl(docs: list, path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")


def load_jsonl(path) -> list:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def build_all() -> tuple:
    df = data_prep.load_clean()
    products = build_product_docs(df)
    policies = build_policy_docs(data_prep.load_policies())
    save_jsonl(products, config.PRODUCT_DOCS_JSONL)
    save_jsonl(policies, config.POLICY_DOCS_JSONL)
    return products, policies


def load_all() -> tuple:
    if not (config.PRODUCT_DOCS_JSONL.exists() and config.POLICY_DOCS_JSONL.exists()):
        return build_all()
    return load_jsonl(config.PRODUCT_DOCS_JSONL), load_jsonl(config.POLICY_DOCS_JSONL)
