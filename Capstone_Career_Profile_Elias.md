# Career Profile Entry — Intelligent Retail Decision Assistant (Capstone)

**Programme:** Professional Certificate Programme in Generative AI and Machine Learning (IITM)
**Project type:** Graded capstone, end-to-end AI system (individual)
**Timeline:** October–November 2026
**Status:** Completed and submitted (`Capstone_Graded Project_Elias.zip`)

---

## 1. One-line summary
Built an end-to-end retail AI prototype that combines classical machine learning (purchase and return prediction, customer segmentation), retrieval-augmented generation (FAISS + GPT-4o-mini) and an inspectable agent that routes each request to the right tool, with grounded answers, citations, guardrails and automated evaluation.

## 2. Problem and business context
A mid-sized online retailer (Shoes, Apparel, Accessories) wanted one assistant for business users and shoppers that could:
- predict which product views convert to purchases and what drives them;
- find customer segments, especially price-sensitive ones;
- recommend products that fit a shopper's need, budget and occasion;
- answer return, refund, exchange, shipping and warranty questions **only from policy documents**, with sources;
- decide automatically which tool should handle a free-text question.

## 3. What I built (by phase)

| Phase | Work done |
|---|---|
| **1. Data preparation** | Profiled 1,500 interaction records × 46 columns (250 customers, 300 product ids). Found and fixed hidden missing values ("NA" text) and a data-leakage risk (sentiment label derived from rating). Documented original vs engineered columns and built a 46-column data dictionary. |
| **2. Classical ML** | scikit-learn pipelines (imputation, one-hot encoding, scaling) with stratified train/test split and 5-fold cross-validation. Compared Dummy, Logistic Regression, Random Forest and Gradient Boosting for **purchase** and **return** prediction. Feature-engineering ablation, permutation importance, confusion matrices, ROC/PR-AUC. **K-Means customer segmentation** checked against Ward hierarchical clustering (elbow, silhouette, ARI, PCA). |
| **3. GenAI data enrichment** | Turned tabular rows into 1,497 retrieval-ready product documents (title, attributes, price context, tags, reviews, synonyms) and 10 sentence-level policy chunks with document ids. |
| **4. RAG + grounded answers** | OpenAI `text-embedding-3-small` embeddings in a **FAISS** index (cosine similarity, cached on disk). **Hybrid retrieval**: constraints parsed from the query (budget, type, colour, brand) used as metadata filters, then FAISS ranking and a transparent re-rank. GPT-4o-mini (temperature 0, JSON output) answers only from retrieved context. Validators drop invented product ids, restore catalogue prices, and remove citations or quotes not found in the evidence. Policy answers with exact quotes and doc ids; refuses questions the documents don't cover. |
| **5. Agent / controller** | 5 tools: product search, policy QA, analytics, review summary, calculator. Guardrails (empty, over-long or prompt-injection input) → weighted rule router (every decision printed in a trace) → multi-intent planning → LLM router only as fallback. At most 2 tool calls per query, retry once, then graceful fallback. Every query logged with API keys redacted. |
| **Evaluation & packaging** | 16 curated test queries with expected routes and checks, retrieval evaluation on 150 synthetic shopper queries, regression checks against thresholds and a saved baseline, 46 pytest tests (offline, deterministic, fake-LLM hallucination tests), CLI app (`ask` / `demo` / `eval`), auto-generated figures, filled report (.docx) and 2-page analysis PDF. |

## 4. Key results (final run with GPT-4o-mini)

| Area | Metric | Result |
|---|---|---|
| Purchase prediction | Random Forest test ROC-AUC / F1 | **0.67 / 0.65** (baseline 0.50) |
| Return prediction | Random Forest test ROC-AUC / PR-AUC | 0.61 / 0.42 (base rate 0.35) |
| Segmentation | K-Means, k = 4, silhouette | 0.28 |
| Business insight | Most price-sensitive segment | "Deal Seekers": 32% of customers, 76% of purchases at 25%+ discount, highest return rate |
| Product retrieval | Precision@5, hybrid vs semantic only | **0.98 vs 0.74** |
| Assistant | Pass rate on 16 curated queries | **100%** |
| Assistant | Routing accuracy / citation validity / grounded answers | **100% / 100% / 100%** |
| Quality | Automated tests | **46 / 46 passed** |

**Business findings:**
- Loyalty tier and income were the strongest purchase drivers: Gold/Platinum members convert about 62% of the time, vs about 40% for Bronze/Silver.
- Discounts of 25% or more roughly doubled the return rate.
- 4 segments with actions for each: coupons for Deal Seekers, loyalty rewards for Loyal Converters, new arrivals for Premium Full-Price Buyers, re-engagement for Low-Engagement Browsers.

## 5. Tech stack
- **Language / environment:** Python 3.14, Jupyter (VS Code), Windows PowerShell, Git/GitHub
- **Data / ML:** pandas, NumPy, scikit-learn (Pipeline, ColumnTransformer, Random Forest, Gradient Boosting, Logistic Regression, K-Means, Agglomerative clustering, PCA, permutation importance), matplotlib
- **GenAI / RAG:** OpenAI API (Vocareum endpoint), GPT-4o-mini, text-embedding-3-small, FAISS, prompt engineering, structured JSON output, TF-IDF offline fallback
- **Agentic AI:** rule-based + LLM-fallback routing, tool registry, guardrails, bounded steps, decision traces
- **Engineering / quality:** modular Python (16 single-purpose modules), pytest with mocks and fake LLM clients, regression checks, logging (JSONL), CLI (argparse), secret redaction
- **Reporting:** python-docx, reportlab, auto-generated figures and README

## 6. Skills demonstrated
- End-to-end ML system design: business problem → data → models → GenAI → agent → evaluation
- Leakage detection and leakage-safe feature selection
- Model selection with cross-validation; choosing metrics for balanced vs imbalanced targets (ROC-AUC, PR-AUC, F1)
- Unsupervised segmentation and turning clusters into business actions
- Retrieval engineering: document design, hybrid search, metadata filtering, confidence thresholds
- Hallucination control: grounded prompts, output validation, citation and quote checking, refusals
- Agent design with explicit, explainable routing and guardrails
- Evaluating LLM systems: curated test sets, retrieval metrics (precision@k, MRR), regression checks
- Testing AI code reliably (offline deterministic tests, fake model clients)
- Debugging across environments (Windows paths, API fallbacks, notebook execution order)
- Technical documentation and reporting

## 7. Problems found and fixed (good interview stories)
1. **Hidden missing values:** pandas silently turned the text "NA" in `size` (270 rows) into nulls. Fixed by reading explicitly and imputing as "Unknown".
2. **Data leakage:** the sentiment label was a direct mapping of rating, and rating 5 always meant purchased. Excluded post-outcome and checkout fields from the purchase model.
3. **Weak clustering:** spending-history features barely differed between customers (silhouette ≈ 0.12). Switching to behavioural price-sensitivity features raised it to 0.28.
4. **Wrong retrieval matches:** "gift card" matched wallets, and "cancellation policy" matched the warranty policy through the generic word "policy". Fixed with confidence rules, stop-words and thresholds; both are now correctly refused.
5. **Off-type results:** filter relaxation could return caps for a watch request. Now only colour and brand are relaxed, and no-match answers state the cheapest available price.
6. **LLM hallucination tests:** a fake model returned an invented product id, a wrong price and a fake policy citation; the validators caught all three.
7. **Production robustness:** a wrong or expired API key now triggers a clear warning and an offline fallback instead of a crash.
8. **Cross-platform bug:** Windows backslash paths broke one citation check (94% → 100% after the fix).

## 8. Resume bullets (pick 3–5)
- Built an end-to-end **Intelligent Retail Decision Assistant** combining classical ML, RAG and an agentic controller; achieved **100% routing accuracy and 100% grounded, cited answers** on a 16-query evaluation suite.
- Designed **hybrid retrieval** (metadata filters + FAISS + re-ranking) over 1,497 product documents, raising precision@5 from **0.74 to 0.98** compared with semantic search alone.
- Developed leakage-safe scikit-learn pipelines comparing 4 models with cross-validation; the Random Forest purchase model reached **ROC-AUC 0.67** and identified loyalty tier and income as key conversion drivers.
- Segmented 250 customers with **K-Means** (validated with silhouette and Ward clustering) and found a price-sensitive **"Deal Seekers"** segment (32% of customers, 76% of purchases at 25%+ discount).
- Implemented **hallucination controls** for GPT-4o-mini: context-only prompts, JSON output validation, citation and quote checks, and refusals for unsupported policy questions.
- Built an inspectable **agent** with 5 tools, guardrails against prompt injection, bounded steps with retries, and full decision traces.
- Wrote **46 automated tests** (including fake-LLM hallucination tests), regression checks and a CLI, and packaged the work with auto-generated figures and reports.

## 9. Short project description (for LinkedIn / portfolio)
> **Intelligent Retail Decision Assistant**: an end-to-end AI prototype for an online retailer. Classical ML predicts purchases and returns and segments customers by price sensitivity. A RAG layer (OpenAI embeddings + FAISS + GPT-4o-mini) recommends products and answers policy questions using only retrieved evidence, with citations. An inspectable agent routes each request to the right tool with guardrails and decision traces. Evaluated with curated test queries (100% pass), retrieval metrics (precision@5 0.98) and 46 automated tests.

## 10. Keywords (for ATS / search)
Machine Learning, Generative AI, RAG, Retrieval-Augmented Generation, LLM, GPT-4o-mini, OpenAI API, Embeddings, FAISS, Vector Search, Hybrid Search, Prompt Engineering, Hallucination Mitigation, Agentic AI, Tool Routing, Guardrails, scikit-learn, Random Forest, Gradient Boosting, Logistic Regression, K-Means, Clustering, Customer Segmentation, Feature Engineering, Data Leakage, Cross-Validation, ROC-AUC, Precision@K, MRR, LLM Evaluation, pytest, Python, pandas, Jupyter, Retail Analytics, E-commerce
