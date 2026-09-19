"""
Aviation RAG FastAPI server.

Exposes a single secure POST /query endpoint that Maximo (via the Maximo
Integration Framework) calls with work-order data. The server looks up
the matching manual chunk in the local ChromaDB store, strictly
pre-filtered by aircraft model + ATA chapter, joins it with the tail
number's snag history, and returns a structured dossier - or a hardcoded
"not found" response if the manual doesn't cover the query.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from . import llm
from .models import CVDetection, ImageQueryResponse, MaximoWorkOrderQuery, QueryResponse
from .rag_engine import AdvancedAviationRAG
from .security import require_api_key

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aviation_rag")

DB_PATH = os.environ.get("AVIATION_RAG_DB_PATH", "./aviation_vector_db")
SNAG_HISTORY_PATH = os.environ.get("AVIATION_RAG_SNAG_HISTORY_PATH", "./data/snag_history.json")
CV_SERVICE_URL = os.environ.get("CV_SERVICE_URL", "http://cv:8001")

app = FastAPI(
    title="Aviation RAG API",
    description="Air-gapped, metadata-filtered RAG service for aircraft maintenance manuals.",
    version="0.1.0",
)

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

rag_system: AdvancedAviationRAG | None = None


@app.on_event("startup")
def load_rag_system() -> None:
    global rag_system
    rag_system = AdvancedAviationRAG(
        db_path=DB_PATH,
        snag_history_path=SNAG_HISTORY_PATH,
    )
    logger.info("Aviation RAG engine ready (db_path=%s)", DB_PATH)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def chat_ui(request: Request) -> HTMLResponse:
    """
    Serves the browser-based chat UI. The API key is read server-side from
    the environment and injected into the page here - it never needs to be
    typed or seen by the person using the browser. This page is meant for
    trusted local/LAN use only (it has no login of its own); the /query
    endpoint it calls still enforces the API key underneath.
    """
    api_key = os.environ.get("AVIATION_RAG_API_KEY", "")
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"api_key_json": json.dumps(api_key)},
    )


def _run_retrieval(
    tail_number: str, query_text: str, ata_chapter: str, aircraft_type: str
) -> dict:
    """
    Shared retrieval + optional-generation logic, used identically by
    both /query (typed text) and /query/image (CV-derived text) - neither
    the retrieval/refusal engine nor the LLM call is aware of, or changed
    by, which caller produced query_text.
    """
    assert rag_system is not None, "RAG engine not initialized"

    result = rag_system.query_with_snag_history(
        tail_number=tail_number,
        query_text=query_text,
        ata_chapter=ata_chapter,
        aircraft_type=aircraft_type,
    )

    # Only ever generate from a dossier that was actually found - the
    # not-found guardrail response never reaches the LLM, so it can't be
    # second-guessed or paraphrased into something less strict.
    generated_answer = None
    if result["found"]:
        generated_answer = llm.generate_answer(
            dossier_text=result["dossier"],
            question=query_text,
        )
    result["generated_answer"] = generated_answer
    return result


@app.post("/query", response_model=QueryResponse, dependencies=[Depends(require_api_key)])
def query(payload: MaximoWorkOrderQuery) -> QueryResponse | JSONResponse:
    """
    Accepts a Maximo work-order query payload, runs the metadata-filtered
    retrieval + snag-history join, and returns the resulting dossier.
    Requires a valid X-API-Key header.
    """
    result = _run_retrieval(
        tail_number=payload.tail_number,
        query_text=payload.query_text,
        ata_chapter=payload.ata_chapter,
        aircraft_type=payload.aircraft_type,
    )

    return QueryResponse(
        wonum=payload.wonum,
        tail_number=payload.tail_number,
        found=result["found"],
        message=result["message"],
        dossier=result["dossier"],
        history=result["history"],
        generated_answer=result["generated_answer"],
    )


@app.post(
    "/query/image",
    response_model=ImageQueryResponse,
    dependencies=[Depends(require_api_key)],
)
async def query_image(
    wonum: str = Form(...),
    tail_number: str = Form(...),
    ata_chapter: str = Form(..., description="Technician-selected ATA chapter for the component in the photo"),
    aircraft_type: str = Form(default="Airbus-A320"),
    image: UploadFile = File(...),
) -> ImageQueryResponse:
    """
    Accepts a component photo plus technician-selected tail number/ATA
    chapter, runs first-pass CV defect detection, and feeds the resulting
    flag into the exact same retrieval + refusal + optional-generation
    pipeline as a typed question - see _run_retrieval(). The CV model
    does not, and cannot, choose the ATA chapter itself: defect type alone
    (crack, dent, etc.) doesn't imply which manual chapter covers it, so
    the technician still supplies that, same as with a typed query.

    Returns a triage flag, never a pass/fail determination - see
    CV_TRIAGE_DISCLAIMER in app/models.py, echoed in every response.
    """
    image_bytes = await image.read()

    try:
        response = httpx.post(
            f"{CV_SERVICE_URL}/detect",
            files={"image": (image.filename, image_bytes, image.content_type)},
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        # The CV service itself returns 503 when no fine-tuned model has
        # been baked in yet (see docker/Dockerfile.cv) - surface that
        # reason rather than a generic failure.
        raise HTTPException(
            status_code=503,
            detail=f"CV service error: {e.response.text}",
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"CV service unreachable at {CV_SERVICE_URL} - is it running "
            f"(docker compose --profile cv up)? ({e})",
        ) from e

    cv_result = response.json()
    cv_query_text = cv_result["query_text"]

    result = _run_retrieval(
        tail_number=tail_number,
        query_text=cv_query_text,
        ata_chapter=ata_chapter,
        aircraft_type=aircraft_type,
    )

    return ImageQueryResponse(
        wonum=wonum,
        tail_number=tail_number,
        found=result["found"],
        message=result["message"],
        dossier=result["dossier"],
        history=result["history"],
        generated_answer=result["generated_answer"],
        cv_detections=[CVDetection(**d) for d in cv_result["detections"]],
        cv_query_text=cv_query_text,
    )
