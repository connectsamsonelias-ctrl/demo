"""
Demo: load model.pkl and predict attrition risk for a few new/hypothetical employees.
This shows exactly how the saved model would be used on data it has never seen before.
"""
import joblib
import pandas as pd

bundle = joblib.load("model.pkl")
model = bundle["model"]
scaler = bundle["scaler"]
feature_columns = bundle["feature_columns"]

# --- 3 new, made-up employees (not in the original dataset) ---
# Written as "raw" HR data, the same format as the original CSV.
new_employees = pd.DataFrame([
    {  # Employee A: many known risk factors
        "Age": 24, "BusinessTravel": "Travel_Frequently", "DailyRate": 500,
        "Department": "Sales", "DistanceFromHome": 22, "Education": 2,
        "EducationField": "Marketing", "EnvironmentSatisfaction": 1, "Gender": "Male",
        "HourlyRate": 50, "JobInvolvement": 2, "JobLevel": 1,
        "JobRole": "Sales Representative", "JobSatisfaction": 1,
        "MaritalStatus": "Single", "MonthlyIncome": 2400, "MonthlyRate": 15000,
        "NumCompaniesWorked": 4, "OverTime": "Yes", "PercentSalaryHike": 11,
        "PerformanceRating": 3, "RelationshipSatisfaction": 2, "StockOptionLevel": 0,
        "TotalWorkingYears": 2, "TrainingTimesLastYear": 1, "WorkLifeBalance": 1,
        "YearsAtCompany": 1, "YearsInCurrentRole": 0, "YearsSinceLastPromotion": 0,
        "YearsWithCurrManager": 0,
    },
    {  # Employee B: stable, senior, satisfied
        "Age": 45, "BusinessTravel": "Non-Travel", "DailyRate": 900,
        "Department": "Research & Development", "DistanceFromHome": 3, "Education": 4,
        "EducationField": "Life Sciences", "EnvironmentSatisfaction": 4, "Gender": "Female",
        "HourlyRate": 80, "JobInvolvement": 4, "JobLevel": 4,
        "JobRole": "Research Director", "JobSatisfaction": 4,
        "MaritalStatus": "Married", "MonthlyIncome": 15000, "MonthlyRate": 20000,
        "NumCompaniesWorked": 1, "OverTime": "No", "PercentSalaryHike": 14,
        "PerformanceRating": 3, "RelationshipSatisfaction": 4, "StockOptionLevel": 2,
        "TotalWorkingYears": 20, "TrainingTimesLastYear": 3, "WorkLifeBalance": 3,
        "YearsAtCompany": 15, "YearsInCurrentRole": 10, "YearsSinceLastPromotion": 2,
        "YearsWithCurrManager": 8,
    },
    {  # Employee C: middling / ambiguous profile
        "Age": 33, "BusinessTravel": "Travel_Rarely", "DailyRate": 700,
        "Department": "Research & Development", "DistanceFromHome": 9, "Education": 3,
        "EducationField": "Medical", "EnvironmentSatisfaction": 3, "Gender": "Male",
        "HourlyRate": 65, "JobInvolvement": 3, "JobLevel": 2,
        "JobRole": "Research Scientist", "JobSatisfaction": 3,
        "MaritalStatus": "Married", "MonthlyIncome": 5500, "MonthlyRate": 18000,
        "NumCompaniesWorked": 2, "OverTime": "No", "PercentSalaryHike": 13,
        "PerformanceRating": 3, "RelationshipSatisfaction": 3, "StockOptionLevel": 1,
        "TotalWorkingYears": 8, "TrainingTimesLastYear": 2, "WorkLifeBalance": 3,
        "YearsAtCompany": 5, "YearsInCurrentRole": 3, "YearsSinceLastPromotion": 1,
        "YearsWithCurrManager": 3,
    },
])

# --- Apply the exact same preprocessing as Phase 2 of the notebook ---
binary_cols = ["Gender", "OverTime"]
for col in binary_cols:
    # Same rule as training: most frequent value -> 0, other value -> 1
    # (Gender: "Male" was most frequent -> 0; OverTime: "No" was most frequent -> 0)
    reference = {"Gender": "Male", "OverTime": "No"}[col]
    new_employees[col] = (new_employees[col] != reference).astype(int)

multi_cols = ["BusinessTravel", "Department", "EducationField", "JobRole", "MaritalStatus"]
new_encoded = pd.get_dummies(new_employees, columns=multi_cols)

# Align columns to exactly what the model expects (adds missing dummy columns as 0,
# drops any the model wasn't trained on, and puts them in the right order)
new_aligned = new_encoded.reindex(columns=feature_columns, fill_value=0)

# Scale using the SAME scaler fitted during training
new_scaled = pd.DataFrame(scaler.transform(new_aligned), columns=feature_columns)

# --- Predict ---
predictions = model.predict(new_scaled)
probabilities = model.predict_proba(new_scaled)[:, 1]

results = pd.DataFrame({
    "Employee": ["A (young, overtime, low satisfaction)",
                 "B (senior, stable, satisfied)",
                 "C (mid-career, average profile)"],
    "Predicted Attrition": ["Yes" if p == 1 else "No" for p in predictions],
    "Attrition Risk Score": probabilities.round(3),
})
print(results.to_string(index=False))
