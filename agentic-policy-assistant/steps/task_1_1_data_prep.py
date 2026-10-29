"""
TASK 1.1 - Data prep
Create data/policies.jsonl with fields: doc_id, text, date.

Run the whole file:   python steps/task_1_1_data_prep.py
Or cell by cell in VS Code: click "Run Cell" above each  # %%  line.
Code under test: data/policies.jsonl, models.py (Policy, load_policies)
"""
# %% 1.1(a) Look at the raw JSONL file
import _setup
from _setup import ROOT, header
import json

header("1.1(a) raw lines of data/policies.jsonl")
lines = (ROOT / "data" / "policies.jsonl").read_text(encoding="utf-8").splitlines()
print(f"{len(lines)} lines. First line:\n{lines[0]}")
# EXPECT: 10 lines; each is a JSON object with doc_id, text, date

# %% 1.1(b) Validate every row with the pydantic schema
from models import Policy, load_policies

header("1.1(b) validate with pydantic (models.Policy)")
policies = load_policies()
for p in policies:
    print(f"{p.doc_id:<22} {p.date}  {len(p.text):>4} chars")
assert {"doc_id", "text", "date"} == set(json.loads(lines[0]).keys())
print("OK - all rows valid, fields = doc_id, text, date")

# %% 1.1(c) Show that bad rows are rejected (typed validation)
header("1.1(c) bad rows are rejected")
for bad in [{"doc_id": "Remote Work", "text": "x" * 30, "date": "2025-01-01"},
            {"doc_id": "remote_work_v1", "text": "x" * 30, "date": "01/01/2025"},
            {"doc_id": "remote_work_v1", "text": "short", "date": "2025-01-01"}]:
    try:
        Policy(**bad)
    except Exception as e:
        print("rejected:", str(e).splitlines()[-2].strip() if len(str(e).splitlines()) > 1 else e)
# EXPECT: three "rejected" lines (bad doc_id format, bad date, text too short)

# %% 1.1(d) Corpus facts we will ask about later
header("1.1(d) facts the starter queries depend on")
corpus = {p.doc_id: p.text for p in policies}
for doc_id, needle in [("remote_work_v3", "3 days per week"), ("annual_leave_v2", "24 days"),
                       ("travel_expense_v4", "INR 1,500"), ("it_security_v5", "VPN")]:
    print(f"{doc_id:<20} contains '{needle}':", needle in corpus[doc_id])
