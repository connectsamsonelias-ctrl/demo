"""Pydantic request/response schemas for the /query endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MaximoWorkOrderQuery(BaseModel):
    """
    Shape of the inbound payload from an IBM Maximo work order trigger
    (via the Maximo Integration Framework / MIF). Field names follow
    common Maximo work-order attributes; rename to match your actual
    MIF publish channel if it differs.
    """

    wonum: str = Field(..., description="Maximo work order number, e.g. WO-88213")
    tail_number: str = Field(..., description="Aircraft tail number, e.g. VT-IAF01")
    aircraft_type: str = Field(default="Airbus-A320", description="Aircraft model/fleet")
    ata_chapter: str = Field(..., description="ATA chapter to constrain the search, e.g. '32'")
    query_text: str = Field(..., description="Fault description / technician question")

    class Config:
        json_schema_extra = {
            "example": {
                "wonum": "WO-88213",
                "tail_number": "VT-IAF01",
                "aircraft_type": "Airbus-A320",
                "ata_chapter": "32",
                "query_text": "What is the torque specification for the nose gear assembly bolt?",
            }
        }


class QueryResponse(BaseModel):
    wonum: str
    tail_number: str
    found: bool
    message: str
    dossier: str | None = None
    history: list[dict] = []
