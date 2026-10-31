"""Phase 5 - agent / controller.

Hybrid, inspectable router:
 1. Guardrails  (empty, too long, prompt-injection, unsafe requests)  -> blocked
 2. Rule scores (weighted keyword patterns per tool, printed in the trace)
 3. LLM router  only when no rule fires AND an API key is available; its choice must be
                one of the registered tool names, otherwise we ask the user to clarify.
At most MAX_TOOL_CALLS tool calls per query; each tool call is retried once on error.
"""
import json
import re
import time
from datetime import datetime

import analytics
import config
import llm
import policy_qa
import rag

MAX_TOOL_CALLS = 2
MAX_QUERY_CHARS = 500

TOOLS = {
    "product_search": "Recommend / search products from the catalogue (FAISS + filters + LLM, cites product ids)",
    "policy_qa": "Answer return / refund / exchange / shipping / warranty questions from policy docs (cites policy ids)",
    "analytics": "Customer segment and purchase-driver insights from the saved ML results",
    "review_summary": "Summarise the top retrieved products and explain why they fit",
    "calculator": "Discount / price arithmetic",
}

# (regex, weight). Inspectable on purpose: the trace prints which patterns fired.
RULES = {
    "policy_qa": [(r"\breturn(s|ed|ing|able)?\b", 3), (r"\brefund", 3), (r"\bexchange", 3),
                  (r"\bwarrant", 3), (r"\bguarantee", 2), (r"\bship(ping|ped)?\b", 3),
                  (r"\bdeliver(y|ed)?\b", 2), (r"\bpolic(y|ies)\b", 3), (r"\bcancel", 2),
                  (r"\bdamage", 2), (r"\bdefect", 2), (r"\bgift wrap", 2),
                  (r"\b(can|could|may) i\b", 1), (r"\bhow long\b", 1)],
    "product_search": [(r"\brecommend", 3), (r"\bsuggest", 3), (r"\blooking for\b", 2),
                       (r"\bshow me\b", 2), (r"\bfind\b", 1), (r"\bbuy\b", 1), (r"\bneed (a|an|some)\b", 2),
                       (r"\b(under|below|less than|within|budget)\s*(₹|rs\.?|inr)?\s*\d", 2),
                       (r"\b(shoes?|sneakers?|trainers?|shirts?|t-?shirts?|jeans|jackets?|backpacks?|bags?|"
                        r"caps?|watch(es)?|wallets?|footwear|apparel|accessor(y|ies))\b", 1),
                       (r"\b(black|white|blue|grey|gray|brown|red|beige|navy|green|olive)\b", 1),
                       (r"\bproducts?\b", 1)],
    "analytics": [(r"\bsegments?\b", 3), (r"\bclusters?\b", 3), (r"\bpersonas?\b", 3),
                  (r"price[- ]sensitiv", 3), (r"\bwhat drives\b|\bdrivers?\b", 3),
                  (r"\bconversion\b", 2), (r"\bwhich customers?\b|\bcustomer (group|base)\b", 2),
                  (r"\bpurchase likelihood\b|\bpredict", 2), (r"\binsights?\b", 2)],
    "review_summary": [(r"\bsummar(y|ise|ize)", 3), (r"\btop (three|3|two|2)\b", 2),
                       (r"\bwhy (they|these|it) fit", 3), (r"\bretrieved\b", 2), (r"\bcompare\b", 1)],
    "calculator": [(r"\bcalculate|\bcompute", 3), (r"\d+\s*%\s*(off|discount)?\s*(on|of)\s*(₹|rs\.?)?\s*\d", 4),
                   (r"\b(after|with)\s*(an?\s+)?\d+\s*%", 3), (r"^\s*[\d\.\s\+\-\*/\(\)x×]+\s*$", 5),
                   (r"\bhow much\b.*\d", 1)],
}
PRIORITY = ["calculator", "review_summary", "analytics", "policy_qa", "product_search"]

BLOCK_PATTERNS = [r"ignore (all|any|the|previous|prior|above).{0,20}instructions",
                  r"(reveal|show|print|tell).{0,30}(system prompt|api key|password|secret)",
                  r"\bjailbreak\b", r"\b(credit card|cvv|otp) (number|details)\b"]

ROUTER_PROMPT = """Classify the retail assistant request into exactly one tool.
Tools: {tools}
If none fits, use "none". Return JSON: {{"tool": str, "reason": str}}"""


def guardrail(query: str):
    q = (query or "").strip()
    if not q:
        return "empty query"
    if len(q) > MAX_QUERY_CHARS:
        return f"query longer than {MAX_QUERY_CHARS} characters"
    for p in BLOCK_PATTERNS:
        if re.search(p, q.lower()):
            return "request blocked by safety guardrail"
    return None


def score_rules(query: str) -> dict:
    q = query.lower()
    scores = {}
    for tool, rules in RULES.items():
        fired = [(p, w) for p, w in rules if re.search(p, q)]
        scores[tool] = {"score": sum(w for _, w in fired), "fired": [p for p, _ in fired]}
    return scores


def plan(query: str, scores: dict) -> tuple:
    """Return (list_of_tools, reason). Bounded to MAX_TOOL_CALLS."""
    s = {t: v["score"] for t, v in scores.items()}
    if s["calculator"] >= 3 and analytics.discount_pattern(query) or s["calculator"] >= 5:
        return ["calculator"], "numeric discount/arithmetic pattern"
    if s["review_summary"] >= 3:
        return ["review_summary"], "summarise retrieved products"
    if s["analytics"] >= 3:
        return ["analytics"], "segment / ML insight keywords"
    product_intent = s["product_search"] >= 3
    if s["policy_qa"] >= 3 and product_intent and re.search(r"\band\b|\balso\b|\?.+\?", query.lower()):
        return ["product_search", "policy_qa"], "multi-intent: product request + policy question"
    best = max(PRIORITY, key=lambda t: (s[t], -PRIORITY.index(t)))
    if s[best] == 0:
        return [], "no rule fired"
    if s["policy_qa"] >= 3 and s["policy_qa"] >= s["product_search"]:
        return ["policy_qa"], "policy keywords dominate"
    return [best], f"highest rule score ({best}={s[best]})"


def llm_route(query: str) -> tuple:
    def fb():
        return {"tool": "none", "reason": "offline: no LLM router"}
    out, meta = llm.chat_json(ROUTER_PROMPT.format(tools=json.dumps(TOOLS)), query, fb)
    tool = out.get("tool")
    return ([tool] if tool in TOOLS else []), f"LLM router: {out.get('reason', '')}", meta


class Assistant:
    def __init__(self, verbose: bool = True, log_path=None):
        self.verbose = verbose
        self.last_retrieval = None          # memory used by review_summary
        self.log_path = log_path or (config.LOGS_DIR / "assistant.jsonl")

    # ---- tools ----
    def _run_tool(self, tool: str, query: str) -> dict:
        if tool == "product_search":
            res = rag.recommend(query)
            self.last_retrieval = res
            return res
        if tool == "policy_qa":
            return policy_qa.answer(query)
        if tool == "analytics":
            return analytics.analytics(query)
        if tool == "calculator":
            return analytics.calculator(query)
        if tool == "review_summary":
            if self.last_retrieval and self.last_retrieval.get("results"):
                base_q, results = self.last_retrieval["query"], self.last_retrieval["results"]
            else:
                base_q = query
                results = rag.retrieve(query)["results"]
            out = rag.summarize_products(base_q, results)
            out["based_on_query"] = base_q
            return out
        raise ValueError(f"unknown tool {tool}")

    def _call_with_retry(self, tool, query, trace):
        for attempt in (1, 2):
            try:
                return self._run_tool(tool, query), None
            except Exception as e:
                err = llm.redact(f"{type(e).__name__}: {e}")
                trace.append({"stage": "tool_error", "tool": tool, "attempt": attempt, "error": err})
        return None, err

    # ---- formatting ----
    @staticmethod
    def _format(tool: str, res: dict) -> tuple:
        if tool == "product_search":
            if not res["recommendations"]:
                return res["summary"], []
            lines = [res.get("summary", "")]
            for i, r in enumerate(res["recommendations"], 1):
                lines.append(f"{i}. {r['title']} [{r['doc_id']}] - Rs. {r['price']:.0f}: {r['why']}")
            if res.get("caveats"):
                lines.append(f"Note: {res['caveats']}")
            return "\n".join(lines), res["supporting_ids"]
        if tool == "policy_qa":
            return policy_qa.format_answer(res), res["citations"]
        if tool == "review_summary":
            lines = [res.get("overall", "")]
            for p in res["products"]:
                lines.append(f"- [{p['doc_id']}] {p['summary']} Why it fits: {p['why_it_fits']}")
            return "\n".join(lines), res["supporting_ids"]
        return res["answer"], res.get("sources", [])

    def ask(self, query: str) -> dict:
        t0 = time.time()
        trace = [{"stage": "received", "query": query}]
        blocked = guardrail(query)
        if blocked:
            trace.append({"stage": "guardrail", "result": "blocked", "reason": blocked})
            out = {"query": query, "route": ["blocked"], "answer": f"Sorry, I can't help with that ({blocked}). "
                   "I can recommend products, answer policy questions, share customer insights or do price maths.",
                   "citations": [], "trace": trace, "tool_outputs": {}}
            return self._finish(out, t0)
        trace.append({"stage": "guardrail", "result": "passed"})
        scores = score_rules(query)
        trace.append({"stage": "rule_scores", "scores": {t: v["score"] for t, v in scores.items()},
                      "fired": {t: v["fired"] for t, v in scores.items() if v["fired"]}})
        tools, reason = plan(query, scores)
        router = "rules"
        if not tools and not config.use_offline():
            tools, reason, _ = llm_route(query)
            router = "llm"
        tools = tools[:MAX_TOOL_CALLS]
        trace.append({"stage": "route", "router": router, "tools": tools or ["clarify"], "reason": reason})
        if not tools:
            out = {"query": query, "route": ["clarify"], "citations": [], "trace": trace, "tool_outputs": {},
                   "answer": "I'm not sure what you need. Try: a product request (e.g. 'black sneakers under "
                             "Rs 3000'), a policy question (returns, refunds, shipping, exchange, warranty), "
                             "a customer-segment question, or a price calculation."}
            return self._finish(out, t0)
        parts, cites, outputs = [], [], {}
        for tool in tools:
            res, err = self._call_with_retry(tool, query, trace)
            if res is None:
                parts.append(f"[{tool}] temporarily unavailable ({err}).")
                continue
            outputs[tool] = res
            text, c = self._format(tool, res)
            step = {"stage": "tool", "tool": tool, "citations": c}
            if tool == "product_search":
                step.update(constraints={k: v for k, v in res["constraints"].items() if v},
                            relaxed=res["relaxed_filters"], status=res["status"],
                            retrieved=[(r["doc_id"], r["cosine"]) for r in res["results"]],
                            dropped_ids=res["llm"].get("dropped_ids", []))
            elif tool == "policy_qa":
                step.update(status=res["status"], hits=[(h["chunk_id"], h["score"]) for h in res["hits"][:3]],
                            decision=res["decision"], issues=res["issues"])
            llm_meta = res.get("llm") or {}
            if llm_meta:
                step["llm"] = {k: llm_meta.get(k) for k in ("backend", "model", "used_fallback", "error")
                               if k in llm_meta}
            trace.append(step)
            parts.append(text if len(tools) == 1 else f"[{tool}]\n{text}")
            cites += [x for x in c if x not in cites]
        trace.append({"stage": "answer", "n_citations": len(cites)})
        out = {"query": query, "route": tools, "answer": "\n\n".join(parts), "citations": cites,
               "trace": trace, "tool_outputs": outputs}
        return self._finish(out, t0)

    def _finish(self, out: dict, t0: float) -> dict:
        out["backend"] = config.backend_name()
        out["latency_s"] = round(time.time() - t0, 3)
        out["timestamp"] = datetime.now().isoformat(timespec="seconds")
        with open(self.log_path, "a", encoding="utf-8") as f:
            rec = {k: out[k] for k in ("timestamp", "query", "route", "citations", "backend", "latency_s")}
            rec["answer"] = out["answer"][:500]
            f.write(llm.redact(json.dumps(rec, ensure_ascii=False)) + "\n")
        if self.verbose:
            print_trace(out)
        return out


def print_trace(out: dict) -> None:
    print("=" * 78)
    print(f"USER: {out['query']}")
    for i, t in enumerate(out["trace"], 1):
        info = {k: v for k, v in t.items() if k != "stage"}
        print(f"  [{i}] {t['stage']:<12} {json.dumps(info, ensure_ascii=False, default=str)[:300]}")
    print(f"ROUTE: {' -> '.join(out['route'])} | backend={out['backend']} | {out['latency_s']}s")
    print("ASSISTANT:\n" + out["answer"])
    print("CITATIONS:", ", ".join(out["citations"]) or "none")
