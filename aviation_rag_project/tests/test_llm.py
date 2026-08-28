import sys
from pathlib import Path

import httpx
import respx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import llm  # noqa: E402


def test_disabled_by_default_returns_none_without_any_http_call(monkeypatch):
    monkeypatch.delenv("LLM_ENABLED", raising=False)
    with respx.mock(assert_all_called=False) as router:
        route = router.post("http://ollama:11434/api/chat")
        result = llm.generate_answer("some dossier text", "a question")
        assert result is None
        assert route.call_count == 0


def test_explicitly_disabled_returns_none(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "false")
    result = llm.generate_answer("some dossier text", "a question")
    assert result is None


@respx.mock
def test_enabled_and_reachable_returns_generated_content(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:1.5b-instruct")

    respx.post("http://ollama:11434/api/chat").mock(
        return_value=httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": "Torque is 120 Nm."}},
        )
    )

    result = llm.generate_answer(
        dossier_text="--- MILITARY READINESS DOSSIER ---\ntorque is 120 Nm",
        question="What is the torque?",
    )
    assert result == "Torque is 120 Nm."


@respx.mock
def test_sends_zero_temperature_and_correct_model(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:1.5b-instruct")

    route = respx.post("http://ollama:11434/api/chat").mock(
        return_value=httpx.Response(200, json={"message": {"content": "ok"}})
    )

    llm.generate_answer("dossier", "question")

    assert route.call_count == 1
    sent_body = route.calls[0].request.content
    import json

    payload = json.loads(sent_body)
    assert payload["model"] == "qwen2.5:1.5b-instruct"
    assert payload["options"]["temperature"] == 0.0
    assert payload["messages"][0]["role"] == "system"
    assert "question" in payload["messages"][1]["content"].lower()


@respx.mock
def test_unreachable_server_returns_none_not_an_exception(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")

    respx.post("http://ollama:11434/api/chat").mock(
        side_effect=httpx.ConnectError("connection refused")
    )

    result = llm.generate_answer("dossier", "question")
    assert result is None


@respx.mock
def test_server_error_returns_none_not_an_exception(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")

    respx.post("http://ollama:11434/api/chat").mock(
        return_value=httpx.Response(500, json={"error": "internal error"})
    )

    result = llm.generate_answer("dossier", "question")
    assert result is None


@respx.mock
def test_empty_content_returns_none(monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")

    respx.post("http://ollama:11434/api/chat").mock(
        return_value=httpx.Response(200, json={"message": {"content": "   "}})
    )

    result = llm.generate_answer("dossier", "question")
    assert result is None
