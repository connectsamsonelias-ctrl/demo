## Project Name
Employee Attrition Prediction (IBM HR Analytics)

## One-line Summary
A classification pipeline that predicts whether an employee is likely to leave a company from HR data, and ranks the features that drive that risk.

## My Role/Contribution
<!-- PLACEHOLDER: describe your role, e.g. "Sole contributor; built the full pipeline as part of the IITM GenAI & ML certificate program, Mini Project 1." -->

## Tech Stack
- **Language:** Python 3
- **Data/ML:** pandas, NumPy, scikit-learn, imbalanced-learn (SMOTE)
- **Visualization:** matplotlib, seaborn
- **Model persistence:** joblib
- **Reporting:** ReportLab (PDF generation)
- **Environment:** Jupyter Notebook (nbformat/nbconvert), plain `.py` script variant

## Key Features
- Predicts individual employee attrition risk as both a Yes/No label and a continuous 0–1 risk score, usable for prioritizing HR outreach.
- Surfaces the specific factors driving attrition (e.g. overtime, tenure, business travel, job role) rather than a black-box prediction.
- Handles realistic, imbalanced HR data (16% attrition rate) without inflating apparent accuracy.
- Compares four different classification approaches side by side so model choice is justified, not assumed.
- Ships a reusable saved model plus a working example script for scoring new/unseen employee records.

## Technical Highlights
- Diagnosed and corrected a class-imbalance blind spot in model selection: identified that the highest-accuracy/ROC-AUC model (Random Forest, 84.0% accuracy) caught only 30% of actual attrition cases, and selected Logistic Regression instead by optimizing for recall/F1 on the minority class, nearly doubling detection of at-risk employees (59.6% recall vs. 29.8%).
- Built a leakage-safe preprocessing pipeline — stratified train/test split performed before scaling and SMOTE resampling, with the scaler fit only on training data — ensuring test-set metrics reflect real-world deployment conditions.
- Applied SMOTE oversampling to correct a 84%/16% class imbalance in training data (986 vs. 190 → 986 vs. 986 samples) without contaminating the evaluation set.
- Cross-validated feature-importance findings across two independent model families (Logistic Regression coefficients vs. Random Forest importances) to distinguish genuine attrition drivers from artifacts of multicollinearity (e.g. a counterintuitive `JobLevel` coefficient traced to correlation with income/tenure features).
- Packaged the trained model as a portable, reusable artifact (`model.pkl`: model + scaler + feature schema via joblib) with a working inference script, rather than leaving results notebook-bound.

## Scale/Metrics
- Dataset: 1,470 employee records, 35 raw features (44 after encoding).
- Class distribution: 83.9% retained / 16.1% attrition.
- Train/test split: 1,176 / 294 records (80/20, stratified).
- Final model (Logistic Regression): 77.6% accuracy, 59.6% recall, 45.9% F1, 78.5% ROC-AUC on the attrition class.
- 4 classifiers benchmarked: Logistic Regression, Decision Tree, SVM (RBF kernel), Random Forest.

## Duration
August 8–9, 2026 (approx. 1 day, single working session).
