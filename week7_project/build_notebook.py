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

nb["cells"] = cells
with open("notebook.ipynb", "w") as f:
    nbf.write(nb, f)

print("notebook.ipynb written with", len(cells), "cells")
