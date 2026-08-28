"""
Optional local LLM generation step, layered on top of the pure-retrieval
pipeline in rag_engine.py.

Talks to a local Ollama server (no external network calls - Ollama itself
is a container on the same air-gapped Docker network) and turns the
retrieved manual dossier into a natural-language answer. Disabled by
default (LLM_ENABLED=false) since it adds real CPU load on top of what's
already running; the rest of the app works identically with or without it
- when disabled or unreachable, callers fall back to the raw retrieved
dossier text, which is the same behaviour this project already had.

Swapping the model (e.g. to a locally-hosted BharatGen build once its
licensing is confirmed) is a config change (OLLAMA_MODEL), not a code
change - this module has no model-specific logic in it.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger("aviation_rag")

SYSTEM_PROMPT = (
    "You are a strict aviation maintenance compliance assistant. Answer the "
    "technician's question using ONLY the information in the MILITARY "
    "READINESS DOSSIER provided below - never use outside knowledge, and "
    "never guess or estimate a value that is not explicitly stated in the "
    "dossier. If the dossier does not contain the specific parameter asked "
    "for, respond with exactly this sentence and nothing else: "
    "'DATA NOT FOUND IN APPROVED MANUAL.' "
    "Keep the answer concise and factual - state the value or instruction "
    "directly, mention any relevant safety warnings, and do not add "
    "commentary beyond what the dossier supports."
)


def generate_answer(dossier_text: str, question: str) -> str | None:
    """
    Sends the already-retrieved dossier text and the technician's question
    to the local Ollama server for a natural-language answer.

    Returns None (never raises) if generation is disabled, the server is
    unreachable, or anything goes wrong - callers should treat None as
    "fall back to showing the raw dossier text", not as an error to
    surface to the user. This keeps LLM generation a pure enhancement:
    the underlying retrieval + guardrail behaviour is unaffected either way.
    """
    llm_enabled = os.environ.get("LLM_ENABLED", "false").lower() == "true"
    if not llm_enabled:
        return None

    ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
    ollama_model = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b-instruct")
    timeout_seconds = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "120"))

    try:
        response = httpx.post(
            f"{ollama_base_url}/api/chat",
            json={
                "model": ollama_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"{dossier_text}\n\nTechnician's question: {question}",
                    },
                ],
                "options": {"temperature": 0.0},
                "stream": False,
            },
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "").strip()
        return content or None
    except Exception:
        logger.exception(
            "LLM generation failed (model=%s, url=%s) - falling back to raw retrieved text",
            ollama_model,
            ollama_base_url,
        )
        return None
