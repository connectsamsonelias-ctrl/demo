"""Phase 2b - unsupervised ML: customer price-sensitivity segmentation (K-Means + Ward check)."""
import json

import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

import config

# Behavioural price-sensitivity features (one row per customer).
CLUSTER_FEATURES = ["avg_purchase_discount", "deep_discount_share", "avg_purchase_price",
                    "conversion_rate"]
# Used only to describe segments, not to form them.
PROFILE_FEATURES = CLUSTER_FEATURES + ["return_rate", "wishlist_rate", "premium_share",
                                       "high_income_share", "avg_order_value", "total_orders"]
CHOSEN_K = 4


def customer_features(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("customer_id")
    bought = df[df.purchase_flag == 1].groupby("customer_id")
    c = pd.DataFrame({
        "n_interactions": g.size(),
        "conversion_rate": g.purchase_flag.mean(),
        "wishlist_rate": g.wishlist_flag.mean(),
        "avg_viewed_price": g.final_price.mean(),
        "avg_order_value": g.avg_order_value.mean(),
        "total_orders": g.total_orders.mean(),
        "premium_share": g.membership_level.apply(lambda s: s.isin(["Gold", "Platinum"]).mean()),
        "high_income_share": g.income_band.apply(lambda s: (s == "High").mean()),
    })
    c["n_purchases"] = bought.size()
    c["avg_purchase_discount"] = bought.discount_percent.mean()
    c["deep_discount_share"] = bought.discount_percent.apply(lambda s: (s >= 25).mean())
    c["avg_purchase_price"] = bought.final_price.mean()
    c["return_rate"] = bought.returned_flag.mean()
    # Customers with no purchase: no discount behaviour; use viewed price as price level.
    c = c.fillna({"n_purchases": 0, "avg_purchase_discount": 0, "deep_discount_share": 0,
                  "return_rate": 0})
    c["avg_purchase_price"] = c["avg_purchase_price"].fillna(c["avg_viewed_price"])
    return c


def feature_spread(c: pd.DataFrame) -> pd.DataFrame:
    """Coefficient of variation across customers - shows which features can separate groups."""
    cols = CLUSTER_FEATURES + ["avg_order_value", "total_orders", "return_rate"]
    return (c[cols].std() / c[cols].mean().abs()).round(3).sort_values(ascending=False) \
        .rename("coef_of_variation").to_frame()


def diagnostics(X: np.ndarray, k_range=range(2, 9)) -> pd.DataFrame:
    rows = []
    for k in k_range:
        km = KMeans(n_clusters=k, n_init=20, random_state=config.RANDOM_STATE).fit(X)
        ward = AgglomerativeClustering(n_clusters=k, linkage="ward").fit(X)
        rows.append({"k": k, "inertia": round(km.inertia_, 1),
                     "silhouette_kmeans": round(silhouette_score(X, km.labels_), 4),
                     "silhouette_ward": round(silhouette_score(X, ward.labels_), 4),
                     "ari_kmeans_vs_ward": round(adjusted_rand_score(km.labels_, ward.labels_), 3),
                     "smallest_cluster": int(np.bincount(km.labels_).min())})
    return pd.DataFrame(rows)


def name_segments(profile: pd.DataFrame) -> dict:
    """Rule-based business names, assigned greedily so each name is used once."""
    names, left = {}, list(profile.index)
    rules = [("Deal Seekers (price-sensitive)", "deep_discount_share", True),
             ("Loyal Converters", "conversion_rate", True),
             ("Premium Full-Price Buyers", "avg_purchase_price", True),
             ("Low-Engagement Browsers", "conversion_rate", False)]
    for name, col, high in rules:
        if not left:
            break
        sub = profile.loc[left, col]
        seg = sub.idxmax() if high else sub.idxmin()
        names[seg] = name
        left.remove(seg)
    for i, seg in enumerate(left):
        names[seg] = f"Segment {seg}"
    return names


def run(df: pd.DataFrame, k: int = CHOSEN_K) -> dict:
    c = customer_features(df)
    scaler = StandardScaler()
    X = scaler.fit_transform(c[CLUSTER_FEATURES])
    diag = diagnostics(X)
    km = KMeans(n_clusters=k, n_init=20, random_state=config.RANDOM_STATE).fit(X)
    c["segment"] = km.labels_

    profile = c.groupby("segment")[PROFILE_FEATURES].mean()
    profile["n_customers"] = c.segment.value_counts().sort_index()
    profile["share"] = (profile.n_customers / len(c)).round(3)
    z = (profile[CLUSTER_FEATURES] - c[CLUSTER_FEATURES].mean()) / c[CLUSTER_FEATURES].std()
    # Higher = more driven by discounts and lower prices
    profile["price_sensitivity_index"] = (z.avg_purchase_discount + z.deep_discount_share
                                          - z.avg_purchase_price).round(3)
    names = name_segments(profile)
    profile.insert(0, "segment_name", profile.index.map(names))
    c["segment_name"] = c.segment.map(names)

    pca = PCA(n_components=2, random_state=config.RANDOM_STATE).fit(X)
    pcs = pca.transform(X)
    c["pc1"], c["pc2"] = pcs[:, 0], pcs[:, 1]

    profile = profile.round(3)
    c.round(4).to_csv(config.SEGMENTS_CSV)
    profile.to_csv(config.SEGMENT_PROFILE_CSV)
    diag.to_csv(config.RESULTS_DIR / "cluster_diagnostics.csv", index=False)
    chosen = diag.set_index("k").loc[k]
    summary = {"k": k, "features": CLUSTER_FEATURES,
               "silhouette": float(chosen.silhouette_kmeans),
               "ari_vs_ward": float(chosen.ari_kmeans_vs_ward),
               "pca_explained_variance": [round(float(v), 3) for v in pca.explained_variance_ratio_],
               "most_price_sensitive": profile.sort_values("price_sensitivity_index").iloc[-1]
               .segment_name}
    with open(config.RESULTS_DIR / "cluster_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    return {"customers": c, "profile": profile, "diagnostics": diag, "summary": summary,
            "spread": feature_spread(c)}


def load_profiles() -> pd.DataFrame:
    """Segment profiles for the analytics tool (computes them if missing)."""
    if not config.SEGMENT_PROFILE_CSV.exists():
        import data_prep
        run(data_prep.load_clean())
    return pd.read_csv(config.SEGMENT_PROFILE_CSV)
