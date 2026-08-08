"""Generates report.pdf - the executive summary deliverable."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                 Image, PageBreak, ListFlowable, ListItem)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="H1c", parent=styles["Heading1"], alignment=TA_CENTER))
styles.add(ParagraphStyle(name="Body", parent=styles["Normal"], spaceAfter=8, leading=14))
styles.add(ParagraphStyle(name="H2", parent=styles["Heading2"], spaceBefore=14, spaceAfter=6))

doc = SimpleDocTemplate("report.pdf", pagesize=letter,
                         topMargin=0.7 * inch, bottomMargin=0.7 * inch,
                         leftMargin=0.75 * inch, rightMargin=0.75 * inch)
story = []

# ---- Title ----
story.append(Paragraph("Predicting Employee Attrition", styles["H1c"]))
story.append(Paragraph("Executive Summary Report — Mini Project 1", styles["H1c"]))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Professional Certificate Programme in Generative AI and Machine Learning",
    ParagraphStyle(name="sub", parent=styles["Normal"], alignment=TA_CENTER,
                    textColor=colors.grey)))
story.append(Spacer(1, 20))

# ---- Dataset overview ----
story.append(Paragraph("1. Dataset Overview", styles["H2"]))
story.append(Paragraph(
    "This project uses the IBM HR Analytics Employee Attrition dataset (Kaggle), containing "
    "1,470 employee records with 35 attributes covering demographics, compensation, job role, "
    "satisfaction survey scores, and work history. The target variable, <b>Attrition</b>, "
    "indicates whether an employee left the company (Yes) or stayed (No).", styles["Body"]))
story.append(Paragraph(
    "The dataset had no missing values, but was significantly <b>imbalanced</b>: 1,233 "
    "employees stayed (83.9%) versus only 237 who left (16.1%). Three columns "
    "(EmployeeCount, Over18, StandardHours) were constant across all rows and carried no "
    "predictive value; along with the EmployeeNumber ID column, these were dropped during "
    "preprocessing.", styles["Body"]))

img_path = "attrition_distribution.png"
story.append(Image(img_path, width=5.5 * inch, height=2.3 * inch))
story.append(Spacer(1, 10))

# ---- Challenges ----
story.append(Paragraph("2. Challenges Faced", styles["H2"]))
challenges = [
    "<b>Class imbalance:</b> only ~16% of employees had Attrition = Yes. A naive model could "
    "reach ~84% accuracy by always predicting \"No\", while completely failing the actual "
    "goal. Addressed by applying SMOTE (Synthetic Minority Over-sampling) to the training set "
    "only, keeping the test set realistic and untouched.",
    "<b>Choosing the right evaluation metric:</b> the model with the best ROC-AUC/accuracy "
    "(Random Forest) had far lower recall (30%) on actual attrition cases than Logistic "
    "Regression (60%). Optimizing for the wrong metric would have produced a model that "
    "misses most at-risk employees.",
    "<b>High-cardinality categorical features:</b> columns like JobRole, Department, and "
    "EducationField required one-hot encoding, expanding the feature space from 31 to 45 "
    "columns.",
    "<b>Multicollinearity in linear coefficients:</b> some correlated features (e.g. JobLevel, "
    "MonthlyIncome, TotalWorkingYears) produced a counterintuitive Logistic Regression "
    "coefficient sign for JobLevel; resolved by cross-checking against Random Forest's "
    "feature importance, which is far less sensitive to correlated inputs.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(c, styles["Body"])) for c in challenges],
    bulletType="bullet"))

# ---- Model comparison ----
story.append(Paragraph("3. Model Comparison", styles["H2"]))
story.append(Paragraph(
    "Four classifiers were trained on the SMOTE-balanced training data and evaluated on a "
    "held-out, untouched 20% test set (294 employees, preserving the real-world 84/16 class "
    "ratio). Metrics below are reported for the minority \"Attrition = Yes\" class, which is "
    "the class of actual business interest.", styles["Body"]))

table_data = [
    ["Model", "Accuracy", "Precision", "Recall", "F1-score", "ROC-AUC"],
    ["Random Forest", "0.840", "0.500", "0.298", "0.373", "0.796"],
    ["Logistic Regression *", "0.776", "0.373", "0.596", "0.459", "0.785"],
    ["SVM (RBF kernel)", "0.837", "0.483", "0.298", "0.368", "0.719"],
    ["Decision Tree", "0.813", "0.417", "0.426", "0.421", "0.688"],
]
t = Table(table_data, colWidths=[1.7 * inch, 0.75 * inch, 0.8 * inch, 0.7 * inch, 0.8 * inch, 0.75 * inch])
t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4e79a7")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
    ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#d9e6f2")),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
]))
story.append(t)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "* Final model selected. Although Random Forest scored highest on accuracy and ROC-AUC, "
    "it only caught 30% of employees who actually left. Logistic Regression was selected as "
    "the final model, prioritizing recall and F1-score on the minority class — for an HR "
    "retention use case, missing an at-risk employee is costlier than an extra false alarm.",
    ParagraphStyle(name="note", parent=styles["Body"], fontSize=9, textColor=colors.grey)))

story.append(Image("model_comparison.png", width=5.8 * inch, height=3.2 * inch))
story.append(PageBreak())

story.append(Paragraph("Confusion Matrices", styles["H2"]))
story.append(Image("confusion_matrices.png", width=5.5 * inch, height=5.0 * inch))
story.append(PageBreak())

# ---- Key insights ----
story.append(Paragraph("4. Key Insights: What Drives Attrition", styles["H2"]))
story.append(Paragraph(
    "Feature importance was assessed two ways — Logistic Regression coefficients and Random "
    "Forest importances — to cross-validate findings across a linear and a non-linear model.",
    styles["Body"]))

insights = [
    "<b>OverTime</b> is the single strongest, most consistent predictor in both models. "
    "Employees working overtime leave at a much higher rate.",
    "<b>Tenure and relationship stability</b> — TotalWorkingYears, YearsWithCurrManager, and "
    "YearsAtCompany all reduce attrition risk the higher they are; newer employees and those "
    "with a recent manager change are more likely to leave.",
    "<b>BusinessTravel</b> — both frequent and occasional travelers show higher attrition "
    "risk than employees who don't travel at all.",
    "<b>JobRole</b> matters — e.g. Laboratory Technicians and Sales Representatives show "
    "higher risk; Research Directors (a senior, stable role) show lower risk.",
    "<b>NumCompaniesWorked</b> (job-hopping history) and <b>YearsSinceLastPromotion</b> "
    "(stalled career growth) both increase attrition risk.",
    "<b>JobSatisfaction, StockOptionLevel, MonthlyIncome, and Age</b> are confirmed relevant "
    "by Random Forest, generally in the expected direction.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(c, styles["Body"])) for c in insights], bulletType="bullet"))

story.append(Image("feature_importance_logreg.png", width=5.5 * inch, height=4.3 * inch))
story.append(PageBreak())

# ---- Recommendations ----
story.append(Paragraph("5. Recommendations", styles["H2"]))
recs = [
    "<b>Monitor and limit overtime</b> — the strongest single driver; consider workload "
    "redistribution or overtime caps in high-risk roles.",
    "<b>Prioritize new hires and employees with new managers</b> — risk is highest early in "
    "tenure and right after a manager change; structured onboarding and check-ins could help "
    "most here.",
    "<b>Support employees in high-travel roles</b> with travel-frequency limits, flexible "
    "schedules, or travel stipends.",
    "<b>Act on satisfaction survey scores</b> — treat low JobSatisfaction and low "
    "StockOptionLevel as proactive, early warning signals rather than passive metrics.",
    "<b>Review promotion cadence and pay competitiveness</b>, especially for employees with a "
    "long gap since their last promotion or a history of switching companies.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(c, styles["Body"])) for c in recs], bulletType="bullet"))

story.append(Spacer(1, 16))
story.append(Paragraph(
    "Full analysis, code, and additional charts are available in notebook.ipynb. The final "
    "trained model is saved as model.pkl; see README.md for usage instructions.",
    ParagraphStyle(name="footer", parent=styles["Body"], fontSize=9, textColor=colors.grey)))

doc.build(story)
print("report.pdf generated")
