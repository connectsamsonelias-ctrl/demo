"""
Builds notebook.ipynb cell-by-cell. Run this script to (re)generate the notebook,
then execute it with nbconvert. Kept as a script so the notebook can be built up
incrementally across project phases.
"""
import nbformat as nbf

nb = nbf.v4.new_notebook()
cells = []

def md(text):
    cells.append(nbf.v4.new_markdown_cell(text))

def code(text):
    cells.append(nbf.v4.new_code_cell(text))

# ============================================================
# TITLE
# ============================================================
md("""# Mini Project 1 — Predicting Employee Attrition
### IBM HR Analytics Employee Attrition Dataset

**Goal:** Build a machine learning model that predicts whether an employee is likely to
leave the company (`Attrition`), based on HR data such as satisfaction, overtime, income,
job role, etc.

This notebook follows the 5 phases of the project:
1. Data Understanding (EDA)
2. Data Preprocessing
3. Model Building
4. Model Evaluation
5. Reporting (feature importance & insights)
""")

# ============================================================
# PHASE 1: DATA UNDERSTANDING
# ============================================================
md("## Phase 1: Data Understanding\n\nFirst we load the libraries we need and the dataset, then look at its basic shape and structure.")

code("""import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Make plots look clean and consistent
sns.set_theme(style="whitegrid")
plt.rcParams["figure.figsize"] = (8, 5)

# Load the dataset
df = pd.read_csv("WA_Fn-UseC_-HR-Employee-Attrition.csv")
print("Shape of the dataset (rows, columns):", df.shape)
df.head()
""")

md("""**What we just did:** loaded the CSV into a pandas `DataFrame` — think of it like an
Excel sheet in Python. `df.shape` tells us how many employees (rows) and how many
attributes/columns we have.""")

code("""# Column names and data types
df.info()
""")

md("""**Reading `df.info()`:** for each column it shows how many non-null (i.e. non-missing)
values there are, and the data type (`int64` = whole number, `object` = text/category).
If a column has fewer non-null values than the total row count, it has missing data.""")

code("""# Check for missing values in every column
df.isnull().sum().sort_values(ascending=False)
""")

md("""If every column shows `0`, this dataset has **no missing values** — that's common for
this particular Kaggle dataset, but it's always the first thing to check on any real
project.""")

code("""# Statistical summary of numeric columns: mean, std, min, max, quartiles
df.describe()
""")

md("""**Why this matters:** `describe()` helps us spot outliers or strange values quickly.
For example, if `Age` had a min of 5 or a max of 200, we'd know something's wrong.
It also shows us columns that never change (constant columns) — watch for columns where
min == max, e.g. `EmployeeCount`, `StandardHours`. Those carry no information for a model
and are candidates to drop later.""")

code("""# Look for columns that are constant (same value in every row) - they add no predictive value
constant_cols = [c for c in df.columns if df[c].nunique() == 1]
print("Constant columns (no variation):", constant_cols)
""")

md("""### Target variable: `Attrition`

This is what we're trying to predict: did the employee leave (`Yes`) or stay (`No`)?
Let's look at the class balance.""")

code("""attrition_counts = df["Attrition"].value_counts()
attrition_pct = df["Attrition"].value_counts(normalize=True) * 100

print(attrition_counts)
print()
print(attrition_pct.round(2))
""")

code("""fig, axes = plt.subplots(1, 2, figsize=(12, 5))

sns.countplot(data=df, x="Attrition", hue="Attrition", palette="Set2", legend=False, ax=axes[0])
axes[0].set_title("Attrition Count")
axes[0].set_xlabel("Attrition")
axes[0].set_ylabel("Number of Employees")

axes[1].pie(attrition_counts, labels=attrition_counts.index, autopct="%1.1f%%",
            colors=sns.color_palette("Set2"))
axes[1].set_title("Attrition Proportion")

plt.tight_layout()
plt.savefig("attrition_distribution.png", dpi=120)
plt.show()
""")

md("""**This is the class imbalance the project brief warns about.** Roughly 84% of employees
stayed (`No`) and only ~16% left (`Yes`). If we trained a model without addressing this,
it could reach ~84% accuracy by *always* predicting "No" — technically "accurate" but
completely useless for identifying at-risk employees, which is the whole point of this
project. We'll fix this properly in Phase 2 (Data Preprocessing) using a technique called
**SMOTE**.""")

md("""### Exploring relationships between features and Attrition

Let's visualize how a few HR-relevant features relate to attrition, to build intuition
before modeling.""")

code("""categorical_features = ["OverTime", "BusinessTravel", "JobRole", "MaritalStatus"]

fig, axes = plt.subplots(2, 2, figsize=(14, 10))
axes = axes.flatten()

for i, col in enumerate(categorical_features):
    order = df[col].value_counts().index
    sns.countplot(data=df, x=col, hue="Attrition", palette="Set2", ax=axes[i], order=order)
    axes[i].set_title(f"Attrition by {col}")
    axes[i].tick_params(axis="x", rotation=30)

plt.tight_layout()
plt.savefig("attrition_by_categorical.png", dpi=120)
plt.show()
""")

md("""**What to look for:** if the orange/blue split looks very different across categories
of a feature (e.g. employees who work `OverTime` leaving far more often), that feature is
likely a strong predictor of attrition. Keep this in mind — we'll confirm it statistically
with feature importance in Phase 5.""")

code("""numeric_features = ["Age", "MonthlyIncome", "DistanceFromHome", "YearsAtCompany",
                     "JobSatisfaction", "WorkLifeBalance"]

fig, axes = plt.subplots(2, 3, figsize=(16, 9))
axes = axes.flatten()

for i, col in enumerate(numeric_features):
    sns.boxplot(data=df, x="Attrition", y=col, hue="Attrition", palette="Set2",
                legend=False, ax=axes[i])
    axes[i].set_title(f"{col} vs Attrition")

plt.tight_layout()
plt.savefig("attrition_by_numeric.png", dpi=120)
plt.show()
""")

md("""**Reading a boxplot:** the box shows where the middle 50% of values fall, the line
inside is the median, and dots outside the whiskers are potential outliers. Comparing the
"Yes" box to the "No" box for each feature tells us whether that feature differs between
employees who leave and those who stay (e.g. do people who leave tend to be younger, or
earn less?).""")

code("""# Correlation heatmap for numeric features (helps spot multicollinearity later)
plt.figure(figsize=(16, 12))
numeric_df = df.select_dtypes(include=[np.number])
corr = numeric_df.corr()
sns.heatmap(corr, cmap="coolwarm", center=0, annot=False)
plt.title("Correlation Heatmap (Numeric Features)")
plt.tight_layout()
plt.savefig("correlation_heatmap.png", dpi=120)
plt.show()
""")

md("""**Why check correlation:** highly correlated features (e.g. `JobLevel` and
`MonthlyIncome`) carry overlapping information. This isn't a problem for tree-based models,
but it can affect linear models like Logistic Regression. Good to know before we preprocess.

---
### Phase 1 Summary

- Dataset: 1470 employees, 35 columns, **no missing values**.
- A few columns are constant (`EmployeeCount`, `StandardHours`, possibly `Over18`) and
  will be dropped — they carry zero information.
- Target class `Attrition` is **imbalanced**: ~84% No vs ~16% Yes. We must handle this
  before modeling.
- Visual inspection suggests `OverTime`, `JobSatisfaction`, `WorkLifeBalance`, `MonthlyIncome`,
  and `Age` may be meaningfully related to attrition — we'll verify this formally later.

Next: **Phase 2 — Data Preprocessing.**
""")

# ============================================================
# PHASE 2: DATA PREPROCESSING
# ============================================================
md("""## Phase 2: Data Preprocessing

Now we get the data ready for machine learning models. Models can't work with raw text
categories, different scales, or leftover noise — this phase turns our messy real-world
table into clean numeric input.""")

md("### Step 2.1 — Drop columns with no predictive value")

code("""# EmployeeCount, Over18, StandardHours are constant (same value for every row).
# EmployeeNumber is just an ID - it identifies a row, it doesn't describe the employee.
cols_to_drop = ["EmployeeCount", "Over18", "StandardHours", "EmployeeNumber"]
df_clean = df.drop(columns=cols_to_drop)
print("Dropped columns:", cols_to_drop)
print("New shape:", df_clean.shape)
""")

md("""### Step 2.2 — Encode the target variable

`Attrition` is currently text (`"Yes"`/`"No"`). We convert it to `1`/`0` so models can use
it as a numeric target.""")

code("""df_clean["Attrition"] = df_clean["Attrition"].map({"Yes": 1, "No": 0})
df_clean["Attrition"].value_counts()
""")

md("""### Step 2.3 — Outlier detection (IQR method)

We use the **Interquartile Range (IQR)** rule: for each numeric column, anything below
`Q1 - 1.5*IQR` or above `Q3 + 1.5*IQR` is flagged as a potential outlier. We inspect them
rather than blindly deleting rows — HR data like `MonthlyIncome` or `YearsAtCompany` can
have legitimately high values (e.g. senior employees), so removing them could throw away
real signal. Tree-based models (Decision Tree, Random Forest) are also naturally robust to
outliers, so we'll keep the rows but stay aware of them.""")

code("""numeric_cols = df_clean.select_dtypes(include=[np.number]).columns.drop("Attrition")

outlier_summary = {}
for col in numeric_cols:
    Q1 = df_clean[col].quantile(0.25)
    Q3 = df_clean[col].quantile(0.75)
    IQR = Q3 - Q1
    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR
    n_outliers = ((df_clean[col] < lower) | (df_clean[col] > upper)).sum()
    if n_outliers > 0:
        outlier_summary[col] = n_outliers

outlier_series = pd.Series(outlier_summary).sort_values(ascending=False)
print("Columns with outliers (count of flagged rows):")
print(outlier_series)
""")

md("""**Decision:** we keep these rows. They represent genuine variation in employee
tenure, income, and history rather than data-entry errors (nothing is negative or
impossible). We'll rely on scaling and, where needed, robust/tree-based models to handle
them well.""")

md("""### Step 2.4 — Encode categorical features

We split categorical columns into two types:
- **Binary categoricals** (2 values, e.g. `Gender`, `OverTime`): map directly to 0/1.
- **Multi-class categoricals** (e.g. `Department`, `JobRole`): use **one-hot encoding**
  (`pd.get_dummies`), which creates a separate 0/1 column per category. We avoid plain
  label encoding (0, 1, 2, 3...) here because that would falsely imply an order/ranking
  between categories that don't have one (e.g. `Sales` isn't "less than" `R&D`).""")

code("""categorical_cols = df_clean.select_dtypes(include=["object", "string"]).columns.tolist()
print("Categorical columns:", categorical_cols)

binary_cols = [c for c in categorical_cols if df_clean[c].nunique() == 2]
multi_cols = [c for c in categorical_cols if df_clean[c].nunique() > 2]
print("Binary:", binary_cols)
print("Multi-class:", multi_cols)
""")

code("""# Binary encoding (Yes/No, Male/Female -> 1/0)
for col in binary_cols:
    top_value = df_clean[col].value_counts().index[0]
    df_clean[col] = (df_clean[col] != top_value).astype(int)

# One-hot encoding for multi-class categoricals
df_encoded = pd.get_dummies(df_clean, columns=multi_cols, drop_first=True)

print("Shape after encoding:", df_encoded.shape)
df_encoded.head()
""")

md("""`drop_first=True` drops one category per feature (e.g. keeps `Department_Sales` and
`Department_Research & Development` but drops `Department_Human Resources`). This avoids
redundant columns — if you know the values of all-but-one dummy column, you already know
the dropped one, so keeping it adds no information (this is called the "dummy variable
trap").""")

md("""### Step 2.5 — Train/test split

We split the data **before** scaling and **before** balancing classes, so that our test
set stays a true, untouched sample of real-world data for final evaluation. We use
`stratify=y` so both the training and test sets preserve the same ~84/16 attrition ratio
as the full dataset.""")

code("""from sklearn.model_selection import train_test_split

X = df_encoded.drop(columns=["Attrition"])
y = df_encoded["Attrition"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print("Train shape:", X_train.shape, "Test shape:", X_test.shape)
print("\\nTrain class balance:")
print(y_train.value_counts(normalize=True).round(3))
print("\\nTest class balance:")
print(y_test.value_counts(normalize=True).round(3))
""")

md("""### Step 2.6 — Feature scaling

We use `StandardScaler`, which transforms each numeric feature to have mean 0 and
standard deviation 1. This matters most for Logistic Regression and SVM, which are
sensitive to feature scale. We `fit` the scaler **only on training data**, then use it to
`transform` both train and test — fitting on test data would leak information from the
test set into training (a common beginner mistake called **data leakage**).""")

code("""from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_train_scaled = pd.DataFrame(scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index)
X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X_test.columns, index=X_test.index)

X_train_scaled.describe().loc[["mean", "std"]].round(2)
""")

md("""### Step 2.7 — Handle class imbalance with SMOTE

**SMOTE (Synthetic Minority Over-sampling Technique)** creates new, synthetic examples of
the minority class (`Attrition = 1`) by interpolating between existing minority-class
examples and their nearest neighbors — rather than just duplicating rows, it generates
plausible new ones. This helps the model learn the minority class pattern properly instead
of mostly learning to predict the majority class.

**Important:** we apply SMOTE only to the **training set**, after the split. The test set
must stay exactly as real-world, imbalanced data — that's what a deployed model would
actually see, and it's the fair way to measure performance.""")

code("""from imblearn.over_sampling import SMOTE

smote = SMOTE(random_state=42)
X_train_res, y_train_res = smote.fit_resample(X_train_scaled, y_train)

print("Before SMOTE:", y_train.value_counts().to_dict())
print("After SMOTE :", y_train_res.value_counts().to_dict())
""")

code("""fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
y_train.value_counts().plot(kind="bar", color=sns.color_palette("Set2"), ax=axes[0])
axes[0].set_title("Training Set — Before SMOTE")
axes[0].set_xticklabels(["No (0)", "Yes (1)"], rotation=0)

y_train_res.value_counts().plot(kind="bar", color=sns.color_palette("Set2"), ax=axes[1])
axes[1].set_title("Training Set — After SMOTE")
axes[1].set_xticklabels(["No (0)", "Yes (1)"], rotation=0)

plt.tight_layout()
plt.savefig("smote_before_after.png", dpi=120)
plt.show()
""")

md("""---
### Phase 2 Summary

- Dropped 4 uninformative columns (3 constant + the ID column).
- Encoded `Attrition` to 0/1, binary categoricals to 0/1, and multi-class categoricals via
  one-hot encoding — final feature set has more columns than the original (one-hot
  expansion) but is fully numeric.
- Detected outliers via IQR but kept them — they reflect genuine variation, not errors.
- Split into train (80%) / test (20%) with stratification, **before** scaling or balancing.
- Scaled features using `StandardScaler`, fit only on training data.
- Balanced the training set with SMOTE so both classes have equal representation for
  model training, while keeping the test set untouched and realistic for evaluation.

Next: **Phase 3 — Model Building.**
""")

# ============================================================
# PHASE 3: MODEL BUILDING
# ============================================================
md("""## Phase 3: Model Building

We train four classifiers on the SMOTE-balanced, scaled training data:

1. **Logistic Regression** (linear baseline)
2. **Decision Tree** (non-linear, single tree)
3. **Support Vector Machine** with an RBF kernel (non-linear)
4. **Random Forest** (non-linear ensemble of trees)

Each model will later be evaluated on the same untouched test set in Phase 4, so we can
compare them fairly.""")

code("""from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier

models = {
    "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42),
    "Decision Tree": DecisionTreeClassifier(max_depth=6, random_state=42),
    # CalibratedClassifierCV wraps the SVM so it can output probabilities (needed for
    # ROC-AUC in Phase 4) - this replaces the older SVC(probability=True) approach.
    "SVM (RBF kernel)": CalibratedClassifierCV(SVC(kernel="rbf", random_state=42), ensemble=False),
    "Random Forest": RandomForestClassifier(n_estimators=300, max_depth=10, random_state=42),
}

trained_models = {}
for name, model in models.items():
    model.fit(X_train_res, y_train_res)
    trained_models[name] = model
    print(f"Trained: {name}")
""")

md("""**Notes on choices:**
- `max_iter=1000` for Logistic Regression just gives its optimizer enough iterations to
  converge (default is often too low for this many features).
- `max_depth=6` for the Decision Tree limits how deep it can grow — without a limit, trees
  tend to memorize the training data (overfit) instead of learning general patterns.
- The SVM is wrapped in `CalibratedClassifierCV` so it can output probabilities (not just
  class labels), which we need for the ROC-AUC metric in Phase 4.
- `n_estimators=300` for Random Forest means it builds 300 individual trees and averages
  their votes — more trees generally means more stable predictions.
- `random_state=42` is set everywhere purely for **reproducibility** — so anyone re-running
  this notebook gets the exact same results.

All four models are now trained. Next: **Phase 4 — Model Evaluation**, where we'll see
which one actually performs best, and by which metrics.
""")

# ============================================================
# PHASE 4: MODEL EVALUATION
# ============================================================
md("""## Phase 4: Model Evaluation

**Why not just use accuracy?** Our test set is still ~84% "No" / 16% "Yes" (we only balanced
the *training* set, remember). A model could reach ~84% accuracy by never predicting "Yes"
at all — completely failing the actual business goal of catching at-risk employees. So we
evaluate with **precision, recall, F1, and ROC-AUC**, focused on the "Yes" (Attrition = 1)
class, plus a confusion matrix for each model to see exactly what kind of mistakes it makes.""")

code("""from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                              f1_score, roc_auc_score, confusion_matrix, classification_report)

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
results_df.round(3)
""")

md("""**How to read this table:** each row is a model, each column a metric (all except
Accuracy are computed specifically for predicting `Attrition = Yes`, the class we actually
care about catching). Higher is better for all columns. We sort by ROC-AUC as an overall
ranking, since it summarizes performance across all decision thresholds — but we'll look at
recall specifically too, since missing at-risk employees is the costlier mistake for HR.""")

code("""results_df.set_index("Model")[["Accuracy", "Precision (Yes)", "Recall (Yes)", "F1 (Yes)", "ROC-AUC"]] \\
    .plot(kind="bar", figsize=(12, 6), colormap="Set2")
plt.title("Model Comparison Across Metrics")
plt.ylabel("Score")
plt.xticks(rotation=15)
plt.legend(loc="lower right")
plt.tight_layout()
plt.savefig("model_comparison.png", dpi=120)
plt.show()
""")

code("""fig, axes = plt.subplots(2, 2, figsize=(11, 10))
axes = axes.flatten()

for i, (name, (y_pred, _)) in enumerate(predictions.items()):
    cm = confusion_matrix(y_test, y_pred)
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=axes[i],
                xticklabels=["No", "Yes"], yticklabels=["No", "Yes"])
    axes[i].set_title(name)
    axes[i].set_xlabel("Predicted")
    axes[i].set_ylabel("Actual")

plt.tight_layout()
plt.savefig("confusion_matrices.png", dpi=120)
plt.show()
""")

md("""**Reading a confusion matrix** (rows = actual, columns = predicted):
- **Top-left**: actual "No", predicted "No" → correct (true negative).
- **Top-right**: actual "No", predicted "Yes" → false alarm (false positive).
- **Bottom-left**: actual "Yes", predicted "No" → **missed** at-risk employee (false negative)
  — usually the most costly mistake for HR.
- **Bottom-right**: actual "Yes", predicted "Yes" → correctly caught (true positive).""")

code("""from sklearn.metrics import roc_curve

plt.figure(figsize=(7, 6))
for name, (_, y_proba) in predictions.items():
    fpr, tpr, _ = roc_curve(y_test, y_proba)
    auc = roc_auc_score(y_test, y_proba)
    plt.plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})")

plt.plot([0, 1], [0, 1], "k--", label="Random guess (AUC=0.5)")
plt.xlabel("False Positive Rate")
plt.ylabel("True Positive Rate")
plt.title("ROC Curves — Model Comparison")
plt.legend(loc="lower right")
plt.tight_layout()
plt.savefig("roc_curves.png", dpi=120)
plt.show()
""")

md("""**Reading an ROC curve:** the closer a curve hugs the top-left corner, the better the
model separates the two classes. The diagonal dashed line represents random guessing
(AUC=0.5) — every model should beat that by a wide margin.""")

code("""best_model_name = results_df.iloc[0]["Model"]
print("Best model by ROC-AUC:", best_model_name)
print()
print(classification_report(y_test, predictions[best_model_name][0], target_names=["No", "Yes"]))
""")

md("""---
### Phase 4 Summary

- All models comfortably beat random guessing (ROC-AUC well above 0.5).
- We compared models on Accuracy, Precision, Recall, F1, and ROC-AUC — not accuracy alone
  — because the test set is still imbalanced (84/16), and catching true attrition cases
  (recall) matters more to the business than raw accuracy.
- Confusion matrices show each model's exact trade-off between false alarms and missed
  at-risk employees.
- The top-ranked model by ROC-AUC will be carried forward as our final model.

Next: **Phase 5 — Feature Importance & Reporting.**
""")

nb["cells"] = cells
with open("notebook.ipynb", "w") as f:
    nbf.write(nb, f)

print("notebook.ipynb written with", len(cells), "cells")
