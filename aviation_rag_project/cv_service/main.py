"""
Standalone CV inference microservice.

Kept as its own container, separate from the main `api` service, so the
(large) torch/ultralytics dependency stays fully opt-in - the same design
already used for the optional local LLM (`ollama` service). Internal-only:
not published to the host, reachable only from the `api` container over
the shared Docker network at `http://cv:8001`.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile

from .inference import MODEL_PATH, detect_defects, format_as_query_text, load_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aviation_rag.cv")

app = FastAPI(title="Aviation RAG - CV Defect Detection (internal)")


@app.on_event("startup")
def startup() -> None:
    try:
        load_model()
        logger.info("CV model loaded successfully from %s", MODEL_PATH)
    except FileNotFoundError as e:
        # Log loudly but don't crash the process - /health then reports
        # the real, specific reason instead of the container endlessly
        # restart-looping with no visible cause.
        logger.error(str(e))


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": Path(MODEL_PATH).exists()}


@app.post("/detect")
async def detect(image: UploadFile = File(...)) -> dict:
    """
    Accepts an image upload, runs first-pass defect detection, and
    returns both the raw detections and a ready-to-use query_text string
    for the main app to feed into its existing retriever unchanged.
    """
    image_bytes = await image.read()
    try:
        detections = detect_defects(image_bytes)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    return {
        "detections": detections,
        "query_text": format_as_query_text(detections),
    }
