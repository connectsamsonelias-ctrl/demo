# Intelligent Retail Decision Assistant — Capstone

## Setup (VS Code)
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # then put your OpenAI key in .env (needed from Phase 3)
```
Open `notebooks/` in VS Code, select the `.venv` kernel, run notebooks in order 01 → 05.

## Progress
- [x] Phase 1 — `01_data_preparation.ipynb` (framing, schema, missingness, class balance, data dictionary)
- [ ] Phase 2 — `02_classical_ml.ipynb`
- [ ] Phase 3/4 — `03_rag_recommendation.ipynb`, `04_policy_qa.ipynb`
- [ ] Phase 5 — `05_agentic_assistant.ipynb`
- [ ] Final — evaluation + report
