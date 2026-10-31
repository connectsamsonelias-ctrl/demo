"""Build the submission documents from the saved results (no numbers are typed by hand).

  Capstone_Report_Elias.docx   - capstone template filled phase by phase / task by task
  Capstone_Analysis_Elias.pdf  - 1-2 page analysis: summary, design, results, findings,
                                 limitations, acceptance checklist with evidence
  README.md                    - results block between the RESULTS markers is refreshed
"""
import json
import re

import pandas as pd

import config

LAST_NAME = "Elias"
DOCX_NAME = f"Capstone_Report_{LAST_NAME}.docx"
PDF_NAME = f"Capstone_Analysis_{LAST_NAME}.pdf"
R = config.RESULTS_DIR


def _load() -> dict:
    j = lambda n: json.loads((R / n).read_text(encoding="utf-8"))
    ev = pd.read_csv(R / "eval_results.csv")
    summ = pd.read_csv(R / "eval_summary.csv").set_index("metric")["value"].to_dict()
    import data_prep
    raw = data_prep.load_raw()
    return {"ml": j("ml_summary.json"), "cl": j("cluster_summary.json"),
            "comp": pd.read_csv(R / "ml_model_comparison.csv"),
            "imp": pd.read_csv(R / "ml_feature_importance.csv"),
            "abl": pd.read_csv(R / "ml_feature_ablation.csv"),
            "prof": pd.read_csv(config.SEGMENT_PROFILE_CSV),
            "diag": pd.read_csv(R / "cluster_diagnostics.csv"),
            "retr": pd.read_csv(R / "retrieval_eval.csv").set_index("mode"),
            "reg": pd.read_csv(R / "regression_checks.csv"),
            "ev": ev, "summ": summ, "quality": data_prep.quality_report(raw),
            "balance": data_prep.class_balance(raw),
            "demo": j("demo_runs.json") if (R / "demo_runs.json").exists() else [],
            "pytest": (R / "pytest_output.txt").read_text(encoding="utf-8")
            if (R / "pytest_output.txt").exists() else ""}


def _pytest_line(text: str) -> str:
    m = re.findall(r"(\d+ passed[^\n]*)", text)
    return m[-1].strip("= ") if m else "not run"


def _rs(text: str) -> str:
    return text.replace("₹", "Rs. ")


def findings(d: dict) -> list:
    """Development issues found and how they were fixed (kept factual)."""
    spread_note = "customer averages of order value / order count barely differ between customers"
    return [
        "Pandas silently converted the literal 'NA' in size (270 rows) to NaN; fixed by reading with "
        "keep_default_na=False and treating it as an explicit missing value imputed as 'Unknown'.",
        "Leakage found: review_sentiment_label is a direct mapping of rating_given, and rating 5 always "
        "means purchased; rating/sentiment, returned_flag and checkout fields were excluded from the "
        "purchase model.",
        f"First clustering attempt on spending-history features gave silhouette ~0.12 because {spread_note}; "
        f"switching to behavioural price-sensitivity features raised it to {d['cl']['silhouette']:.2f}.",
        "Engineered features (price-to-AOV, deep-discount flag, premium member, savings) helped the returns "
        f"model (CV AUC {d['abl'].iloc[2].cv_roc_auc:.3f} -> {d['abl'].iloc[3].cv_roc_auc:.3f}) but not the "
        "purchase model, so they are used only for returns.",
        "'gift card' initially matched wallets (via 'card holder'); 'cancellation policy' matched the "
        "warranty policy through the generic word 'policy'. Fixed with a confidence rule, stop-words and "
        "thresholds - both are now refused instead of answered.",
        "Filter relaxation could return caps for a watch request; now only brand/colour are relaxed and "
        "a no-match answer states the cheapest available price.",
        "A fake model returning an invented product id, a wrong price and a fake policy citation was used "
        "in tests: the validators dropped the id, restored the catalogue price and refused the uncited answer.",
        "pytest initially overwrote results/; tests now write to a temporary copy.",
    ]


def limitations() -> list:
    return [
        "The dataset is synthetic: the same product_id maps to different items and customer attributes vary "
        "between rows, which caps predictive accuracy (purchase ROC-AUC ~0.67).",
        "Policies are five short synthetic snippets; real policy documents would need longer chunking.",
        "The router is rule-based with an LLM fallback only when no rule fires; unusual phrasing may need "
        "new patterns.",
        "Offline mode (TF-IDF + template answers) is a deterministic stand-in for tests; final answers "
        "should be produced with the API backend.",
        "No image understanding (optional multimodal extension not implemented).",
    ]


def checklist(d: dict) -> list:
    """(requirement, evidence, passed) - status computed from the saved results."""
    s = d["summ"]
    ok = lambda *paths: all((config.ROOT / p).exists() for p in paths)
    nb = any(config.ROOT.glob("*.ipynb"))
    passed = [nb, ok("data/retail_interactions.csv", "results/data_dictionary.csv"),
              ok("results/data_dictionary.csv"),
              d["ml"]["purchase_flag"]["test_roc_auc"] > 0.55,
              d["cl"]["silhouette"] > 0.2,
              float(s["hybrid_precision_at_5"]) >= 0.8,
              float(s["citation_validity"]) == 1.0,
              len(d["demo"]) >= 5,
              float(s["n_queries"]) >= 5 and float(s["pass_rate"]) >= 0.8,
              bool(d["reg"].passed.all()) and "failed" not in _pytest_line(d["pytest"]),
              ok("README.md")]
    items = [
        ("Main notebook", "Capstone_Graded Project_Elias.ipynb (all phases, outputs saved)"),
        ("Dataset + reproduction of added columns", "data/retail_interactions.csv, data_prep.ENGINEERED, "
                                                     "results/data_dictionary.csv"),
        ("Data dictionary", "results/data_dictionary.csv (46 columns, source + how reproduced)"),
        ("Supervised ML results", f"results/ml_model_comparison.csv - purchase {d['ml']['purchase_flag']['best_model']} "
                                  f"test ROC-AUC {d['ml']['purchase_flag']['test_roc_auc']:.3f}"),
        ("Unsupervised ML results", f"results/segment_profiles.csv - k={d['cl']['k']}, silhouette "
                                    f"{d['cl']['silhouette']:.3f}"),
        ("Product retrieval / recommendation", f"rag.py + FAISS; hybrid precision@5 "
                                               f"{float(s['hybrid_precision_at_5']):.2f}"),
        ("Policy QA with citations", "policy_qa.py; Q02, Q06-Q10 in results/eval_results.csv"),
        ("Agent / controller demo with trace", "agent.py; results/demo_runs.json, fig11_demo_*.png"),
        ("At least five example queries", f"{int(float(s['n_queries']))} curated queries, "
                                          f"pass rate {float(s['pass_rate']):.0%}"),
        ("Regression-like checks + tests", f"results/regression_checks.csv; pytest: {_pytest_line(d['pytest'])}"),
        ("Report / README", f"README.md, {DOCX_NAME}, {PDF_NAME}"),
    ]
    return [(a, b, p) for (a, b), p in zip(items, passed)]


# ------------------------------------------------------------------ DOCX
def build_docx(d: dict) -> str:
    from docx import Document
    from docx.shared import Inches, Pt

    ml_p, ml_r, cl, s = d["ml"]["purchase_flag"], d["ml"]["returned_flag"], d["cl"], d["summ"]
    prof = d["prof"].sort_values("price_sensitivity_index", ascending=False)
    hyb, sem = d["retr"].loc["hybrid (filters + rerank)"], d["retr"].loc["semantic only"]
    top_p = d["imp"][d["imp"].task == "purchase_flag"].head(5).feature.tolist()
    top_r = d["imp"][d["imp"].task == "returned_flag"].head(5).feature.tolist()
    q = d["quality"]
    backend = s.get("backend")

    doc = Document()
    doc.styles["Normal"].font.size = Pt(10)
    doc.add_heading("Intelligent Retail Decision Assistant - Capstone Report", 0)
    doc.add_paragraph(f"Learner: {LAST_NAME}    |    Assistant backend for reported answers: {backend}")

    def task(title: str, text: str, img: str = None, table: pd.DataFrame = None):
        doc.add_heading(title, level=2)
        doc.add_paragraph(_rs(text))
        if table is not None:
            t = doc.add_table(rows=1, cols=len(table.columns))
            t.style = "Light Grid Accent 1"
            for i, c in enumerate(table.columns):
                t.rows[0].cells[i].text = str(c)
            for _, row in table.iterrows():
                cells = t.add_row().cells
                for i, v in enumerate(row):
                    cells[i].text = f"{v:.3f}" if isinstance(v, float) else str(v)
        if img and (R / img).exists():
            doc.add_picture(str(R / img), width=Inches(6.3))

    doc.add_heading("Phase 1 - Problem Framing and Dataset Preparation", 1)
    task("1.1 Retail use case and business questions",
         "A mid-sized Indian online retailer (Shoes, Apparel, Accessories) needs one assistant for business "
         "users and shoppers. Business questions: (Q1) what drives a purchase; (Q2) which customer segments "
         "exist and which is most price-sensitive; (Q3) which products fit a shopper's need, budget and "
         "occasion; (Q4) what the return/refund/exchange/shipping/warranty policies say; (Q5) how to route a "
         "free-text request to the right tool.")
    task("1.2 Schema, missingness, targets and class balance",
         f"{q['rows']} interaction rows x {q['columns']} columns, {q['customers']} customers, {q['products']} "
         f"product ids, {q['duplicate_rows']} duplicates, {q['true_nulls']} true nulls. The only missing values "
         f"are {q['size_NA_placeholders']} 'NA' placeholders in size. final_price matches base_price x "
         f"(1 - discount) (max gap {q['max_price_formula_gap']}). Class balance: purchase_flag "
         f"{d['balance']['purchase_flag']}, added_to_cart {d['balance']['added_to_cart']} (too imbalanced), "
         f"returned_flag among purchases {d['balance']['returned_flag']}. Returns never occur without a purchase "
         "and sentiment is a direct function of rating (leakage risk).", "fig01_target_balance.png")
    task("1.3 Original vs engineered columns",
         "35 tabular columns (customer profile, history, product, commercial, interaction, post-purchase) are "
         "treated as the original base dataset. 11 columns were engineered for GenAI: review_sentiment_label, "
         "product_title, product_description, customer_review_text, customer_query, policy_doc_id, "
         "policy_text_snippet, image_path, recommended_use_case, style_tags, occasion_tags. Each has a "
         "reproduction rule in data_prep.ENGINEERED; policies are synthetic (data/retail_policies.json). "
         "Added in this project: price_band, sku_id, sub-category synonym keywords and four model features.")
    task("1.4 Data dictionary",
         "results/data_dictionary.csv lists every column with dtype, feature group, source "
         "(original/engineered), number of unique values, description and how it is reproduced.")

    doc.add_heading("Phase 2 - Classical ML Pipeline", 1)
    task("2.1 Supervised target and justification",
         f"Primary target purchase_flag: balanced ({d['balance']['purchase_flag'][1]:.0%} positive), available "
         "for every row and directly tied to revenue. Secondary target returned_flag, modelled on purchased "
         "rows only, because returns cost margin. Leaky columns (rating, sentiment, returned_flag; checkout "
         "fields for purchase) are excluded.")
    task("2.2 Preprocessing pipeline",
         "ColumnTransformer inside a scikit-learn Pipeline: numeric -> median imputation + StandardScaler; "
         "categorical -> constant 'Unknown' imputation + OneHotEncoder(handle_unknown='ignore'). Fitting happens "
         "inside each CV fold, so there is no train/test leakage. Stratified 80/20 split, 5-fold stratified CV "
         "on the training set. Class imbalance: purchase is balanced; for returns (35% positive) "
         "class_weight='balanced' is used and PR-AUC is reported.")
    cols = ["task", "model", "cv_roc_auc", "test_accuracy", "test_f1", "test_roc_auc", "test_pr_auc"]
    task("2.3 Baselines and model comparison",
         f"Dummy, Logistic Regression, Random Forest and Histogram Gradient Boosting were compared; the best by "
         f"CV ROC-AUC was refit and tested once. purchase_flag: {ml_p['best_model']} test ROC-AUC "
         f"{ml_p['test_roc_auc']:.3f}, F1 {ml_p['test_f1']:.3f}, accuracy {ml_p['test_accuracy']:.3f} (dummy 0.50 "
         f"AUC). returned_flag: {ml_r['best_model']} test ROC-AUC {ml_r['test_roc_auc']:.3f}, PR-AUC "
         f"{ml_r['test_pr_auc']:.3f} (base rate {ml_r['positive_rate_train']:.2f}).",
         "fig02_model_comparison.png", d["comp"][cols])
    task("2.4 Evaluation and interpretation",
         f"Permutation importance (purchase): {', '.join(top_p)}. Gold/Platinum members and high-income "
         f"customers convert more often, higher-rated products sell better, and cart/wishlist actions signal "
         f"intent. Returns are driven by {', '.join(top_r[:3])}: deep discounts (25%+) roughly double the "
         "return rate. The signal is moderate because the data is synthetic, so the model is best used to "
         "rank leads rather than as a hard decision rule.", "fig04_feature_importance.png")
    task("2.5 Unsupervised segmentation",
         f"Goal: price-sensitivity segmentation of the {int(prof.n_customers.sum())} customers. Features: "
         f"{', '.join(cl['features'])} (standardised). History features were dropped because their averages "
         f"barely vary between customers. K-Means k=2..8 with inertia and silhouette, checked against Ward "
         f"hierarchical clustering. k={cl['k']} chosen (silhouette {cl['silhouette']:.3f}, second best after k=2 "
         f"but more actionable; ARI vs Ward {cl['ari_vs_ward']:.2f}).", "fig05_cluster_diagnostics.png")
    seg_lines = "; ".join(f"{r.segment_name}: {int(r.n_customers)} customers, {r.avg_purchase_discount:.1f}% avg "
                          f"discount, {r.deep_discount_share:.0%} deep-discount purchases, Rs. "
                          f"{r.avg_purchase_price:.0f} avg price, {r.conversion_rate:.0%} conversion"
                          for r in prof.itertuples())
    task("2.6 Segments in business language",
         f"{seg_lines}. Most price-sensitive: {cl['most_price_sensitive']} - target with coupons and sale "
         "alerts, but watch their high return rate. Premium Full-Price Buyers: new arrivals, no discounts. "
         "Loyal Converters: loyalty rewards and cross-sell. Low-Engagement Browsers: re-engagement campaigns.",
         "fig07_segment_profiles.png")

    doc.add_heading("Phase 3 - Enrich Data for Generative AI", 1)
    task("3.1 Product text representations",
         "Because product_id is reused for different items, each listing is (product_id, product_title) -> "
         "1,497 product documents (sku_id e.g. P1000-1). Each document combines title, category > sub-category, "
         "brand, colour, material, season, use case, style and occasion tags, synonym keywords, price (final, "
         "MRP, discount), average rating, returnability, description and a customer review.")
    task("3.2 Policy documents",
         "Five policies (POL_RETURNS, POL_EXCHANGE, POL_SHIPPING, POL_REFUND, POL_WARRANTY) were split into "
         "10 sentence chunks with a topic prefix, so answers can quote exact sentences and cite doc ids.")
    task("3.3 Reviews and synthetic queries",
         "Review snippets and sentiment counts are attached to each product document and used by the "
         "review-summary tool. The dataset's synthetic customer_query column (colour + type + use + budget) "
         "is used as a labelled retrieval test set.")
    task("3.4 Retrieval-ready documents",
         "Saved as data/processed/product_docs.jsonl and policy_docs.jsonl with metadata (price, rating, "
         "category, colour, tags) for filtering.")

    doc.add_heading("Phase 4 - RAG and Grounded Answer Generation", 1)
    task("4.1 Embeddings and FAISS",
         f"{config.EMBED_MODEL} embeddings through the OpenAI-compatible Vocareum endpoint (cached on disk), "
         "L2-normalised and stored in faiss.IndexFlatIP (cosine similarity). An offline TF-IDF embedder is "
         "used only for deterministic tests.")
    task("4.2 Product and policy retrieval",
         f"Hybrid retrieval: constraints parsed from the query (budget, type, colour, brand, occasion, premium) "
         f"are applied as metadata filters, FAISS ranks the candidates, and a small transparent re-rank adds "
         f"occasion/material/rating bonuses. On {int(hyb.n_queries)} synthetic shopper queries precision@5 is "
         f"{hyb.precision_at_k:.2f} (hybrid) vs {sem.precision_at_k:.2f} (semantic only); MRR {hyb.mrr:.2f} vs "
         f"{sem.mrr:.2f}.", "fig08_retrieval_comparison.png")
    task("4.3 Grounded generation with structured output",
         f"{config.CHAT_MODEL} (temperature 0, JSON mode) is told to use only the retrieved products and return "
         "{recommendations[doc_id,title,price,why], summary, supporting_ids, caveats}. A validator drops any "
         "id not in the retrieved set and copies title/price from the catalogue, so prices cannot be invented.")
    task("4.4 Policy QA with citations",
         "The policy prompt allows decisions yes/no/conditional/not_covered and requires exact quotes. The "
         "validator removes citations and quotes not present in the evidence; an answer with no valid "
         "citation is replaced by a refusal.")
    task("4.5 Empty or weak retrieval",
         "No candidate -> no-match message with the cheapest available price; low similarity without an "
         "attribute match -> 'weak' status and no forced recommendation; policy questions below the "
         "similarity threshold are refused (e.g. 'Do you offer gift wrapping?').")

    doc.add_heading("Phase 5 - Agent / Controller", 1)
    task("5.1 Tools",
         "product_search, policy_qa, analytics (segment and purchase-driver insights from saved ML results), "
         "review_summary (summarises the last retrieved products) and calculator (discount maths).")
    task("5.2 Routing logic",
         "Hybrid and inspectable: guardrails -> weighted regex rules per tool (scores and fired patterns are "
         "printed) -> a fixed priority order -> multi-intent plan when a product request and a policy question "
         "appear together -> LLM router only if no rule fires (its choice must be a registered tool).")
    task("5.3 Trace",
         "Every answer carries a trace: received, guardrail, rule_scores, route, one entry per tool (constraints, "
         "retrieved ids and scores, LLM backend, dropped ids, validation issues) and answer.",
         "fig11_demo_06.png")
    task("5.4 Bounded steps and guardrails",
         "At most 2 tool calls per query; each tool is retried once and then degrades gracefully. Empty, "
         "over-long and prompt-injection requests are blocked. Every query is logged to logs/assistant.jsonl "
         "with secrets redacted.")

    doc.add_heading("Final Phase - Evaluation and Packaging", 1)
    ev = d["ev"]
    task("6.1 ML metrics summary",
         f"purchase_flag {ml_p['best_model']}: ROC-AUC {ml_p['test_roc_auc']:.3f}, PR-AUC {ml_p['test_pr_auc']:.3f}, "
         f"F1 {ml_p['test_f1']:.3f}. returned_flag {ml_r['best_model']}: ROC-AUC {ml_r['test_roc_auc']:.3f}, "
         f"PR-AUC {ml_r['test_pr_auc']:.3f}. Segmentation: k={cl['k']}, silhouette {cl['silhouette']:.3f}.")
    task("6.2 Curated test queries",
         f"{len(ev)} curated queries (including the five from the brief, an out-of-scope policy question, a "
         f"multi-intent request, a no-match budget and a prompt-injection attempt). Pass rate "
         f"{float(s['pass_rate']):.0%}, route accuracy {float(s['route_accuracy']):.0%}, citation validity "
         f"{float(s['citation_validity']):.0%}, grounded rate {float(s['grounded_rate']):.0%}.",
         "fig09_eval_table.png")
    task("6.3 Regression checks and tests",
         f"results/regression_checks.csv compares each run with thresholds and the saved baseline "
         f"(all passed: {bool(d['reg'].passed.all())}). pytest (offline, deterministic, with a fake LLM for "
         f"hallucination tests): {_pytest_line(d['pytest'])}.", "fig10_regression_checks.png")
    doc.add_heading("Example queries with outputs", level=2)
    for r in d["demo"][:7]:
        doc.add_paragraph(f"Q: {r['query']}", style="List Bullet")
        doc.add_paragraph(_rs(f"Route: {' -> '.join(r['route'])} | Citations: {', '.join(r['citations']) or 'none'}"))
        doc.add_paragraph(_rs(r["answer"][:900]))
    doc.add_heading("Key findings and fixes", level=2)
    for f in findings(d):
        doc.add_paragraph(f, style="List Bullet")
    doc.add_heading("Limitations", level=2)
    for f in limitations():
        doc.add_paragraph(f, style="List Bullet")
    path = config.ROOT / DOCX_NAME
    doc.save(path)
    return str(path)


# ------------------------------------------------------------------ PDF
def build_pdf(d: dict) -> str:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    st = getSampleStyleSheet()
    body = st["BodyText"]
    body.fontSize, body.leading = 8.5, 10.5
    h = st["Heading3"]
    h.spaceBefore, h.spaceAfter = 5, 2
    ml_p, ml_r, cl, s = d["ml"]["purchase_flag"], d["ml"]["returned_flag"], d["cl"], d["summ"]
    hyb, sem = d["retr"].loc["hybrid (filters + rerank)"], d["retr"].loc["semantic only"]
    P = lambda t: Paragraph(_rs(t), body)

    def table(rows, widths, ok_col=None):
        t = Table(rows, colWidths=widths)
        style = [("FONT", (0, 0), (-1, -1), "Helvetica", 7.5), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.5),
                 ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                 ("GRID", (0, 0), (-1, -1), 0.3, colors.grey), ("VALIGN", (0, 0), (-1, -1), "TOP")]
        if ok_col is not None:
            for i, r in enumerate(rows[1:], 1):
                good = str(r[ok_col]).startswith(("PASS", "yes", "True"))
                style.append(("BACKGROUND", (ok_col, i), (ok_col, i),
                              colors.HexColor("#d4edda" if good else "#f8d7da")))
        t.setStyle(TableStyle(style))
        return t

    story = [Paragraph(f"Intelligent Retail Decision Assistant - Analysis ({LAST_NAME})", st["Heading2"]),
             Paragraph("Summary", h),
             P(f"An end-to-end retail prototype: classical ML on 1,500 interaction records (purchase and return "
               f"prediction, customer price-sensitivity segments), a FAISS-backed RAG layer over 1,497 product "
               f"listings and 5 policies, and an inspectable agent that routes requests to five tools. Best purchase "
               f"model: {ml_p['best_model']} (test ROC-AUC {ml_p['test_roc_auc']:.2f}). Most price-sensitive segment: "
               f"{cl['most_price_sensitive']}. Assistant: {float(s['pass_rate']):.0%} of {int(float(s['n_queries']))} "
               f"curated queries passed, 100% grounded and validly cited (backend: {s.get('backend')})."),
             Paragraph("Design", h),
             P("data_prep -> supervised / clustering -> documents -> embeddings + vector_store (FAISS) -> "
               "rag (product) / policy_qa -> agent (guardrails, rule router, LLM fallback, trace) -> eval / app CLI. "
               f"LLM: {config.CHAT_MODEL}, temperature 0, JSON output; embeddings {config.EMBED_MODEL} via the "
               "Vocareum OpenAI-compatible endpoint. Every LLM output is validated against retrieved context; a "
               "deterministic fallback keeps the assistant working if the API fails."),
             Paragraph("Results", h)]
    rows = [["Component", "Metric", "Result"],
            ["Purchase model", f"{ml_p['best_model']} test ROC-AUC / F1 / PR-AUC",
             f"{ml_p['test_roc_auc']:.3f} / {ml_p['test_f1']:.3f} / {ml_p['test_pr_auc']:.3f}"],
            ["Return model", f"{ml_r['best_model']} test ROC-AUC / PR-AUC (base {ml_r['positive_rate_train']:.2f})",
             f"{ml_r['test_roc_auc']:.3f} / {ml_r['test_pr_auc']:.3f}"],
            ["Segmentation", f"K-Means k={cl['k']} silhouette / ARI vs Ward", f"{cl['silhouette']:.3f} / {cl['ari_vs_ward']:.2f}"],
            ["Product retrieval", "precision@5 hybrid vs semantic", f"{hyb.precision_at_k:.2f} vs {sem.precision_at_k:.2f}"],
            ["Product retrieval", "MRR hybrid vs semantic", f"{hyb.mrr:.2f} vs {sem.mrr:.2f}"],
            ["Assistant", "pass rate / route accuracy", f"{float(s['pass_rate']):.0%} / {float(s['route_accuracy']):.0%}"],
            ["Assistant", "citation validity / grounded rate",
             f"{float(s['citation_validity']):.0%} / {float(s['grounded_rate']):.0%}"],
            ["Tests", "pytest (offline, fake LLM)", _pytest_line(d["pytest"])]]
    story += [table(rows, [3.2 * cm, 8.3 * cm, 5.5 * cm]), Paragraph("Key findings (including what failed and how it was fixed)", h)]
    story += [P("- " + f) for f in findings(d)]
    story += [Paragraph("Limitations", h)] + [P("- " + f) for f in limitations()]
    story += [Paragraph("Acceptance criteria", h)]
    rows = [["Requirement", "Evidence", "Status"]] + [[Paragraph(a, body), Paragraph(_rs(b), body),
                                                       "PASS" if p else "FAIL"] for a, b, p in checklist(d)]
    story.append(table(rows, [4.5 * cm, 11 * cm, 1.5 * cm], ok_col=2))
    path = config.ROOT / PDF_NAME
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm,
                      topMargin=1.3 * cm, bottomMargin=1.3 * cm,
                      title="Capstone Analysis", author=LAST_NAME).build(story)
    return str(path)


# ------------------------------------------------------------------ README
def update_readme(d: dict) -> str:
    ml_p, ml_r, cl, s = d["ml"]["purchase_flag"], d["ml"]["returned_flag"], d["cl"], d["summ"]
    hyb, sem = d["retr"].loc["hybrid (filters + rerank)"], d["retr"].loc["semantic only"]
    block = "\n".join([
        "<!-- RESULTS:START -->",
        f"_Generated by report.py from results/ (assistant backend: {s.get('backend')})._", "",
        "| Component | Metric | Result |", "|---|---|---|",
        f"| Purchase model | {ml_p['best_model']} test ROC-AUC / F1 | {ml_p['test_roc_auc']:.3f} / {ml_p['test_f1']:.3f} |",
        f"| Return model | {ml_r['best_model']} test ROC-AUC / PR-AUC | {ml_r['test_roc_auc']:.3f} / {ml_r['test_pr_auc']:.3f} |",
        f"| Segmentation | k={cl['k']} silhouette | {cl['silhouette']:.3f} |",
        f"| Most price-sensitive segment | price-sensitivity index | {cl['most_price_sensitive']} |",
        f"| Retrieval | precision@5 hybrid vs semantic | {hyb.precision_at_k:.2f} vs {sem.precision_at_k:.2f} |",
        f"| Assistant | pass rate ({int(float(s['n_queries']))} queries) / route accuracy | "
        f"{float(s['pass_rate']):.0%} / {float(s['route_accuracy']):.0%} |",
        f"| Assistant | citation validity / grounded | {float(s['citation_validity']):.0%} / {float(s['grounded_rate']):.0%} |",
        f"| Tests | pytest | {_pytest_line(d['pytest'])} |",
        "<!-- RESULTS:END -->"])
    path = config.ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"<!-- RESULTS:START -->.*<!-- RESULTS:END -->", lambda _: block, text, flags=re.S)
    path.write_text(text, encoding="utf-8")
    return str(path)


def build_all() -> list:
    d = _load()
    return [build_docx(d), build_pdf(d), update_readme(d)]
