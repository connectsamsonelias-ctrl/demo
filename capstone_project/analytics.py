"""Phase 5 tools - analytics over saved ML results, and a safe calculator.

Analytics answers come from saved result files (numbers, not LLM text), so they cannot
hallucinate. Each answer lists the file it was read from.
"""
import ast
import operator
import re

import pandas as pd

import config


def _profiles() -> pd.DataFrame:
    import clustering
    return clustering.load_profiles()


def segment_insights(query: str = "") -> dict:
    p = _profiles().sort_values("price_sensitivity_index", ascending=False)
    table = p[["segment_name", "n_customers", "share", "avg_purchase_discount", "deep_discount_share",
               "avg_purchase_price", "conversion_rate", "return_rate", "price_sensitivity_index"]]
    top = p.iloc[0]
    q = query.lower()
    if re.search(r"least price|premium|full[- ]price|high[- ]value", q):
        top = p.iloc[-1]
        lead = (f"The least price-sensitive segment is '{top.segment_name}' "
                f"({int(top.n_customers)} customers, {top.share:.0%}).")
    else:
        lead = (f"The most price-sensitive segment is '{top.segment_name}' "
                f"({int(top.n_customers)} customers, {top.share:.0%} of the base).")
    detail = (f" Their purchases average {top.avg_purchase_discount:.1f}% discount, "
              f"{top.deep_discount_share:.0%} of their purchases are at 25%+ discount, average purchase "
              f"price is Rs. {top.avg_purchase_price:.0f}, conversion rate {top.conversion_rate:.0%} and "
              f"return rate {top.return_rate:.0%} (price-sensitivity index {top.price_sensitivity_index:+.2f}).")
    return {"answer": lead + detail, "table": table.round(3).to_dict("records"),
            "sources": [config.SEGMENT_PROFILE_CSV.relative_to(config.ROOT).as_posix()]}


def purchase_drivers(query: str = "") -> dict:
    import supervised
    s = supervised.load_summary()["purchase_flag"]
    imp = supervised.purchase_drivers(5)
    names = ", ".join(f"{r.feature} ({r.importance:.3f})" for r in imp.itertuples())
    ans = (f"The {s['best_model']} purchase model (test ROC-AUC {s['test_roc_auc']:.2f}, "
           f"F1 {s['test_f1']:.2f}) ranks these drivers by permutation importance: {names}. "
           "Gold/Platinum members and high-income customers convert more often; higher-rated "
           "products and items added to cart are more likely to be bought.")
    return {"answer": ans, "table": imp.to_dict("records"),
            "sources": ["results/ml_summary.json", "results/ml_feature_importance.csv"]}


def analytics(query: str) -> dict:
    if re.search(r"driv|predict|purchase likelihood|convert|conversion|model|feature", query.lower()) \
            and not re.search(r"segment|cluster|persona|price[- ]sensitiv", query.lower()):
        return {"analysis": "purchase_drivers", **purchase_drivers(query)}
    return {"analysis": "segment_insights", **segment_insights(query)}


# ---------------- calculator ----------------
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg}
_NUM = r"(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)"


def _safe_eval(expr: str) -> float:
    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        raise ValueError("unsupported expression")
    return ev(ast.parse(expr, mode="eval"))


def discount_pattern(q: str):
    q = q.lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)?\s*(?:on|of|for)\s*(?:an?\s+)?(?:item\s+)?" + _NUM, q)
    if m:
        return float(m.group(2).replace(",", "")), float(m.group(1))
    m = re.search(_NUM + r"[^%\d]{0,40}?(?:after|with|at|less)\s*(?:an?\s+)?(\d+(?:\.\d+)?)\s*%", q)
    if m:
        return float(m.group(1).replace(",", "")), float(m.group(2))
    return None


def calculator(query: str) -> dict:
    d = discount_pattern(query)
    if d:
        price, pct = d
        final = round(price * (1 - pct / 100), 2)
        return {"answer": f"Rs. {price:,.2f} with {pct:g}% discount = Rs. {final:,.2f} "
                          f"(you save Rs. {price - final:,.2f}).",
                "result": final, "expression": f"{price} * (1 - {pct}/100)", "sources": []}
    expr = re.sub(r"[^\d\.\+\-\*/\(\)\s]", " ", query.replace("x", "*").replace("×", "*")).strip()
    expr = re.sub(r"\s+", " ", expr)
    try:
        val = round(float(_safe_eval(expr)), 2)
        return {"answer": f"{expr} = {val:,.2f}", "result": val, "expression": expr, "sources": []}
    except Exception:
        return {"answer": "I could not parse a calculation from this request.", "result": None,
                "expression": expr, "sources": []}
