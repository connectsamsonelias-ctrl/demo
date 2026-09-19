"""
YOLO-based first-pass visual defect detection.

**This is a triage aid, not a certified inspection decision.** It produces
a plain-text flag (defect type + confidence) that feeds into the existing
RAG retriever exactly as if a technician had typed a question - it never
outputs a pass/fail verdict, and a human inspector always makes the final
call. See app/main.py's `/query/image` handler for how the flag is joined
with the existing retrieval + refusal logic (both unchanged).

Model weights are baked into the Docker image at build time, same air-gap
principle as the embedding model and the LLM elsewhere in this project -
this module never downloads anything at runtime. Until a fine-tuned
checkpoint exists (see scripts/train_defect_model.py), MODEL_PATH points
at a file that does not exist yet; the service starts anyway and reports
the real reason via /health and a 503 on /detect, rather than either
crash-looping or silently serving nonsense from an untrained model.
"""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path

logger = logging.getLogger("aviation_rag.cv")

MODEL_PATH = os.environ.get("CV_MODEL_PATH", "/app/models/defect_yolo.pt")
CONFIDENCE_THRESHOLD = float(os.environ.get("CV_CONFIDENCE_THRESHOLD", "0.25"))

# Canonical merged class list across both source datasets (see
# scripts/prepare_cv_dataset.py) - both datasets used slightly different
# naming for overlapping defect types, normalized to these 6 during data
# prep, before fine-tuning.
DEFECT_CLASSES = [
    "crack",
    "dent",
    "scratch",
    "paint-peel-off",
    "missing-head",
    "corrosion",
]

_model = None


def load_model():
    """
    Loads the fine-tuned YOLO checkpoint from local disk. Raises
    FileNotFoundError (not a generic exception) if the weights aren't
    present, so callers can distinguish "not trained/deployed yet" from
    a real inference failure.
    """
    global _model
    if _model is not None:
        return _model

    if not Path(MODEL_PATH).exists():
        raise FileNotFoundError(
            f"CV model weights not found at {MODEL_PATH}. This service "
            f"requires a fine-tuned checkpoint (see "
            f"scripts/train_defect_model.py) baked into the image at build "
            f"time - it will not download one at runtime, per this "
            f"project's air-gap requirement."
        )

    from ultralytics import YOLO  # deferred: keeps import cost off the

    # health-check-only path when the model isn't present yet.
    logger.info("Loading CV model from %s", MODEL_PATH)
    _model = YOLO(MODEL_PATH)
    return _model


def detect_defects(image_bytes: bytes) -> list[dict]:
    """
    Runs first-pass defect detection on an image. Returns detections
    sorted by confidence descending, each a dict with `defect_type`,
    `confidence` (0-1 float), and `bbox` ([x1, y1, x2, y2] pixels). An
    empty list means "nothing detected above threshold" - a normal
    result, not an error.
    """
    from PIL import Image

    model = load_model()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    results = model.predict(image, conf=CONFIDENCE_THRESHOLD, verbose=False)

    detections = []
    for result in results:
        for box in result.boxes:
            class_id = int(box.cls[0])
            class_name = result.names.get(class_id, f"class_{class_id}")
            confidence = float(box.conf[0])
            bbox = [round(float(v), 1) for v in box.xyxy[0].tolist()]
            detections.append(
                {
                    "defect_type": class_name,
                    "confidence": round(confidence, 4),
                    "bbox": bbox,
                }
            )

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections


def format_as_query_text(detections: list[dict]) -> str:
    """
    Formats the top detection as plain text for the existing RAG
    retriever's `query_text` field - the exact same input shape a typed
    question would produce, so the retrieval/refusal logic downstream is
    completely unaware this came from an image rather than a keyboard.
    """
    if not detections:
        return "No visual defect detected by first-pass CV screening."

    top = detections[0]
    return (
        f"{top['defect_type']} detected by first-pass visual screening, "
        f"confidence {top['confidence']:.2f}. What are the allowable "
        f"limits and repair procedure?"
    )
