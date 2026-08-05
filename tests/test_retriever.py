from pathlib import Path

import pytest

from rag_troubleshooter.ingest import ingest_manuals
from rag_troubleshooter.retriever import ManualRetriever

MANUALS_DIR = Path(__file__).resolve().parent.parent / "manuals"


@pytest.fixture(scope="module")
def retriever(tmp_path_factory):
    store_dir = tmp_path_factory.mktemp("rag_store")
    ingest_manuals(manuals_dir=MANUALS_DIR, store_dir=store_dir)
    return ManualRetriever(store_dir)


def test_error_code_query_finds_matching_procedure(retriever):
    results = retriever.retrieve("compressor won't start error E45", k=5)
    assert any("5.1" in r["metadata"]["section_path"] for r in results)


def test_model_filter_excludes_other_equipment(retriever):
    results = retriever.retrieve("won't start", k=5, model="FP-200")
    assert results
    assert all(r["metadata"]["model"] == "FP-200" for r in results)


def test_symptom_query_finds_seal_leak_section(retriever):
    results = retriever.retrieve("pump is leaking at the seal", k=5, model="FP-200")
    assert any("Seal Leak" in r["metadata"]["section_path"] for r in results)


def test_low_oil_pressure_query_does_not_match_pump_manual(retriever):
    results = retriever.retrieve("low oil pressure E12", k=5, model="XR-4000")
    assert results
    assert all(r["metadata"]["model"] == "XR-4000" for r in results)
    assert any("5.2" in r["metadata"]["section_path"] for r in results)
