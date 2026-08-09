import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import joblib

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                              f1_score, roc_auc_score, confusion_matrix,
                              classification_report, roc_curve)
from imblearn.over_sampling import SMOTE

sns.set_theme(style="whitegrid")
plt.rcParams["figure.figsize"] = (8, 5)

# ============================================================
# 1. DATA UNDERSTANDING
# ============================================================
df = pd.read_csv("WA_Fn-UseC_-HR-Employee-Attrition.csv")
print(df.shape)
print(df.info())
print(df.isnull().sum())
print(df.describe())

constant_cols = [c for c in df.columns if df[c].nunique() == 1]
print("Constant columns:", constant_cols)

print(df["Attrition"].value_counts())
print(df["Attrition"].value_counts(normalize=True) * 100)

sns.countplot(data=df, x="Attrition", hue="Attrition", palette="Set2", legend=False)
plt.title("Attrition Count")
plt.savefig("attrition_distribution.png", dpi=120)
plt.close()

categorical_features = ["OverTime", "BusinessTravel", "JobRole", "MaritalStatus"]
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
axes = axes.flatten()
for i, col in enumerate(categorical_features):
    order = df[col].value_counts().index
    sns.countplot(data=df, x=col, hue="Attrition", palette="Set2", ax=axes[i], order=order)
    axes[i].tick_params(axis="x", rotation=30)
plt.tight_layout()
plt.savefig("attrition_by_categorical.png", dpi=120)
plt.close()

numeric_features = ["Age", "MonthlyIncome", "DistanceFromHome", "YearsAtCompany",
                     "JobSatisfaction", "WorkLifeBalance"]
fig, axes = plt.subplots(2, 3, figsize=(16, 9))
axes = axes.flatten()
for i, col in enumerate(numeric_features):
    sns.boxplot(data=df, x="Attrition", y=col, hue="Attrition", palette="Set2",
                legend=False, ax=axes[i])
plt.tight_layout()
plt.savefig("attrition_by_numeric.png", dpi=120)
plt.close()

plt.figure(figsize=(16, 12))
corr = df.select_dtypes(include=[np.number]).corr()
sns.heatmap(corr, cmap="coolwarm", center=0)
plt.savefig("correlation_heatmap.png", dpi=120)
plt.close()

# ============================================================
# 2. DATA PREPROCESSING
# ============================================================
cols_to_drop = ["EmployeeCount", "Over18", "StandardHours", "EmployeeNumber"]
df_clean = df.drop(columns=cols_to_drop)

df_clean["Attrition"] = df_clean["Attrition"].map({"Yes": 1, "No": 0})

numeric_cols = df_clean.select_dtypes(include=[np.number]).columns.drop("Attrition")
outlier_summary = {}
for col in numeric_cols:
    Q1, Q3 = df_clean[col].quantile(0.25), df_clean[col].quantile(0.75)
    IQR = Q3 - Q1
    lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
    n_outliers = ((df_clean[col] < lower) | (df_clean[col] > upper)).sum()
    if n_outliers > 0:
        outlier_summary[col] = n_outliers
print(pd.Series(outlier_summary).sort_values(ascending=False))

categorical_cols = df_clean.select_dtypes(include=["object", "string"]).columns.tolist()
binary_cols = [c for c in categorical_cols if df_clean[c].nunique() == 2]
multi_cols = [c for c in categorical_cols if df_clean[c].nunique() > 2]

for col in binary_cols:
    top_value = df_clean[col].value_counts().index[0]
    df_clean[col] = (df_clean[col] != top_value).astype(int)

df_encoded = pd.get_dummies(df_clean, columns=multi_cols, drop_first=True)

X = df_encoded.drop(columns=["Attrition"])
y = df_encoded["Attrition"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_scaled = pd.DataFrame(scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X_test.columns, index=X_test.index)

smote = SMOTE(random_state=42)
X_train_res, y_train_res = smote.fit_resample(X_train_scaled, y_train)
print("Before SMOTE:", y_train.value_counts().to_dict())
print("After SMOTE:", y_train_res.value_counts().to_dict())

# ============================================================
# 3. MODEL BUILDING
# ============================================================
models = {
    "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42),
    "Decision Tree": DecisionTreeClassifier(max_depth=6, random_state=42),
    "SVM (RBF kernel)": CalibratedClassifierCV(SVC(kernel="rbf", random_state=42), ensemble=False),
    "Random Forest": RandomForestClassifier(n_estimators=300, max_depth=10, random_state=42),
}

trained_models = {}
for name, model in models.items():
    model.fit(X_train_res, y_train_res)
    trained_models[name] = model
    print("Trained:", name)

# ============================================================
# 4. MODEL EVALUATION
# ============================================================
results = []
predictions = {}
for name, model in trained_models.items():
    y_pred = model.predict(X_test_scaled)
    y_proba = model.predict_proba(X_test_scaled)[:, 1]
    predictions[name] = (y_pred, y_proba)
    results.append({
        "Model": name,
        "Accuracy": accuracy_score(y_test, y_pred),
        "Precision (Yes)": precision_score(y_test, y_pred),
        "Recall (Yes)": recall_score(y_test, y_pred),
        "F1 (Yes)": f1_score(y_test, y_pred),
        "ROC-AUC": roc_auc_score(y_test, y_proba),
    })

results_df = pd.DataFrame(results).sort_values("ROC-AUC", ascending=False).reset_index(drop=True)
print(results_df.round(3))

fig, axes = plt.subplots(2, 2, figsize=(11, 10))
axes = axes.flatten()
for i, (name, (y_pred, _)) in enumerate(predictions.items()):
    cm = confusion_matrix(y_test, y_pred)
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=axes[i],
                xticklabels=["No", "Yes"], yticklabels=["No", "Yes"])
    axes[i].set_title(name)
plt.tight_layout()
plt.savefig("confusion_matrices.png", dpi=120)
plt.close()

plt.figure(figsize=(7, 6))
for name, (_, y_proba) in predictions.items():
    fpr, tpr, _ = roc_curve(y_test, y_proba)
    auc = roc_auc_score(y_test, y_proba)
    plt.plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})")
plt.plot([0, 1], [0, 1], "k--", label="Random guess")
plt.legend(loc="lower right")
plt.savefig("roc_curves.png", dpi=120)
plt.close()

# Final model: Logistic Regression (best recall/F1 on minority class)
final_model_name = "Logistic Regression"
final_model = trained_models[final_model_name]
print(classification_report(y_test, predictions[final_model_name][0], target_names=["No", "Yes"]))

# ============================================================
# 5. FEATURE IMPORTANCE & REPORTING
# ============================================================
coefficients = pd.Series(final_model.coef_[0], index=X_train.columns)
top_features = coefficients.reindex(coefficients.abs().sort_values(ascending=False).index).head(15)
sorted_features = top_features.sort_values()
bar_colors = ["#e15759" if v > 0 else "#4e79a7" for v in sorted_features.values]
plt.figure(figsize=(9, 7))
sorted_features.plot(kind="barh", color=bar_colors)
plt.tight_layout()
plt.savefig("feature_importance_logreg.png", dpi=120)
plt.close()

rf_model = trained_models["Random Forest"]
rf_importances = pd.Series(rf_model.feature_importances_, index=X_train.columns)
top_rf = rf_importances.sort_values(ascending=False).head(15)
plt.figure(figsize=(9, 7))
top_rf.sort_values().plot(kind="barh", color="#59a14f")
plt.tight_layout()
plt.savefig("feature_importance_rf.png", dpi=120)
plt.close()

print(top_features.head(10).round(3))
print(top_rf.head(10).round(3))

# ============================================================
# SAVE FINAL MODEL
# ============================================================
model_bundle = {
    "model": final_model,
    "scaler": scaler,
    "feature_columns": X_train.columns.tolist(),
    "model_name": final_model_name,
}
joblib.dump(model_bundle, "model.pkl")
print("Saved model.pkl")
