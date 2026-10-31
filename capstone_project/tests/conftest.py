"""pytest setup: force the deterministic offline backend so tests never call the API."""
import os
import sys
from pathlib import Path

os.environ["RETAIL_OFFLINE"] = "1"
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _isolated_outputs(tmp_path_factory):
    """Write every test artefact to a temp copy so real results/ and logs/ stay untouched."""
    import shutil
    import config
    tmp = tmp_path_factory.mktemp("run")
    real_results = config.RESULTS_DIR
    for name in ("results", "logs", "processed"):
        (tmp / name).mkdir()
    for f in real_results.glob("*"):
        if f.is_file() and f.suffix in {".json", ".csv"}:
            shutil.copy(f, tmp / "results" / f.name)
    for f in config.PROCESSED_DIR.glob("*"):
        if f.is_file() and f.suffix in {".csv", ".jsonl"}:
            shutil.copy(f, tmp / "processed" / f.name)
    config.RESULTS_DIR, config.LOGS_DIR = tmp / "results", tmp / "logs"
    config.PROCESSED_DIR = tmp / "processed"
    config.CLEAN_CSV = config.PROCESSED_DIR / "retail_clean.csv"
    config.PRODUCT_DOCS_JSONL = config.PROCESSED_DIR / "product_docs.jsonl"
    config.POLICY_DOCS_JSONL = config.PROCESSED_DIR / "policy_docs.jsonl"
    config.SEGMENTS_CSV = config.RESULTS_DIR / "customer_segments.csv"
    config.SEGMENT_PROFILE_CSV = config.RESULTS_DIR / "segment_profiles.csv"
    if not (config.RESULTS_DIR / "ml_summary.json").exists():
        import data_prep
        import supervised
        supervised.run_all(data_prep.load_clean())
    yield


@pytest.fixture(scope="session")
def clean_df(_isolated_outputs):
    import data_prep
    return data_prep.clean(data_prep.load_raw())


@pytest.fixture(autouse=True)
def _no_real_client():
    import llm
    llm.set_client(None)
    yield
    llm.set_client(None)


class FakeChoice:
    def __init__(self, content):
        self.message = type("M", (), {"content": content})()


class FakeClient:
    """Stand-in chat model: returns a fixed JSON string for every call."""
    def __init__(self, content: str):
        self.calls = 0
        outer = self

        class _Completions:
            def create(self, **kwargs):
                outer.calls += 1
                outer.last_kwargs = kwargs
                return type("R", (), {"choices": [FakeChoice(content)]})()
        self.chat = type("C", (), {"completions": _Completions()})()


@pytest.fixture
def fake_llm():
    import llm

    def make(content: str):
        client = FakeClient(content)
        llm.set_client(client)
        return client
    return make
