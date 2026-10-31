"""Phase 4 - grounded product retrieval + recommendation (hybrid: filters + FAISS + rerank)."""
import json
import re

import config
import llm
import vector_store

COLORS = ["black", "white", "blue", "grey", "gray", "brown", "red", "beige", "navy", "green", "olive"]
BRANDS = ["fastrack", "bata", "nike", "puma", "wildcraft", "skechers", "levis", "h&m", "zara",
          "roadster", "titan", "skybags", "adidas", "uniqlo"]
MATERIALS = ["leather", "mesh", "synthetic", "fabric", "cotton", "denim", "polyester"]
OCCASIONS = {"daily wear": "Daily Wear", "daily use": "Daily Use", "everyday": "Daily Wear",
             "office": "Office", "work": "Office", "travel": "Travel", "trip": "Travel",
             "sports": "Sports", "gym": "Sports", "casual": "Casual", "winter": "Winter"}
# Ordered: more specific phrases first.
SUBCATS = [(r"sneakers?|trainers?", "Sneakers"), (r"running shoes?|running", "Running"),
           (r"formal shoes?|dress shoes?|oxfords?", "Formal"), (r"casual shoes?|loafers?", "Casual"),
           (r"t-?shirts?|tees?\b", "Tshirt"), (r"shirts?", "Shirt"), (r"jeans|denims?\b", "Jeans"),
           (r"jackets?|coats?", "Jacket"), (r"backpacks?|bags?", "Backpack"), (r"caps?|hats?", "Cap"),
           (r"watch(es)?|wristwatch", "Watch"), (r"wallets?|purses?", "Wallet")]
CATEGORIES = {"shoes": "Shoes", "footwear": "Shoes", "apparel": "Apparel", "clothing": "Apparel",
              "clothes": "Apparel", "accessories": "Accessories", "accessory": "Accessories"}
_NUM = r"(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k)?"

SYSTEM_PROMPT = """You are the product assistant of an online retail store.
Rules:
1. Use ONLY the products listed in CONTEXT. Never invent products, prices, ratings or features.
2. Respect the shopper's constraints (budget, color, type, occasion).
3. Recommend at most 3 products, best first, and explain each choice using facts from CONTEXT.
4. If no product fits, return an empty list and say so.
Return a JSON object with keys:
  "recommendations": [{"doc_id": str, "title": str, "price": number, "why": str}],
  "summary": str (2-3 sentences), "supporting_ids": [doc_id, ...], "caveats": str"""

SUMMARY_PROMPT = """You summarise retrieved products for a shopper.
Use ONLY facts in CONTEXT (title, price, rating, reviews, tags). Do not add new products.
Return a JSON object: {"products": [{"doc_id": str, "summary": str, "why_it_fits": str}],
"overall": str, "supporting_ids": [doc_id, ...]}"""


def _money(num: str, k: str) -> float:
    v = float(num.replace(",", ""))
    return v * 1000 if k else v


def parse_query(query: str) -> dict:
    """Extract explicit, inspectable constraints from the shopper's text."""
    q = query.lower()
    c = {"max_price": None, "min_price": None, "category": None, "sub_category": None,
         "color": None, "brand": None, "material": None, "occasion": None, "premium": False}
    m = re.search(r"between\s*" + _NUM + r"\s*(?:and|-|to)\s*" + _NUM, q)
    if m:
        c["min_price"], c["max_price"] = _money(m.group(1), m.group(2)), _money(m.group(3), m.group(4))
    else:
        m = re.search(r"(?:under|below|less than|within|up ?to|max(?:imum)?|budget(?: of)?|<)\s*" + _NUM, q)
        if m:
            c["max_price"] = _money(m.group(1), m.group(2))
        m = re.search(r"(?:above|over|more than|at least|>)\s*" + _NUM, q)
        if m:
            c["min_price"] = _money(m.group(1), m.group(2))
    for col in COLORS:
        if re.search(rf"\b{col}\b", q):
            c["color"] = "Grey" if col == "gray" else col.title()
            break
    for b in BRANDS:
        if re.search(rf"(?<![\w&]){re.escape(b)}(?![\w&])", q):
            c["brand"] = {"h&m": "H&M"}.get(b, b.title())
            break
    for mat in MATERIALS:
        if re.search(rf"\b{mat}\b", q) and not (mat == "denim" and re.search(r"\bdenims?\b", q)
                                                 and not re.search(r"denim (jacket|shirt)", q)):
            c["material"] = mat.title()
            break
    for pat, sub in SUBCATS:
        if re.search(rf"\b(?:{pat})", q):
            c["sub_category"] = sub
            break
    for word, cat in CATEGORIES.items():
        if re.search(rf"\b{word}\b", q):
            c["category"] = cat
            break
    if c["category"] is None and re.search(r"\bshoes?\b", q):
        c["category"] = "Shoes"
    for word, occ in OCCASIONS.items():
        if word in q:
            c["occasion"] = occ
            break
    c["premium"] = bool(re.search(r"premium|platinum|gold member|luxury|high[- ]end", q))
    return c


def _passes(doc: dict, c: dict, keys: set) -> bool:
    if c["max_price"] is not None and doc["final_price"] > c["max_price"]:
        return False
    if c["min_price"] is not None and doc["final_price"] < c["min_price"]:
        return False
    for k in keys:
        if c.get(k) and doc[k] != c[k]:
            return False
    return True


def candidate_set(docs: list, c: dict) -> tuple:
    """Apply hard filters. Only soft attributes (brand, then color) may be relaxed;
    product type and budget are never relaxed, so we never return off-type items."""
    keys = {k for k in ("sub_category", "category", "color", "brand") if c.get(k)}
    relaxed = []
    for drop in [None, "brand", "color"]:
        if drop:
            if drop not in keys:
                continue
            keys.discard(drop)
            relaxed.append(drop)
        ids = {d["doc_id"] for d in docs if _passes(d, c, keys)}
        if ids:
            return ids, relaxed
    return set(), relaxed


def no_match_hint(docs: list, c: dict) -> str:
    """Tell the shopper the cheapest price available for the requested type."""
    type_key = "sub_category" if c.get("sub_category") else "category" if c.get("category") else None
    pool = [d for d in docs if not type_key or d[type_key] == c[type_key]]
    if not pool:
        return ""
    cheapest = min(d["final_price"] for d in pool)
    label = c.get(type_key) or "products"
    return f" The cheapest {label} in the catalogue costs Rs. {cheapest:.0f}."


def rerank_score(doc: dict, cosine: float, c: dict) -> float:
    s = cosine
    if c["occasion"] and c["occasion"].lower() in (doc["occasion_tags"] + doc["style_tags"]).lower():
        s += 0.05
    if c["material"] and doc["material"] == c["material"]:
        s += 0.05
    s += 0.02 * (doc["avg_product_rating"] - 3)
    if c["premium"]:
        s += 0.03 * (doc["avg_product_rating"] - 3) + 0.02 * (doc["base_price"] > 3000)
    return round(s, 4)


def retrieve(query: str, k: int = config.TOP_K, use_filters: bool = True) -> dict:
    store = vector_store.get_stores()["product"]
    c = parse_query(query)
    relaxed = []
    if use_filters:
        ids, relaxed = candidate_set(store.docs, c)
        hits = store.search(query, k=max(k * 4, 20), candidate_ids=ids) if ids else []
    else:
        hits = store.search(query, k=max(k * 4, 20))
    ranked = sorted(((d, s, rerank_score(d, s, c) if use_filters else s) for d, s in hits),
                    key=lambda t: -t[2])[:k]
    threshold = config.MIN_SCORE[config.backend_name()]["product"]
    results = [{"doc_id": d["doc_id"], "title": d["product_title"], "price": d["final_price"],
                "rating": d["avg_product_rating"], "category": d["category"],
                "sub_category": d["sub_category"], "color": d["color"], "brand": d["brand"],
                "occasion": d["occasion_tags"], "discount_percent": d["discount_percent"],
                "is_returnable": d["is_returnable"], "review": d["review_snippet"],
                "review_sentiments": d["review_sentiments"],
                "cosine": round(s, 4), "score": r} for d, s, r in ranked]
    # Confidence: an explicit attribute filter that held (not relaxed) is strong evidence;
    # otherwise rely on the semantic similarity threshold.
    attr_hit = any(c.get(k) and k not in relaxed for k in ("sub_category", "category", "color", "brand"))
    if not results:
        status = "no_match"
    elif not attr_hit and results[0]["cosine"] < threshold:
        status = "weak"
    else:
        status = "ok"
    return {"query": query, "constraints": c, "relaxed_filters": relaxed, "status": status,
            "threshold": threshold, "results": results, "engine": store.info()}


def _context(results: list) -> str:
    rows = [{k: r[k] for k in ("doc_id", "title", "price", "rating", "category", "sub_category",
                               "color", "brand", "occasion", "discount_percent", "is_returnable",
                               "review", "review_sentiments")} for r in results]
    return json.dumps(rows, ensure_ascii=False, indent=1)


def _why(r: dict, c: dict) -> str:
    bits = [f"{r['sub_category']} by {r['brand']} in {r['color']}"]
    if c["max_price"]:
        bits.append(f"Rs. {r['price']:.0f} is within the Rs. {c['max_price']:.0f} budget")
    else:
        bits.append(f"priced at Rs. {r['price']:.0f}")
    bits.append(f"rated {r['rating']}/5")
    if c["occasion"] and c["occasion"].lower() in r["occasion"].lower():
        bits.append(f"tagged for {r['occasion']}")
    return "; ".join(bits) + "."


def _fallback_recommend(ret: dict):
    def f():
        top = ret["results"][:3]
        recs = [{"doc_id": r["doc_id"], "title": r["title"], "price": r["price"],
                 "why": _why(r, ret["constraints"])} for r in top]
        return {"recommendations": recs,
                "summary": (f"Top {len(recs)} matches from the catalogue for: '{ret['query']}'. "
                            "Ranked by semantic similarity, filters and rating.") if recs
                else "No catalogue product matches this request.",
                "supporting_ids": [r["doc_id"] for r in recs],
                "caveats": ""}
    return f


def validate_recommendations(out: dict, results: list) -> tuple:
    """Drop anything not in the retrieved context; copy facts from the context."""
    by_id = {r["doc_id"]: r for r in results}
    clean, dropped = [], []
    for rec in out.get("recommendations", []) or []:
        rid = str(rec.get("doc_id", ""))
        if rid in by_id:
            clean.append({"doc_id": rid, "title": by_id[rid]["title"], "price": by_id[rid]["price"],
                          "why": str(rec.get("why", "")).strip()})
        else:
            dropped.append(rid)
    out["recommendations"] = clean[:3]
    out["supporting_ids"] = [r["doc_id"] for r in out["recommendations"]]
    return out, dropped


def recommend(query: str, k: int = config.TOP_K) -> dict:
    ret = retrieve(query, k=k)
    if ret["status"] == "no_match":
        hint = no_match_hint(vector_store.get_stores()["product"].docs, ret["constraints"])
        return {**ret, "recommendations": [], "supporting_ids": [], "llm": {"skipped": True},
                "summary": "I could not find any product matching these constraints." + hint +
                           " Try a higher budget or fewer filters.", "caveats": ""}
    user = (f"SHOPPER REQUEST: {query}\nPARSED CONSTRAINTS: {json.dumps(ret['constraints'])}\n"
            f"RETRIEVAL STATUS: {ret['status']}\nCONTEXT (retrieved products):\n{_context(ret['results'])}")
    out, meta = llm.chat_json(SYSTEM_PROMPT, user, _fallback_recommend(ret))
    out, dropped = validate_recommendations(out, ret["results"])
    if not out["recommendations"] and (dropped or meta.get("used_fallback")):
        # every id was hallucinated -> use the grounded deterministic answer instead
        out = _fallback_recommend(ret)()
        meta["used_fallback"] = True
    if ret["status"] == "weak" and meta.get("used_fallback"):
        # offline/fallback cannot judge relevance, so do not push weak matches as answers
        out.update(recommendations=[], supporting_ids=[],
                   summary="No product in the catalogue clearly matches this request.")
    meta["dropped_ids"] = dropped
    caveat = out.get("caveats", "") or ""
    if ret["relaxed_filters"]:
        wanted = ", ".join(f"{k}={ret['constraints'][k]}" for k in ret["relaxed_filters"])
        caveat = (f"No exact match for {wanted} within your constraints; showing the closest "
                  f"alternatives. " + caveat).strip()
    if ret["status"] == "weak":
        caveat = ("Low retrieval confidence - results may only partly match. " + caveat).strip()
    return {**ret, "recommendations": out["recommendations"], "summary": out.get("summary", ""),
            "supporting_ids": out["supporting_ids"], "caveats": caveat, "llm": meta}


def summarize_products(query: str, results: list, n: int = 3) -> dict:
    top = results[:n]
    if not top:
        return {"products": [], "overall": "There are no retrieved products to summarise yet.",
                "supporting_ids": [], "llm": {"skipped": True}}

    def fb():
        prods = []
        for r in top:
            sent = ", ".join(f"{v} {k}" for k, v in r["review_sentiments"].items())
            prods.append({"doc_id": r["doc_id"],
                          "summary": f"{r['title']} - Rs. {r['price']:.0f}, rated {r['rating']}/5; "
                                     f"reviews: {sent}. \"{r['review']}\"",
                          "why_it_fits": _why(r, parse_query(query))})
        return {"products": prods, "overall": f"Summary of the top {len(prods)} retrieved products.",
                "supporting_ids": [p["doc_id"] for p in prods]}

    user = f"SHOPPER REQUEST: {query}\nCONTEXT:\n{_context(top)}"
    out, meta = llm.chat_json(SUMMARY_PROMPT, user, fb)
    ids = {r["doc_id"] for r in top}
    prods = [p for p in out.get("products", []) or [] if str(p.get("doc_id")) in ids]
    if not prods:
        out, meta["used_fallback"] = fb(), True
        prods = out["products"]
    return {"products": prods, "overall": out.get("overall", ""),
            "supporting_ids": [p["doc_id"] for p in prods], "llm": meta}
