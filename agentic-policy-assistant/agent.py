"""
agent.py  -  Task 1.4 (Agent).

A ReAct-style tool-calling agent:  Thought -> Action (tool call) -> Observation -> ... -> Answer

  * build_llm()    - ChatOpenAI(temperature=0, seed) when OPENAI_API_KEY is set,
                     otherwise OfflinePolicyModel (deterministic, rule-based stand-in
                     that speaks the same tool-calling protocol).
  * PolicyAgent    - the executor loop: max_iterations, verbose trace, per-tool latency.
  * build_agent()  - factory.

"Bad id" recovery: read_policy returns a soft POLICY_NOT_FOUND error (see tools.py);
the system prompt (R5) tells the model to search instead, and the offline model
implements exactly that behaviour.

Run on its own:
    python agent.py
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (AIMessage, BaseMessage, HumanMessage,
                                     SystemMessage, ToolMessage)
from langchain_core.outputs import ChatGeneration, ChatResult

from models import DOC_ID_PATTERN, AgentResult, Settings, ToolCallTrace, get_settings
from prompts import build_system_prompt
from tools import TOOLS, TOOLS_BY_NAME, tokenize

log = logging.getLogger("policy_assistant.agent")

NOT_FOUND_ANSWER = "I could not find this in the policy corpus."
MATH_RE = re.compile(r"(\d+(?:\.\d+)?\s*[\*x×/+\-]\s*\d+(?:\.\d+)?)")
EXPLICIT_ID_RE = re.compile(rf"\b(?:policy|doc(?:_id)?|read)\s+({DOC_ID_PATTERN})", re.I)
HINT_ID_RE = re.compile(rf"Hint sources:.*?\[({DOC_ID_PATTERN})\]")
NUMERIC_CUES = {"limit", "cap", "many", "much", "day", "max", "maximum", "minimum", "how", "rate"}


# --------------------------------------------------------------------------- #
# Offline deterministic model (used when no OpenAI key is available)
# --------------------------------------------------------------------------- #
class OfflinePolicyModel(BaseChatModel):
    """Deterministic ReAct policy that emits real LangChain tool calls.

    Decision order (cheapest sufficient first):
      1. arithmetic in the question  -> calculator
      2. explicit doc_id requested   -> read_policy(doc_id)
      3. memory hint with a doc_id   -> read_policy(hint doc_id)   (skips search)
      4. nothing read yet            -> policy_search(topic) -> read_policy(top hit)
      5. policy text available       -> compose answer with [doc_id] + verbatim quote
    """

    @property
    def _llm_type(self) -> str:
        return "offline-policy-model"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "OfflinePolicyModel":
        return self

    # -- helpers ------------------------------------------------------------ #
    @staticmethod
    def _question(messages: List[BaseMessage]) -> str:
        return next(m.content for m in messages if isinstance(m, HumanMessage))

    @staticmethod
    def _history(messages: List[BaseMessage]):
        """Pair each tool call with its parsed result."""
        results = {m.tool_call_id: json.loads(m.content)
                   for m in messages if isinstance(m, ToolMessage)}
        calls = []
        for m in messages:
            if isinstance(m, AIMessage):
                for tc in m.tool_calls:
                    calls.append((tc["name"], tc["args"], results.get(tc["id"], {})))
        return calls

    @staticmethod
    def _topic(question: str) -> str:
        q = question.split("Memory hint")[0].split("Your previous answer")[0]
        q = MATH_RE.sub(" ", q)
        # "remote_work_v9.9" -> "remote work" so search can recover the right policy
        q = re.sub(DOC_ID_PATTERN, lambda m: re.sub(r"_v\d.*$", "", m.group(0)).replace("_", " "), q)
        return re.sub(r"\s+", " ", q).strip()

    @staticmethod
    def _select_sentences(text: str, topic: str) -> List[str]:
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())[1:]   # skip title sentence
        q_tokens = set(tokenize(topic))
        wants_number = bool(q_tokens & NUMERIC_CUES)
        scored = []
        for i, s in enumerate(sentences):
            score = len(q_tokens & set(tokenize(s)))
            if wants_number and re.search(r"\d", s):
                score += 0.5
            scored.append((score, -i, s))
        scored.sort(reverse=True)
        best = scored[0][0] if scored else 0
        if best <= 0:
            return sentences[:1]
        picked = [x for x in scored if x[0] >= 0.5 * best][:2]
        picked.sort(key=lambda x: -x[1])            # back to document order
        return [s for _, _, s in picked]

    def _call(self, name: str, args: dict, thought: str, n: int) -> AIMessage:
        return AIMessage(content=f"Thought: {thought}",
                         tool_calls=[{"name": name, "args": args, "id": f"call_{n}_{name}"}])

    # -- main policy -------------------------------------------------------- #
    def _decide(self, messages: List[BaseMessage]) -> AIMessage:
        question = self._question(messages)
        history = self._history(messages)
        n = len(history)
        called = lambda name: [h for h in history if h[0] == name]
        read_ok = [h for h in called("read_policy") if h[2].get("ok")]
        read_failed = [h for h in called("read_policy") if not h[2].get("ok")]
        tried_ids = {h[1].get("doc_id") for h in called("read_policy")}

        math = MATH_RE.search(question.split("Memory hint")[0])
        if math and not called("calculator"):
            return self._call("calculator", {"expression": math.group(1)},
                              "The question contains arithmetic; use the calculator.", n)

        explicit = EXPLICIT_ID_RE.search(question)
        if explicit and explicit.group(1) not in tried_ids and not read_ok:
            return self._call("read_policy", {"doc_id": explicit.group(1)},
                              f"The user named doc_id {explicit.group(1)}; read it directly.", n)

        hint = HINT_ID_RE.search(question)
        if hint and hint.group(1) not in tried_ids and not read_ok:
            return self._call("read_policy", {"doc_id": hint.group(1)},
                              "Memory hint gives a doc_id; re-verify it with read_policy (cheaper than search).", n)

        if not read_ok:
            searches = called("policy_search")
            if not searches:
                why = ("read_policy failed (POLICY_NOT_FOUND); recover by searching the topic."
                       if read_failed else "I need to find the relevant policy first.")
                return self._call("policy_search", {"query": self._topic(question), "k": 3}, why, n)
            hits = searches[-1][2].get("data") or []
            for h in hits:
                if h["doc_id"] not in tried_ids and h["score"] > 0.05:
                    return self._call("read_policy", {"doc_id": h["doc_id"]},
                                      f"Top search hit is {h['doc_id']}; read the full text before quoting.", n)
            return AIMessage(content=NOT_FOUND_ANSWER)

        # ---- compose grounded final answer ---- #
        doc = read_ok[-1][2]["data"]
        doc_id = doc["doc_id"]
        picked = self._select_sentences(doc["text"], self._topic(question))
        parts = []
        calc = [h for h in called("calculator") if h[2].get("ok")]
        if calc:
            parts.append(f"{calc[-1][1]['expression']} = {calc[-1][2]['data']}.")
        if read_failed:
            parts.append(f"Note: policy '{read_failed[0][1].get('doc_id')}' was not found, "
                         f"so I used the closest match.")
        parts.append(" ".join(picked) + f" [{doc_id}]")
        quotes = "\n".join(f'Quote: "{s}" [{doc_id}]' for s in picked)
        return AIMessage(content=f"Answer: {' '.join(parts)}\n{quotes}")

    def _generate(self, messages: List[BaseMessage], stop: Optional[List[str]] = None,
                  run_manager: Any = None, **kwargs: Any) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._decide(messages))])


# --------------------------------------------------------------------------- #
# LLM factory
# --------------------------------------------------------------------------- #
def build_llm(settings: Optional[Settings] = None):
    s = settings or get_settings()
    if s.use_openai:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model=s.model_name, temperature=s.temperature, seed=s.seed)
    else:
        llm = OfflinePolicyModel()
    return llm.bind_tools(TOOLS)


# --------------------------------------------------------------------------- #
# Agent executor (ReAct loop)
# --------------------------------------------------------------------------- #
class PolicyAgent:
    def __init__(self, llm, settings: Settings, verbose: bool = True):
        self.llm = llm
        self.settings = settings
        self.verbose = verbose
        self.system_prompt = build_system_prompt(settings.max_iterations)

    def _say(self, msg: str) -> None:
        log.info(msg)
        if self.verbose:
            print(msg)

    def invoke(self, question: str) -> AgentResult:
        t0 = time.perf_counter()
        messages: List[BaseMessage] = [SystemMessage(self.system_prompt), HumanMessage(question)]
        traces: List[ToolCallTrace] = []
        self._say(f"\n> Question: {question}")

        for iteration in range(1, self.settings.max_iterations + 1):
            ai: AIMessage = self.llm.invoke(messages)
            messages.append(ai)
            if not ai.tool_calls:
                self._say(f"[step {iteration}] Final answer:\n{ai.content}")
                return AgentResult(answer=str(ai.content), iterations=iteration, tool_calls=traces,
                                   latency_ms=round((time.perf_counter() - t0) * 1000, 1))
            if ai.content:
                self._say(f"[step {iteration}] {ai.content}")
            for tc in ai.tool_calls:
                t1 = time.perf_counter()
                tool = TOOLS_BY_NAME.get(tc["name"])
                output = (tool.invoke(tc["args"]) if tool else
                          json.dumps({"ok": False, "error": {"error": "UNKNOWN_TOOL"}}))
                ok = bool(json.loads(output).get("ok"))
                traces.append(ToolCallTrace(step=iteration, tool=tc["name"], args=tc["args"], ok=ok,
                                            output_preview=output[:200],
                                            latency_ms=round((time.perf_counter() - t1) * 1000, 2)))
                self._say(f"[step {iteration}] Action: {tc['name']}({tc['args']})")
                self._say(f"[step {iteration}] Observation ({'ok' if ok else 'ERROR'}): {output[:160]}")
                messages.append(ToolMessage(content=output, tool_call_id=tc["id"]))

        self._say(f"Stopped: max_iterations={self.settings.max_iterations} reached")
        return AgentResult(answer="Stopped: step limit reached before a grounded answer was found.",
                           iterations=self.settings.max_iterations, tool_calls=traces,
                           stopped_reason="max_iterations",
                           latency_ms=round((time.perf_counter() - t0) * 1000, 1))


def build_agent(settings: Optional[Settings] = None, verbose: bool = True) -> PolicyAgent:
    s = settings or get_settings()
    return PolicyAgent(build_llm(s), s, verbose=verbose)


if __name__ == "__main__":
    agent = build_agent()
    print("LLM:", type(agent.llm).__name__)
    agent.invoke("What is our remote work limit? Cite and quote.")
    print("\n" + "=" * 70 + "\nBad-id recovery case")
    agent.invoke("Read policy remote_work_v9.9 and answer the limit.")
