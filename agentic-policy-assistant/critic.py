"""
critic.py  -  Task 2.3 (Critic).

critique(question, answer, tool_calls) -> {"valid": bool, "issues": [...]}

Deterministic rule checks (always run):
  C1 at least one [doc_id] token
  C2 every cited doc_id exists in the corpus AND was retrieved by a tool in this run
  C3 at least one "quote", and every quote appears verbatim in a cited policy
  C4 simple claims: every number in the answer is found in the cited policies,
     the question, or a calculator result

When an OpenAI key is set, an LLM critic (CRITIC_PROMPT) runs too and its issues
are merged in; valid = rules_valid AND llm_valid.

Run on its own:
    python critic.py
"""
from __future__ import annotations

import json
import logging
import re
from typing import List, Optional

from models import DOC_ID_RE, QUOTE_RE, CriticResult, Settings, get_settings
from prompts import CRITIC_PROMPT
from tools import get_corpus

log = logging.getLogger("policy_assistant.critic")
NUMBER_RE = re.compile(r"\d+(?:[.,:]\d+)*")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in NUMBER_RE.findall(text)}


def rule_critique(question: str, answer: str, tool_calls: Optional[List[dict]] = None) -> CriticResult:
    tool_calls = tool_calls or []
    corpus = get_corpus()
    issues: List[str] = []

    cited = list(dict.fromkeys(DOC_ID_RE.findall(answer)))
    if not cited:
        issues.append("C1: no [doc_id] citation token in the answer")

    retrieved = {tc.get("args", {}).get("doc_id") for tc in tool_calls
                 if tc.get("tool") == "read_policy" and tc.get("ok")}
    for d in cited:
        if d not in corpus:
            issues.append(f"C2: cited doc_id [{d}] does not exist in the corpus")
        elif tool_calls and d not in retrieved:
            issues.append(f"C2: cited doc_id [{d}] was never read with read_policy in this run")

    cited_text = " ".join(corpus[d]["text"] for d in cited if d in corpus)
    quotes = QUOTE_RE.findall(answer)
    if not quotes:
        issues.append('C3: no verbatim "quote" for the rule')
    for q in quotes:
        if _norm(q) not in _norm(cited_text):
            issues.append(f'C3: quote not found verbatim in cited policy: "{q[:60]}"')

    # C4 simple claims - numbers must be grounded
    answer_wo_ids = DOC_ID_RE.sub(" ", answer)
    allowed = _numbers(cited_text) | _numbers(question)
    for tc in tool_calls:
        if tc.get("tool") == "calculator" and tc.get("ok"):
            allowed |= _numbers(json.dumps(tc.get("args", {}))) | _numbers(tc.get("output_preview", ""))
    unsupported = sorted(_numbers(answer_wo_ids) - allowed)
    if unsupported:
        issues.append(f"C4: unsupported numbers in answer: {unsupported}")

    return CriticResult(valid=not issues, issues=issues)


def llm_critique(question: str, answer: str, tool_calls: List[dict], settings: Settings) -> CriticResult:
    from langchain_openai import ChatOpenAI
    corpus = get_corpus()
    evidence = "\n".join(
        f"read_policy({d}): {corpus[d]['text']}" for d in DOC_ID_RE.findall(answer) if d in corpus
    ) or "(none)"
    llm = ChatOpenAI(model=settings.model_name, temperature=0, seed=settings.seed)
    try:
        raw = llm.bind(response_format={"type": "json_object"}).invoke(
            CRITIC_PROMPT.format(question=question, answer=answer, evidence=evidence)).content
        return CriticResult(**json.loads(raw))
    except Exception as e:  # API error or malformed JSON -> rules decide, never crash the run
        log.warning("LLM critic skipped: %s", e)
        return CriticResult(valid=True, issues=[])


def critique(question: str, answer: str, tool_calls: Optional[List[dict]] = None,
             settings: Optional[Settings] = None) -> dict:
    s = settings or get_settings()
    result = rule_critique(question, answer, tool_calls)
    if s.use_openai:
        llm = llm_critique(question, answer, tool_calls or [], s)
        result = CriticResult(valid=result.valid and llm.valid,
                              issues=result.issues + [f"LLM: {i}" for i in llm.issues])
    return result.model_dump()


if __name__ == "__main__":
    good = ('Answer: Employees may work remotely up to 3 days per week with prior manager approval. '
            '[remote_work_v3]\nQuote: "Employees may work remotely up to 3 days per week with prior '
            'manager approval." [remote_work_v3]')
    no_cite = "Answer: You can work remotely 3 days a week."
    bad_quote = 'Answer: Remote work is allowed 5 days a week [remote_work_v3]\nQuote: "up to 5 days per week" [remote_work_v3]'
    fake_id = 'Answer: see "Employees may work remotely" [remote_work_v9]'
    for name, ans in [("good", good), ("no citation", no_cite),
                      ("wrong quote + wrong number", bad_quote), ("unknown doc_id", fake_id)]:
        print(f"{name:<28} -> {json.dumps(critique('What is our remote work limit?', ans))}")
