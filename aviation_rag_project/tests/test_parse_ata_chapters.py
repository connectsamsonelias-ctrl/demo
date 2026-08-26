import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.parse_ata_chapters import find_ata_headers, split_pages_into_chunks


def test_finds_standard_ata_header():
    text = "Refer to ATA 32-21-00 for landing gear torque values."
    headers = find_ata_headers(text)
    assert len(headers) == 1
    assert headers[0]["ata_chapter"] == "32"
    assert headers[0]["ata_section"] == "21"
    assert headers[0]["ata_subject"] == "00"
    assert headers[0]["ata_code"] == "32-21-00"


def test_finds_header_without_ata_prefix():
    text = "See 24-10-00 for electrical bus isolation procedure."
    headers = find_ata_headers(text)
    assert len(headers) == 1
    assert headers[0]["ata_code"] == "24-10-00"


def test_finds_header_with_task_suffix():
    text = "Procedure ATA 32-21-00-001 covers bolt torque."
    headers = find_ata_headers(text)
    assert len(headers) == 1
    assert headers[0]["ata_code"] == "32-21-00"


def test_finds_multiple_headers_in_one_block():
    text = "ATA 32-21-00 landing gear. Later, ATA 24-10-00 electrical."
    headers = find_ata_headers(text)
    assert [h["ata_code"] for h in headers] == ["32-21-00", "24-10-00"]


def test_split_pages_tags_chunks_with_correct_chapter():
    pages = [
        "ATA 32-21-00\nTorque limit is 120 Nm for the nose gear bolt.\n"
        "ATA 24-10-00\nBattery switches must be OFF before inspection."
    ]
    chunks = split_pages_into_chunks(pages, aircraft_model="Airbus-A320")
    assert len(chunks) == 2
    assert chunks[0]["metadata"]["ata_chapter"] == "32"
    assert "120 Nm" in chunks[0]["text_content"]
    assert chunks[1]["metadata"]["ata_chapter"] == "24"
    assert "OFF" in chunks[1]["text_content"]
