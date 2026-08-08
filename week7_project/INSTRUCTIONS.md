# Mini Project-1 — Instructions
## Professional Certificate Programme in Generative AI and Machine Learning

### Problem Statement
**Predicting Employee Attrition Using Classification Models on the IBM HR Analytics Dataset**

Organisations are increasingly focused on retaining talent to reduce turnover costs and improve
productivity. This project aims to develop a machine learning model that predicts whether an
employee is likely to leave the company based on historical HR data.

You are given the IBM HR Analytics Employee Attrition dataset, which contains information about
employees, including satisfaction level, work-life balance, job role, overtime, salary, and more.

### Your Task Is To:
1. Explore the dataset.
2. Handle class imbalance (Attrition is rare).
3. Apply multiple classification models (logistic regression, decision tree, SVM, etc.).
4. Evaluate using appropriate metrics.
5. Identify and explain the most important features influencing attrition.

### Dataset
Use this dataset (available on Kaggle):
https://www.kaggle.com/datasets/pavansubhasht/ibm-hr-analytics-attrition-dataset

### Action Items (Phases)

| Phase              | Description                                                       |
|---------------------|---------------------------------------------------------------------|
| Data Understanding  | Perform EDA, visualize attrition distribution, detect imbalance    |
| Data Preprocessing  | Handle missing data, encoding, feature scaling, outlier detection  |
| Model Building      | Train multiple classifiers (at least 3, incl. one non-linear)      |
| Model Evaluation    | Use all appropriate metrics                                        |
| Reporting           | Summarize findings with insights into attrition drivers            |

### Submission Format
Submit the following components in a ZIP folder:
1. **notebook.ipynb** – Complete end-to-end analysis and modeling in a Jupyter notebook.
2. **report.pdf** – Executive summary with:
   - Dataset overview
   - Challenges faced
   - Model comparison table
   - Key insights and recommendations
3. **requirements.txt** – List of required Python packages
4. **model.pkl** – Final trained model (using joblib or pickle)
5. **README.md** – How to run the code and interpret the results
