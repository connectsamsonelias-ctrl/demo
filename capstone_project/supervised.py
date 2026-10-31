"""Phase 2a - supervised ML: predict purchase_flag (primary) and returned_flag (secondary)."""
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import config

# Features known BEFORE the purchase decision. Excluded on purpose (leakage):
#   rating_given / review_sentiment_label  -> written after the outcome
#   returned_flag                          -> only exists after purchase
#   payment_mode / delivery_type / quantity-> captured at checkout
#   ids and free-text columns              -> identifiers / used by the GenAI part
NUMERIC = ["age", "days_since_last_purchase", "avg_order_value", "total_orders", "base_price",
           "discount_percent", "final_price", "avg_product_rating", "stock_level", "time_on_page",
           "added_to_cart", "wishlist_flag", "is_returnable"]
CATEGORICAL = ["gender", "city_tier", "state", "income_band", "occupation", "membership_level",
               "preferred_channel", "category", "sub_category", "brand", "color", "size",
               "material", "season"]
# For returns the checkout fields are legitimately known, so they are added.
RETURN_EXTRA_CAT = ["payment_mode", "delivery_type"]
RETURN_EXTRA_NUM = ["quantity"]
# Engineered features (see add_features). Kept only where cross-validation shows a gain.
ENGINEERED_NUM = ["price_to_aov", "high_discount", "premium_member", "savings"]


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["price_to_aov"] = out.final_price / out.avg_order_value          # item price vs usual basket
    out["high_discount"] = (out.discount_percent >= 25).astype(int)      # deep-discount flag
    out["premium_member"] = out.membership_level.isin(["Gold", "Platinum"]).astype(int)
    out["savings"] = out.base_price - out.final_price                    # rupees saved
    return out


def make_preprocessor(numeric, categorical) -> ColumnTransformer:
    num = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
    cat = Pipeline([("impute", SimpleImputer(strategy="constant", fill_value="Unknown")),
                    ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))])
    return ColumnTransformer([("num", num, numeric), ("cat", cat, categorical)])


def candidate_models() -> dict:
    rs = config.RANDOM_STATE
    return {
        "Dummy (majority)": DummyClassifier(strategy="most_frequent"),
        "Logistic Regression": LogisticRegression(max_iter=2000, C=0.5, class_weight="balanced"),
        "Random Forest": RandomForestClassifier(n_estimators=400, min_samples_leaf=5,
                                                class_weight="balanced", random_state=rs, n_jobs=-1),
        "Hist Gradient Boosting": HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05,
                                                                 max_iter=200, random_state=rs),
    }


def split(df, target, test_size=0.2):
    return train_test_split(df, df[target], test_size=test_size, stratify=df[target],
                            random_state=config.RANDOM_STATE)


def test_metrics(y_true, proba, threshold=0.5) -> dict:
    pred = (proba >= threshold).astype(int)
    return {"accuracy": accuracy_score(y_true, pred),
            "precision": precision_score(y_true, pred, zero_division=0),
            "recall": recall_score(y_true, pred, zero_division=0),
            "f1": f1_score(y_true, pred, zero_division=0),
            "roc_auc": roc_auc_score(y_true, proba),
            "pr_auc": average_precision_score(y_true, proba)}


def run_task(df: pd.DataFrame, target: str, numeric, categorical, tag: str) -> dict:
    """Cross-validate all candidates on train, refit the best, evaluate once on test."""
    X_cols = numeric + categorical
    train, test, y_train, y_test = split(df, target)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=config.RANDOM_STATE)
    rows, fitted = [], {}
    for name, model in candidate_models().items():
        pipe = Pipeline([("prep", make_preprocessor(numeric, categorical)), ("model", model)])
        scores = cross_validate(pipe, train[X_cols], y_train, cv=cv,
                                scoring=["roc_auc", "f1", "average_precision", "accuracy"])
        pipe.fit(train[X_cols], y_train)
        fitted[name] = pipe
        proba = pipe.predict_proba(test[X_cols])[:, 1]
        m = test_metrics(y_test, proba)
        rows.append({"task": tag, "model": name,
                     "cv_roc_auc": scores["test_roc_auc"].mean(),
                     "cv_roc_auc_std": scores["test_roc_auc"].std(),
                     "cv_f1": scores["test_f1"].mean(),
                     "cv_pr_auc": scores["test_average_precision"].mean(),
                     **{f"test_{k}": v for k, v in m.items()}})
    comp = pd.DataFrame(rows).round(4)
    best_name = comp[comp.model != "Dummy (majority)"].sort_values("cv_roc_auc").iloc[-1]["model"]
    best = fitted[best_name]
    proba = best.predict_proba(test[X_cols])[:, 1]
    pred = (proba >= 0.5).astype(int)
    fpr, tpr, _ = roc_curve(y_test, proba)

    # Permutation importance on the raw columns (model-agnostic, on held-out data)
    pi = permutation_importance(best, test[X_cols], y_test, scoring="roc_auc", n_repeats=10,
                                random_state=config.RANDOM_STATE, n_jobs=-1)
    imp = (pd.DataFrame({"feature": X_cols, "importance": pi.importances_mean,
                         "std": pi.importances_std})
           .sort_values("importance", ascending=False).round(4))
    imp.insert(0, "task", tag)

    # Logistic-regression coefficients give direction (+ raises probability)
    lr = fitted["Logistic Regression"]
    names = lr.named_steps["prep"].get_feature_names_out()
    coefs = (pd.DataFrame({"feature": names, "coef": lr.named_steps["model"].coef_[0]})
             .assign(abs=lambda d: d.coef.abs()).sort_values("abs", ascending=False)
             .drop(columns="abs").head(15).round(4))
    coefs.insert(0, "task", tag)

    return {"comparison": comp, "best_model": best_name, "pipeline": best,
            "confusion": confusion_matrix(y_test, pred).tolist(),
            "roc": pd.DataFrame({"task": tag, "model": best_name, "fpr": fpr, "tpr": tpr}),
            "importance": imp, "lr_coefs": coefs,
            "n_train": len(train), "n_test": len(test),
            "positive_rate_train": float(y_train.mean())}


def feature_ablation(df: pd.DataFrame) -> pd.DataFrame:
    """Random Forest CV ROC-AUC with base features vs base + engineered features."""
    df = add_features(df)
    bought = df[df.purchase_flag == 1].reset_index(drop=True)
    setups = {"purchase_flag": (df, NUMERIC, CATEGORICAL),
              "returned_flag": (bought, NUMERIC + RETURN_EXTRA_NUM, CATEGORICAL + RETURN_EXTRA_CAT)}
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=config.RANDOM_STATE)
    rows = []
    for target, (d, num, cat) in setups.items():
        train, _, y_train, _ = split(d, target)
        for label, cols in (("base", num), ("base + engineered", num + ENGINEERED_NUM)):
            pipe = Pipeline([("prep", make_preprocessor(cols, cat)),
                             ("model", candidate_models()["Random Forest"])])
            sc = cross_validate(pipe, train[cols + cat], y_train, cv=cv, scoring="roc_auc")
            rows.append({"task": target, "feature_set": label,
                         "cv_roc_auc": round(sc["test_score"].mean(), 4),
                         "cv_roc_auc_std": round(sc["test_score"].std(), 4)})
    out = pd.DataFrame(rows)
    out.to_csv(config.RESULTS_DIR / "ml_feature_ablation.csv", index=False)
    return out


def run_all(df: pd.DataFrame) -> dict:
    df = add_features(df)
    # purchase: base features (engineered ones did not improve CV AUC, see ablation)
    purchase = run_task(df, "purchase_flag", NUMERIC, CATEGORICAL, "purchase_flag")
    bought = df[df.purchase_flag == 1].reset_index(drop=True)
    # returns: base + checkout fields + engineered features (improved CV AUC)
    ret = run_task(bought, "returned_flag", NUMERIC + RETURN_EXTRA_NUM + ENGINEERED_NUM,
                   CATEGORICAL + RETURN_EXTRA_CAT, "returned_flag")
    save(purchase, ret)
    return {"purchase": purchase, "returned": ret}


def save(purchase: dict, ret: dict) -> None:
    R = config.RESULTS_DIR
    pd.concat([purchase["comparison"], ret["comparison"]]).to_csv(R / "ml_model_comparison.csv", index=False)
    pd.concat([purchase["importance"], ret["importance"]]).to_csv(R / "ml_feature_importance.csv", index=False)
    pd.concat([purchase["lr_coefs"], ret["lr_coefs"]]).to_csv(R / "ml_lr_coefficients.csv", index=False)
    pd.concat([purchase["roc"], ret["roc"]]).to_csv(R / "ml_roc_curve.csv", index=False)
    summary = {}
    for key, r in (("purchase_flag", purchase), ("returned_flag", ret)):
        best_row = r["comparison"].set_index("model").loc[r["best_model"]].to_dict()
        summary[key] = {"best_model": r["best_model"], "confusion_matrix": r["confusion"],
                        "n_train": r["n_train"], "n_test": r["n_test"],
                        "positive_rate_train": round(r["positive_rate_train"], 3),
                        **{k: round(float(v), 4) for k, v in best_row.items() if k != "task"}}
    with open(R / "ml_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    joblib.dump(purchase["pipeline"], R / "purchase_model.joblib")


def load_summary() -> dict:
    with open(config.RESULTS_DIR / "ml_summary.json", encoding="utf-8") as f:
        return json.load(f)


def purchase_drivers(top_n=5) -> pd.DataFrame:
    imp = pd.read_csv(config.RESULTS_DIR / "ml_feature_importance.csv")
    return imp[imp.task == "purchase_flag"].head(top_n)
