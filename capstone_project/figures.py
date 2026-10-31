"""Generate all report figures (PNG) into results/ from the saved CSV / JSON files."""
import json
import textwrap

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import config

R = config.RESULTS_DIR
GREEN, RED, BLUE, ORANGE, GREY = "#d4edda", "#f8d7da", "#2b6cb0", "#dd6b20", "#718096"


def _save(fig, name: str) -> str:
    path = R / name
    fig.savefig(path, dpi=130, bbox_inches="tight")
    plt.close(fig)
    return str(path)


def target_balance() -> str:
    df = pd.read_csv(config.CLEAN_CSV)
    fig, axes = plt.subplots(1, 4, figsize=(15, 3.2))
    for ax, t in zip(axes, ["purchase_flag", "added_to_cart", "returned_flag", "rating_given"]):
        sub = df[df.purchase_flag == 1] if t == "returned_flag" else df
        vc = sub[t].value_counts(normalize=True).sort_index()
        ax.bar(vc.index.astype(str), vc.values, color=BLUE)
        ax.set_title(t + (" (purchases)" if t == "returned_flag" else ""), fontsize=10)
        for i, v in enumerate(vc.values):
            ax.text(i, v + 0.01, f"{v:.0%}", ha="center", fontsize=8)
        ax.set_ylim(0, 1.05)
    fig.suptitle("Phase 1 - candidate targets and class balance")
    return _save(fig, "fig01_target_balance.png")


def model_comparison() -> str:
    comp = pd.read_csv(R / "ml_model_comparison.csv")
    fig, axes = plt.subplots(1, 2, figsize=(13, 3.8))
    for ax, (task, g) in zip(axes, comp.groupby("task", sort=False)):
        x = np.arange(len(g))
        for j, (col, color) in enumerate([("cv_roc_auc", GREY), ("test_roc_auc", BLUE),
                                          ("test_f1", ORANGE), ("test_pr_auc", "#38a169")]):
            ax.bar(x + (j - 1.5) * 0.2, g[col], 0.2, label=col, color=color)
        ax.set_xticks(x, g.model, rotation=12, fontsize=8)
        ax.axhline(0.5, ls="--", c="k", lw=0.8)
        ax.set_ylim(0, 1)
        ax.set_title(f"{task}")
        ax.legend(fontsize=7, ncol=2)
    fig.suptitle("Phase 2 - model comparison (5-fold CV on train, held-out test)")
    return _save(fig, "fig02_model_comparison.png")


def roc_curves() -> str:
    roc = pd.read_csv(R / "ml_roc_curve.csv")
    summ = json.loads((R / "ml_summary.json").read_text(encoding="utf-8"))
    fig, ax = plt.subplots(figsize=(5, 4.2))
    for task, g in roc.groupby("task", sort=False):
        ax.plot(g.fpr, g.tpr, label=f"{task} ({g.model.iloc[0]}, AUC {summ[task]['test_roc_auc']:.2f})")
    ax.plot([0, 1], [0, 1], "k--", lw=0.8)
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("ROC curves on the held-out test set")
    ax.legend(fontsize=8)
    return _save(fig, "fig03_roc_curves.png")


def feature_importance() -> str:
    imp = pd.read_csv(R / "ml_feature_importance.csv")
    fig, axes = plt.subplots(1, 2, figsize=(13, 4))
    for ax, (task, g) in zip(axes, imp.groupby("task", sort=False)):
        g = g.head(10).iloc[::-1]
        ax.barh(g.feature, g.importance, xerr=g["std"], color=BLUE)
        ax.set_title(f"{task}: permutation importance (ROC-AUC drop)", fontsize=10)
    return _save(fig, "fig04_feature_importance.png")


def cluster_diagnostics() -> str:
    d = pd.read_csv(R / "cluster_diagnostics.csv")
    k = json.loads((R / "cluster_summary.json").read_text(encoding="utf-8"))["k"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 3.5))
    a1.plot(d.k, d.inertia, "o-", color=BLUE)
    a1.set_title("Elbow: K-Means inertia")
    a2.plot(d.k, d.silhouette_kmeans, "o-", label="K-Means", color=BLUE)
    a2.plot(d.k, d.silhouette_ward, "s--", label="Ward hierarchical", color=ORANGE)
    a2.set_title("Silhouette score")
    a2.legend()
    for a in (a1, a2):
        a.axvline(k, c="k", ls=":", lw=1)
        a.set_xlabel("k")
    return _save(fig, "fig05_cluster_diagnostics.png")


def segments_pca() -> str:
    c = pd.read_csv(config.SEGMENTS_CSV)
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    for name, g in c.groupby("segment_name"):
        ax.scatter(g.pc1, g.pc2, s=18, alpha=0.75, label=f"{name} (n={len(g)})")
    ax.set_xlabel("PC1")
    ax.set_ylabel("PC2")
    ax.set_title("Customer segments (PCA of scaled clustering features)")
    ax.legend(fontsize=7)
    return _save(fig, "fig06_segments_pca.png")


def segment_profiles() -> str:
    p = pd.read_csv(config.SEGMENT_PROFILE_CSV).set_index("segment_name")
    cols = ["avg_purchase_discount", "deep_discount_share", "avg_purchase_price", "conversion_rate",
            "return_rate", "premium_share", "price_sensitivity_index"]
    z = (p[cols] - p[cols].mean()) / p[cols].std()
    fig, ax = plt.subplots(figsize=(10, 3.2))
    im = ax.imshow(z.values, cmap="RdBu_r", vmin=-1.6, vmax=1.6, aspect="auto")
    ax.set_xticks(range(len(cols)), cols, rotation=20, fontsize=8, ha="right")
    ax.set_yticks(range(len(z)), z.index, fontsize=8)
    for i in range(len(z)):
        for j, col in enumerate(cols):
            ax.text(j, i, f"{p[col].iloc[i]:.2f}", ha="center", va="center", fontsize=8)
    fig.colorbar(im, ax=ax, label="z-score vs other segments")
    ax.set_title("Segment profiles (cell = actual value, colour = relative level)")
    return _save(fig, "fig07_segment_profiles.png")


def retrieval_comparison() -> str:
    r = pd.read_csv(R / "retrieval_eval.csv")
    fig, ax = plt.subplots(figsize=(6.5, 3.6))
    x = np.arange(3)
    for j, row in enumerate(r.itertuples()):
        vals = [row.precision_at_k, row.hit_at_k, row.mrr]
        ax.bar(x + (j - 0.5) * 0.38, vals, 0.38, label=row.mode, color=[GREY, BLUE][j % 2])
        for i, v in enumerate(vals):
            ax.text(x[i] + (j - 0.5) * 0.38, v + 0.01, f"{v:.2f}", ha="center", fontsize=8)
    ax.set_xticks(x, ["precision@5", "hit@5", "MRR"])
    ax.set_ylim(0, 1.12)
    ax.legend(fontsize=8, loc="lower right")
    ax.set_title(f"Retrieval quality on {int(r.n_queries.iloc[0])} synthetic shopper queries")
    return _save(fig, "fig08_retrieval_comparison.png")


def _table_png(df: pd.DataFrame, ok: pd.Series, title: str, name: str, widths=None) -> str:
    fig, ax = plt.subplots(figsize=(15, 0.3 * len(df) + 0.6))
    ax.axis("off")
    t = ax.table(cellText=df.values, colLabels=df.columns, loc="center", cellLoc="left",
                 colWidths=widths)
    t.auto_set_font_size(False)
    t.set_fontsize(8)
    t.scale(1, 1.35)
    for i, good in enumerate(ok, start=1):
        for j in range(df.shape[1]):
            t[i, j].set_facecolor(GREEN if good else RED)
    for j in range(df.shape[1]):
        t[0, j].set_facecolor("#e2e8f0")
        t[0, j].set_text_props(weight="bold")
    ax.set_title(title, fontsize=11)
    return _save(fig, name)


def eval_table() -> str:
    e = pd.read_csv(R / "eval_results.csv").fillna("")
    df = pd.DataFrame({
        "id": e.id, "query": e["query"].str.slice(0, 62), "expected route": e.expected_route,
        "actual route": e.actual_route,
        "checks": e.checks_passed.astype(str) + "/" + e.checks_total.astype(str),
        "citations": e.citations.astype(str).str.slice(0, 34),
        "result": np.where(e.passed, "PASS", "FAIL")})
    backend = e.backend.iloc[0]
    return _table_png(df, e.passed.astype(bool),
                      f"Curated assistant test queries - {int(e.passed.sum())}/{len(e)} passed "
                      f"(backend: {backend})", "fig09_eval_table.png",
                      [0.04, 0.33, 0.15, 0.15, 0.05, 0.2, 0.05])


def regression_table() -> str:
    r = pd.read_csv(R / "regression_checks.csv")
    df = r[["metric", "current", "threshold", "baseline", "passed"]].copy()
    df["baseline"] = df.baseline.fillna("first run")
    df["passed"] = np.where(r.passed, "PASS", "FAIL")
    return _table_png(df.astype(str), r.passed.astype(bool), "Regression checks (threshold and baseline)",
                      "fig10_regression_checks.png", [0.3, 0.15, 0.15, 0.2, 0.1])


def _text_png(lines: list, title: str, name: str, width: int = 120) -> str:
    wrapped = []
    for ln in lines:
        wrapped += textwrap.wrap(ln, width, subsequent_indent="    ") or [""]
    fig = plt.figure(figsize=(12, 0.2 * len(wrapped) + 0.9))
    fig.text(0.01, 0.99, title, fontsize=11, weight="bold", va="top", family="monospace")
    fig.text(0.01, 0.99 - 0.5 / (0.2 * len(wrapped) + 0.9), "\n".join(wrapped), fontsize=8,
             va="top", family="monospace")
    return _save(fig, name)


def demo_runs() -> list:
    runs = json.loads((R / "demo_runs.json").read_text(encoding="utf-8"))
    paths = []
    for i, r in enumerate(runs, 1):
        lines = [f"USER: {r['query']}", ""]
        for j, t in enumerate(r["trace"], 1):
            info = {k: v for k, v in t.items() if k not in ("stage", "query")}
            lines.append(f"[{j}] {t['stage']}: {json.dumps(info, ensure_ascii=False, default=str)[:260]}")
        lines += ["", f"ROUTE: {' -> '.join(r['route'])}   backend={r['backend']}   {r['latency_s']}s",
                  "ASSISTANT:"] + r["answer"].replace("₹", "Rs.").splitlines() + \
                 ["", "CITATIONS: " + (", ".join(r["citations"]) or "none")]
        lines = [ln.replace("₹", "Rs.") for ln in lines]
        paths.append(_text_png(lines, f"Demo run {i}", f"fig11_demo_{i:02d}.png"))
    return paths


def pytest_result() -> str:
    path = R / "pytest_output.txt"
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8").splitlines()
    return _text_png(lines[-40:], "pytest - offline deterministic test suite", "fig12_pytest.png")


def build_all() -> list:
    matplotlib.rcParams.update({"font.size": 9})
    out = [target_balance(), model_comparison(), roc_curves(), feature_importance(),
           cluster_diagnostics(), segments_pca(), segment_profiles(), retrieval_comparison(),
           eval_table(), regression_table()]
    out += demo_runs()
    p = pytest_result()
    if p:
        out.append(p)
    return out
