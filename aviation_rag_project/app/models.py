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
    generated_answer: str | None = Field(
        default=None,
        description="Natural-language answer from the local LLM, when LLM_ENABLED=true "
        "and generation succeeds. None when disabled, unreachable, or the manual "
        "chunk wasn't found - callers should fall back to `dossier` in that case.",
    )


CV_TRIAGE_DISCLAIMER = (
    "TRIAGE AID ONLY - NOT A CERTIFIED INSPECTION DECISION. This is a "
    "first-pass computer-vision screening result, not a pass/fail "
    "determination. A qualified human inspector must review the "
    "component and make the final airworthiness call."
)

CV_DATASET_DISCLAIMER = (
    "The defect-detection model was fine-tuned on public research "
    "datasets (Roboflow: ddiisc/aircraft_skin_defects, "
    "lemi-debele/aircraft-surface-damage) - not certified production "
    "inspection data."
)


class CVDetection(BaseModel):
    defect_type: str
    confidence: float
    bbox: list[float]


class ImageQueryResponse(QueryResponse):
    """
    Extends QueryResponse with CV-specific fields. The retrieval/refusal
    fields it inherits (found, message, dossier, history, generated_answer)
    behave identically to a typed-question /query call - the CV flag is
    only ever used to produce `cv_query_text`, which is fed into the same
    unmodified retrieval pipeline as any other query_text.
    """

    cv_detections: list[CVDetection]
    cv_query_text: str
    triage_disclaimer: str = CV_TRIAGE_DISCLAIMER
    dataset_disclaimer: str = CV_DATASET_DISCLAIMER
