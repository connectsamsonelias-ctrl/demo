"""Phase 4 - chat LLM wrapper returning structured JSON.

Every call takes a deterministic `fallback` function. It is used when the backend is
offline, or when the API call / JSON parsing fails after retries, so the assistant
never crashes and never invents content outside the retrieved context.
"""
import json
import os
import re
import time

import config

_client = None


def redact(text: str) -> str:
    """Remove anything that looks like an API key before it reaches logs or outputs."""
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        text = text.replace(key, "***")
    return re.sub(r"(sk|voc)-[A-Za-z0-9_\-*]{4,}", r"\1-***", text)


def set_client(client) -> None:
    """Inject a client (used by tests with a fake model)."""
    global _client
    _client = client


def _get_client():
    global _client
    if _client is None:
        import embeddings
        _client = embeddings.get_client()
    return _client


def chat_json(system: str, user: str, fallback, retries: int = 2) -> tuple:
    """Return (parsed_dict, meta). meta records backend, model, latency and errors."""
    meta = {"backend": config.backend_name(), "model": config.CHAT_MODEL, "error": None,
            "used_fallback": False}
    t0 = time.time()
    if config.use_offline() and _client is None:
        meta.update(model="offline-template", used_fallback=True,
                    latency_s=round(time.time() - t0, 3))
        return fallback(), meta
    json_mode = True
    for attempt in range(retries + 1):
        try:
            kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}
            resp = _get_client().chat.completions.create(
                model=config.CHAT_MODEL, temperature=config.TEMPERATURE,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}], **kwargs)
            content = resp.choices[0].message.content or ""
            match = re.search(r"\{.*\}", content, flags=re.S)     # tolerate ```json fences
            data = json.loads(match.group(0) if match else content)
            if not isinstance(data, dict):
                raise ValueError("LLM did not return a JSON object")
            meta["latency_s"] = round(time.time() - t0, 3)
            meta["attempts"] = attempt + 1
            if meta["error"]:
                meta["recovered_error"], meta["error"] = meta["error"], None
            return data, meta
        except Exception as e:  # network, auth, rate limit, bad JSON
            meta["error"] = redact(f"{type(e).__name__}: {str(e)[:200]}")
            if "response_format" in str(e):
                json_mode = False          # endpoint without JSON mode: ask again without it
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    meta.update(used_fallback=True, latency_s=round(time.time() - t0, 3))
    return fallback(), meta
