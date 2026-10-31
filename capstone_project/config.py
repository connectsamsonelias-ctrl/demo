"""Central configuration: paths, model names and backend selection.

Backend rules
- RETAIL_OFFLINE=1            -> deterministic offline stand-ins (used by pytest)
- OPENAI_API_KEY set          -> real OpenAI-compatible API (Vocareum base URL)
- no key                      -> offline stand-ins, clearly labelled in every output
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_CSV = DATA_DIR / "retail_interactions.csv"
POLICY_JSON = DATA_DIR / "retail_policies.json"
PROCESSED_DIR = DATA_DIR / "processed"
LOGS_DIR = ROOT / "logs"
RESULTS_DIR = ROOT / "results"

for _d in (PROCESSED_DIR, LOGS_DIR, RESULTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

CLEAN_CSV = PROCESSED_DIR / "retail_clean.csv"
PRODUCT_DOCS_JSONL = PROCESSED_DIR / "product_docs.jsonl"
POLICY_DOCS_JSONL = PROCESSED_DIR / "policy_docs.jsonl"
SEGMENTS_CSV = RESULTS_DIR / "customer_segments.csv"
SEGMENT_PROFILE_CSV = RESULTS_DIR / "segment_profiles.csv"

RANDOM_STATE = 42
TOP_K = 5

DEFAULT_BASE_URL = "https://openai.vocareum.com/v1"
EMBED_MODEL = os.environ.get("RETAIL_EMBED_MODEL", "text-embedding-3-small")
CHAT_MODEL = os.environ.get("RETAIL_CHAT_MODEL", "gpt-4o-mini")
TEMPERATURE = 0.0

# Retrieval confidence thresholds (cosine similarity). Below these the answer
# path refuses or asks for clarification instead of guessing.
MIN_SCORE = {"openai": {"product": 0.20, "policy": 0.25},
             "offline": {"product": 0.12, "policy": 0.12}}


def use_offline() -> bool:
    """True when the offline stand-in backend must be used."""
    if os.environ.get("RETAIL_OFFLINE", "").strip() == "1":
        return True
    return not os.environ.get("OPENAI_API_KEY")


def backend_name() -> str:
    return "offline" if use_offline() else "openai"


def base_url() -> str:
    return os.environ.get("OPENAI_BASE_URL", DEFAULT_BASE_URL)
