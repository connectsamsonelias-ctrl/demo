import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cv_service import inference  # noqa: E402


def test_format_as_query_text_with_no_detections():
    assert inference.format_as_query_text([]) == (
        "No visual defect detected by first-pass CV screening."
    )


def test_format_as_query_text_uses_top_detection():
    detections = [
        {"defect_type": "crack", "confidence": 0.91, "bbox": [0, 0, 10, 10]},
        {"defect_type": "dent", "confidence": 0.42, "bbox": [5, 5, 15, 15]},
    ]
    text = inference.format_as_query_text(detections)
    assert "crack" in text
    assert "0.91" in text
    assert "dent" not in text


def test_load_model_raises_clear_error_when_weights_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("CV_MODEL_PATH", str(tmp_path / "does_not_exist.pt"))
    monkeypatch.setattr(inference, "MODEL_PATH", str(tmp_path / "does_not_exist.pt"))
    monkeypatch.setattr(inference, "_model", None)

    with pytest.raises(FileNotFoundError, match="not found"):
        inference.load_model()


def test_detect_defects_sorts_by_confidence_descending(monkeypatch, tmp_path):
    weights = tmp_path / "fake.pt"
    weights.write_bytes(b"not a real checkpoint - load_model is mocked below")
    monkeypatch.setattr(inference, "MODEL_PATH", str(weights))
    monkeypatch.setattr(inference, "_model", None)

    fake_box_low = MagicMock()
    fake_box_low.cls = [0]
    fake_box_low.conf = [0.30]
    fake_box_low.xyxy = [MagicMock(tolist=lambda: [1.0, 2.0, 3.0, 4.0])]

    fake_box_high = MagicMock()
    fake_box_high.cls = [1]
    fake_box_high.conf = [0.85]
    fake_box_high.xyxy = [MagicMock(tolist=lambda: [5.0, 6.0, 7.0, 8.0])]

    fake_result = MagicMock()
    fake_result.boxes = [fake_box_low, fake_box_high]
    fake_result.names = {0: "corrosion", 1: "crack"}

    fake_model = MagicMock()
    fake_model.predict.return_value = [fake_result]

    with patch.object(inference, "load_model", return_value=fake_model):
        # A 1x1 pixel JPEG, just enough for PIL to open successfully.
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (4, 4)).save(buf, format="JPEG")

        detections = inference.detect_defects(buf.getvalue())

    assert len(detections) == 2
    assert detections[0]["defect_type"] == "crack"
    assert detections[0]["confidence"] == 0.85
    assert detections[1]["defect_type"] == "corrosion"
