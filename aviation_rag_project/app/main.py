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

import logging
import os

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from .models import MaximoWorkOrderQuery, QueryResponse
from .rag_engine import AdvancedAviationRAG
from .security import require_api_key

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aviation_rag")

DB_PATH = os.environ.get("AVIATION_RAG_DB_PATH", "./aviation_vector_db")
SNAG_HISTORY_PATH = os.environ.get("AVIATION_RAG_SNAG_HISTORY_PATH", "./data/snag_history.json")

app = FastAPI(
    title="Aviation RAG API",
    description="Air-gapped, metadata-filtered RAG service for aircraft maintenance manuals.",
    version="0.1.0",
)

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


@app.post("/query", response_model=QueryResponse, dependencies=[Depends(require_api_key)])
def query(payload: MaximoWorkOrderQuery) -> QueryResponse | JSONResponse:
    """
    Accepts a Maximo work-order query payload, runs the metadata-filtered
    retrieval + snag-history join, and returns the resulting dossier.
    Requires a valid X-API-Key header.
    """
    assert rag_system is not None, "RAG engine not initialized"

    result = rag_system.query_with_snag_history(
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
    )
