import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.watch_and_ingest import (
    file_fingerprint,
    find_new_or_changed,
    load_state,
    save_state,
)


def test_fingerprint_changes_when_content_changes(tmp_path):
    pdf = tmp_path / "manual.pdf"
    pdf.write_bytes(b"version one content")
    fp1 = file_fingerprint(pdf)

    pdf.write_bytes(b"version two content, edited")
    fp2 = file_fingerprint(pdf)

    assert fp1 != fp2


def test_fingerprint_stable_for_unchanged_file(tmp_path):
    pdf = tmp_path / "manual.pdf"
    pdf.write_bytes(b"same content")
    assert file_fingerprint(pdf) == file_fingerprint(pdf)


def test_state_round_trips_through_disk(tmp_path):
    state_path = tmp_path / "sub" / "_ingest_state.json"
    save_state(state_path, {"a.pdf": "abc123"})
    assert load_state(state_path) == {"a.pdf": "abc123"}


def test_load_state_missing_file_returns_empty_dict(tmp_path):
    assert load_state(tmp_path / "does_not_exist.json") == {}


def test_find_new_or_changed_detects_new_files(tmp_path):
    manuals_dir = tmp_path / "manuals"
    manuals_dir.mkdir()
    (manuals_dir / "manual_a.pdf").write_bytes(b"manual A content")
    (manuals_dir / "manual_b.pdf").write_bytes(b"manual B content")

    pending = find_new_or_changed(manuals_dir, state={})
    assert {p.name for p, _ in pending} == {"manual_a.pdf", "manual_b.pdf"}


def test_find_new_or_changed_skips_already_ingested_unchanged_file(tmp_path):
    manuals_dir = tmp_path / "manuals"
    manuals_dir.mkdir()
    pdf = manuals_dir / "manual_a.pdf"
    pdf.write_bytes(b"manual A content")

    state = {"manual_a.pdf": file_fingerprint(pdf)}
    pending = find_new_or_changed(manuals_dir, state)
    assert pending == []


def test_find_new_or_changed_detects_edited_file(tmp_path):
    manuals_dir = tmp_path / "manuals"
    manuals_dir.mkdir()
    pdf = manuals_dir / "manual_a.pdf"
    pdf.write_bytes(b"original content")

    state = {"manual_a.pdf": file_fingerprint(pdf)}
    pdf.write_bytes(b"edited content, new revision")

    pending = find_new_or_changed(manuals_dir, state)
    assert len(pending) == 1
    assert pending[0][0].name == "manual_a.pdf"
