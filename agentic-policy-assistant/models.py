"""
models.py  -  Task 1.1 (data prep) + shared schemas for every other task.

Contains:
  * Settings        - deterministic defaults (temperature 0, step limits, paths)
  * Policy          - pydantic schema for one row of data/policies.jsonl
  * load_policies() - loads + validates the corpus
  * Typed errors    - PolicyNotFoundError, CalculatorError
  * Tool I/O models - SearchHit, ToolResult
  * Agent / critic / memory models
  * GraphState      - the LangGraph state (TypedDict)

Run on its own to validate the corpus:
    python models.py
"""
from __future__ import annotations

import json
import os
import re
import warnings
from pathlib import Path
from typing import Any, List, Optional, TypedDict

from pydantic import BaseModel, Field, field_validator

# langchain-community prints a sunset notice on import; keep demo output clean
warnings.filterwarnings("ignore", message=".*langchain-community.*")

ROOT = Path(__file__).resolve().parent

# doc_ids look like  remote_work_v3  (lowercase words + _v<number>[.<number>])
DOC_ID_PATTERN = r"[a-z][a-z0-9_]*_v\d+(?:\.\d+)?"
DOC_ID_RE = re.compile(rf"\[({DOC_ID_PATTERN})\]")      # citation token: [doc_id]
QUOTE_RE = re.compile(r'"([^"]{8,})"')                     # a quoted span (>= 8 chars)


# --------------------------------------------------------------------------- #
# Settings (deterministic defaults)
# --------------------------------------------------------------------------- #
class Settings(BaseModel):
    model_name: str = Field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    embedding_model: str = "text-embedding-3-small"
    temperature: float = 0.0
    seed: int = 42
    max_iterations: int = 6          # agent loop: max LLM->tool rounds
    max_steps: int = 8               # graph: max node executions
    max_retries: int = 1             # graph: single retry when critic fails
    search_k: int = 3
    memory_threshold: float = 0.80   # cosine similarity needed for a memory hit
    data_path: Path = ROOT / "data" / "policies.jsonl"
    memory_dir: Path = ROOT / ".memory"
    log_dir: Path = ROOT / "logs"
    results_dir: Path = ROOT / "results"

    @property
    def use_openai(self) -> bool:
        """OpenAI is used only when a key is present and offline mode is not forced."""
        if os.getenv("POLICY_ASSISTANT_OFFLINE", "").lower() in {"1", "true", "yes"}:
            return False
        return bool(os.getenv("OPENAI_API_KEY"))


def get_settings(**overrides: Any) -> Settings:
    return Settings(**overrides)


# --------------------------------------------------------------------------- #
# Corpus
# --------------------------------------------------------------------------- #
class Policy(BaseModel):
    doc_id: str
    text: str
    date: str  # ISO date YYYY-MM-DD

    @field_validator("doc_id")
    @classmethod
    def _doc_id_format(cls, v: str) -> str:
        if not re.fullmatch(DOC_ID_PATTERN, v):
            raise ValueError(f"bad doc_id format: {v!r}")
        return v

    @field_validator("date")
    @classmethod
    def _date_format(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError(f"date must be YYYY-MM-DD, got {v!r}")
        return v

    @field_validator("text")
    @classmethod
    def _text_nonempty(cls, v: str) -> str:
        if len(v.strip()) < 20:
            raise ValueError("policy text too short")
        return v


def load_policies(path: Optional[Path] = None) -> List[Policy]:
    path = Path(path or get_settings().data_path)
    policies: List[Policy] = []
    seen: set[str] = set()
    with open(path, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip():
                continue
            p = Policy(**json.loads(line))
            if p.doc_id in seen:
                raise ValueError(f"duplicate doc_id {p.doc_id} on line {line_no}")
            seen.add(p.doc_id)
            policies.append(p)
    return policies


# --------------------------------------------------------------------------- #
# Typed errors (tool contracts)
# --------------------------------------------------------------------------- #
class PolicyToolError(Exception):
    """Base class for all tool errors. `code` is a stable machine-readable tag."""
    code = "TOOL_ERROR"

    def __init__(self, message: str, **details: Any):
        super().__init__(message)
        self.details = details

    def to_dict(self) -> dict:
        return {"error": self.code, "message": str(self), **self.details}


class PolicyNotFoundError(PolicyToolError):
    code = "POLICY_NOT_FOUND"


class CalculatorError(PolicyToolError):
    code = "CALCULATOR_ERROR"


# --------------------------------------------------------------------------- #
# Tool I/O
# --------------------------------------------------------------------------- #
class SearchHit(BaseModel):
    doc_id: str
    date: str
    score: float
    snippet: str


class ToolResult(BaseModel):
    ok: bool
    tool: str
    data: Any = None
    error: Optional[dict] = None


# --------------------------------------------------------------------------- #
# Agent, critic, memory
# --------------------------------------------------------------------------- #
class ToolCallTrace(BaseModel):
    step: int
    tool: str
    args: dict
    ok: bool
    output_preview: str
    latency_ms: float


class AgentResult(BaseModel):
    answer: str
    iterations: int
    tool_calls: List[ToolCallTrace] = Field(default_factory=list)
    stopped_reason: str = "final_answer"   # final_answer | max_iterations
    latency_ms: float = 0.0

    @property
    def doc_ids(self) -> List[str]:
        return DOC_ID_RE.findall(self.answer)


class CriticResult(BaseModel):
    valid: bool
    issues: List[str] = Field(default_factory=list)


class MemoryFact(BaseModel):
    question: str
    answer: str
    doc_ids: List[str]
    quote: str
    created_at: str


# --------------------------------------------------------------------------- #
# LangGraph state
# --------------------------------------------------------------------------- #
class GraphState(TypedDict, total=False):
    question: str
    plan: List[str]
    memory_hint: Optional[str]
    memory_hit: bool
    answer: str
    agent_iterations: int
    tool_calls: List[dict]
    critic: dict
    retries: int
    steps: int
    max_steps: int
    memory_written: bool
    stop_reason: str
    trace: List[dict]


if __name__ == "__main__":
    s = get_settings()
    policies = load_policies()
    print(f"Loaded {len(policies)} policies from {s.data_path}")
    for p in policies:
        print(f"  {p.doc_id:<22} {p.date}  {p.text[:60]}...")
    print(f"\nLLM backend: {'OpenAI ' + s.model_name if s.use_openai else 'offline deterministic model'}")
    print(f"temperature={s.temperature} max_iterations={s.max_iterations} max_steps={s.max_steps}")
