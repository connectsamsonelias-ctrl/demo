"""
Core retrieval engine for the Aviation RAG project.

Wraps a local, persistent ChromaDB collection with strict metadata
pre-filtering (aircraft model + ATA chapter) so queries never scan the
whole index, and joins the retrieved manual text with a tail number's
snag history before handing a prompt back to the caller.

No network calls are made anywhere in this module - the vector store is
a local directory on disk.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import chromadb

logger = logging.getLogger("aviation_rag")

NOT_FOUND_MESSAGE = "DATA NOT FOUND IN APPROVED MANUAL"


class AdvancedAviationRAG:
    def __init__(
        self,
        db_path: str = "./aviation_vector_db",
        collection_name: str = "a320_fleet_manuals",
        snag_history_path: str | None = None,
    ):
        """
        Initializes a secure, local, persistent vector storage database.
        No data ever leaves this machine - chromadb.PersistentClient writes
        only to `db_path` on local disk.
        """
        logger.info("Initializing localized data node at: %s", db_path)
        self.client = chromadb.PersistentClient(path=db_path)

        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        self.snag_history: dict[str, list[dict[str, Any]]] = {}
        if snag_history_path and Path(snag_history_path).exists():
            with open(snag_history_path, encoding="utf-8") as f:
                self.snag_history = json.load(f)

    def ingest_technical_chunk(
        self, chunk_id: str, text_content: str, metadata: dict[str, Any]
    ) -> None:
        """Ingests one parsed manual chunk with rigid structural metadata."""
        self.collection.add(
            documents=[text_content],
            metadatas=[metadata],
            ids=[chunk_id],
        )
        logger.info("Indexed chunk: %s", chunk_id)

    def get_snag_history(self, tail_number: str) -> list[dict[str, Any]]:
        return self.snag_history.get(tail_number, [])

    def query_with_snag_history(
        self,
        tail_number: str,
        query_text: str,
        ata_chapter: str,
        aircraft_type: str = "Airbus-A320",
        n_results: int = 1,
    ) -> dict[str, Any]:
        """
        Executes a metadata-filtered search and joins it with the tail
        number's chronological snag history. Returns a structured result
        rather than a printed string so the API layer can shape the
        response (and so a missing match is a normal return, not an
        exception).
        """
        history_records = self.get_snag_history(tail_number)
        history_summary = (
            "\n".join(
                f"- {r['date']}: Code {r['fault_code']} -> {r['action']}"
                for r in history_records
            )
            if history_records
            else "No previous identical snags reported for this tail number."
        )

        search_results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where={
                "$and": [
                    {"aircraft_model": aircraft_type},
                    {"ata_chapter": ata_chapter},
                ]
            },
        )

        documents = search_results.get("documents") or []
        if not documents or not documents[0]:
            return {
                "found": False,
                "message": f"ERROR: {NOT_FOUND_MESSAGE} FOR TARGET COMPLIANCE PARAMETERS.",
                "dossier": None,
                "history": history_records,
            }

        official_manual_text = documents[0][0]

        dossier = (
            f"--- MILITARY READINESS DOSSIER: {tail_number} ---\n"
            f"[HISTORICAL SNAG LOGS]:\n{history_summary}\n\n"
            f"[OFFICIAL AMM COMPLIANCE CONTEXT]:\n{official_manual_text}\n\n"
            f"--- SYSTEM COMPLIANCE BOUNDARY ---\n"
            f"Instruction: Formulate a maintenance response based strictly on combining "
            f"history and manual guidelines. If the data above does not explicitly state "
            f"the parameter, fail with an error code."
        )

        return {
            "found": True,
            "message": "OK",
            "dossier": dossier,
            "manual_text": official_manual_text,
            "history": history_records,
        }
