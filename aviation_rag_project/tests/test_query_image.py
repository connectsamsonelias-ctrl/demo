import io
import sys
from pathlib import Path

import httpx
import respx
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.main as main_module  # noqa: E402
from app.rag_engine import AdvancedAviationRAG  # noqa: E402


def _fake_image_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4)).save(buf, format="JPEG")
    return buf.getvalue()


def _client_with_seeded_rag(tmp_path, monkeypatch):
    monkeypatch.setenv("AVIATION_RAG_API_KEY", "test-key")
    monkeypatch.setenv("CV_SERVICE_URL", "http://cv:8001")

    rag = AdvancedAviationRAG(db_path=str(tmp_path / "vdb"))
    rag.ingest_technical_chunk(
        "chunk_53",
        "ATA 53-10-00 - FUSELAGE - SKIN PANEL SURFACE DAMAGE ASSESSMENT\n"
        "1. Crack\nHairline cracks <= 5mm are within limits.",
        {"aircraft_model": "Airbus-A320", "ata_chapter": "53"},
    )
    main_module.rag_system = rag
    return TestClient(main_module.app)


@respx.mock
def test_query_image_happy_path_reuses_existing_retrieval(tmp_path, monkeypatch):
    client = _client_with_seeded_rag(tmp_path, monkeypatch)

    respx.post("http://cv:8001/detect").mock(
        return_value=httpx.Response(
            200,
            json={
                "detections": [
                    {"defect_type": "crack", "confidence": 0.91, "bbox": [1, 2, 3, 4]}
                ],
                "query_text": "crack detected by first-pass visual screening, "
                "confidence 0.91. What are the allowable limits and repair procedure?",
            },
        )
    )

    resp = client.post(
        "/query/image",
        headers={"X-API-Key": "test-key"},
        data={
            "wonum": "WO-1",
            "tail_number": "VT-IAF01",
            "ata_chapter": "53",
            "aircraft_type": "Airbus-A320",
        },
        files={"image": ("test.jpg", _fake_image_bytes(), "image/jpeg")},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is True
    assert "Hairline cracks" in body["dossier"]
    assert body["cv_detections"][0]["defect_type"] == "crack"
    assert "crack detected" in body["cv_query_text"]
    assert "TRIAGE AID ONLY" in body["triage_disclaimer"]
    assert "Roboflow" in body["dataset_disclaimer"]


@respx.mock
def test_query_image_no_match_still_returns_hardcoded_refusal(tmp_path, monkeypatch):
    client = _client_with_seeded_rag(tmp_path, monkeypatch)

    respx.post("http://cv:8001/detect").mock(
        return_value=httpx.Response(
            200,
            json={"detections": [], "query_text": "No visual defect detected by first-pass CV screening."},
        )
    )

    resp = client.post(
        "/query/image",
        headers={"X-API-Key": "test-key"},
        data={
            "wonum": "WO-2",
            "tail_number": "VT-IAF01",
            "ata_chapter": "99",  # no chunk ingested for this chapter
        },
        files={"image": ("test.jpg", _fake_image_bytes(), "image/jpeg")},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is False
    assert "DATA NOT FOUND IN APPROVED MANUAL" in body["message"]
    assert body["generated_answer"] is None


@respx.mock
def test_query_image_returns_503_when_cv_service_unreachable(tmp_path, monkeypatch):
    client = _client_with_seeded_rag(tmp_path, monkeypatch)

    respx.post("http://cv:8001/detect").mock(side_effect=httpx.ConnectError("refused"))

    resp = client.post(
        "/query/image",
        headers={"X-API-Key": "test-key"},
        data={"wonum": "WO-3", "tail_number": "VT-IAF01", "ata_chapter": "53"},
        files={"image": ("test.jpg", _fake_image_bytes(), "image/jpeg")},
    )

    assert resp.status_code == 503
    assert "unreachable" in resp.json()["detail"]


@respx.mock
def test_query_image_returns_503_when_cv_service_has_no_model(tmp_path, monkeypatch):
    client = _client_with_seeded_rag(tmp_path, monkeypatch)

    respx.post("http://cv:8001/detect").mock(
        return_value=httpx.Response(503, text="CV model weights not found at /app/models/defect_yolo.pt")
    )

    resp = client.post(
        "/query/image",
        headers={"X-API-Key": "test-key"},
        data={"wonum": "WO-4", "tail_number": "VT-IAF01", "ata_chapter": "53"},
        files={"image": ("test.jpg", _fake_image_bytes(), "image/jpeg")},
    )

    assert resp.status_code == 503
    assert "CV model weights not found" in resp.json()["detail"]


def test_query_image_requires_api_key(tmp_path, monkeypatch):
    client = _client_with_seeded_rag(tmp_path, monkeypatch)

    resp = client.post(
        "/query/image",
        data={"wonum": "WO-5", "tail_number": "VT-IAF01", "ata_chapter": "53"},
        files={"image": ("test.jpg", _fake_image_bytes(), "image/jpeg")},
    )

    assert resp.status_code in (401, 422)
