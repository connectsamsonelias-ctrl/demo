from pathlib import Path

from rag_troubleshooter.chunking import build_chunks
from rag_troubleshooter.loaders import load_markdown

MANUALS_DIR = Path(__file__).resolve().parent.parent / "manuals"


def _chunks_for(filename):
    front_matter, body = load_markdown(MANUALS_DIR / filename)
    return front_matter, build_chunks(filename, front_matter, body)


def test_front_matter_parsed():
    front_matter, _ = load_markdown(MANUALS_DIR / "xr4000_compressor_manual.md")
    assert front_matter["model"] == "XR-4000"
    assert front_matter["manual_id"] == "XR4000-MM-07"


def test_error_code_table_is_not_split():
    _, chunks = _chunks_for("xr4000_compressor_manual.md")
    table_chunks = [c for c in chunks if c.metadata["chunk_type"] == "table" and "E45" in c.text]
    assert len(table_chunks) == 1
    assert "E12" in table_chunks[0].text
    assert "E88" in table_chunks[0].text


def test_procedure_steps_stay_together():
    _, chunks = _chunks_for("xr4000_compressor_manual.md")
    matches = [
        c
        for c in chunks
        if "Compressor Fails to Start" in c.metadata["section_path"] and c.metadata["chunk_type"] == "procedure"
    ]
    assert len(matches) >= 1
    diagnostic_chunk = next(c for c in matches if "certified electrician" in c.text)
    assert "1." in diagnostic_chunk.text and "5." in diagnostic_chunk.text


def test_safety_warnings_flagged():
    _, chunks = _chunks_for("xr4000_compressor_manual.md")
    warnings = [c for c in chunks if c.metadata["contains_safety_warning"]]
    assert warnings
    assert any("lock out" in c.text.lower() for c in warnings)


def test_every_chunk_has_section_header_prefix():
    _, chunks = _chunks_for("fp200_pump_manual.md")
    for c in chunks:
        assert c.text.startswith("[FP-200 Centrifugal Process Pump")


def test_no_chunk_exceeds_max_chars_by_much_for_prose():
    _, chunks = _chunks_for("fp200_pump_manual.md")
    for c in chunks:
        if c.metadata["chunk_type"] == "prose":
            assert len(c.text) < 1200
