"""
TASK 1.3 - Prompts
System prompt with acceptance rules: doc_id token requirement, quoting requirement, step limits.

Run:  python steps/task_1_3_prompts.py    (or cell by cell in VS Code)
Code under test: prompts.py
"""
# %% 1.3(a) Print the system prompt
import _setup
from _setup import header
from prompts import build_system_prompt

header("1.3(a) system prompt")
prompt = build_system_prompt()
print(prompt)

# %% 1.3(b) Check the three required rules are in the prompt
header("1.3(b) required acceptance rules present?")
checks = {
    "doc_id token requirement": "[remote_work_v3]" in prompt and "R2 Citation" in prompt,
    "quoting requirement": "verbatim quote" in prompt and "R3 Quoting" in prompt,
    "step limits": "at most 6 reasoning steps" in prompt and "R4 Step limits" in prompt,
    "bad-id recovery rule": "POLICY_NOT_FOUND" in prompt,
    "grounding / no external facts": "Never use outside knowledge" in prompt,
}
for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
assert all(checks.values())

# %% 1.3(c) The rules are machine-checkable (same regexes the critic uses)
from models import DOC_ID_RE, QUOTE_RE

header("1.3(c) detecting the doc_id token and the quote in an answer")
example = ('Answer: Employees may work remotely up to 3 days per week. [remote_work_v3]\n'
           'Quote: "Employees may work remotely up to 3 days per week with prior manager approval." [remote_work_v3]')
print("doc_ids:", DOC_ID_RE.findall(example))
print("quotes :", QUOTE_RE.findall(example))
print("bad answer doc_ids:", DOC_ID_RE.findall("You can work from home 3 days."))
# EXPECT: ['remote_work_v3', 'remote_work_v3'], one quote, then [] for the bad answer

# %% 1.3(d) Step limit is driven by settings
from models import get_settings

header("1.3(d) step limit comes from Settings")
print(build_system_prompt(max_iterations=3).split("R4 Step limits:")[1].split(".")[0])
print("defaults:", get_settings().model_dump(include={"temperature", "max_iterations", "max_steps", "max_retries"}))
