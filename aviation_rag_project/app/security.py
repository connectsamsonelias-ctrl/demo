"""Simple API-key authentication for the local /query endpoint."""

from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def require_api_key(x_api_key: str = Header(...)) -> None:
    expected = os.environ.get("AVIATION_RAG_API_KEY")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfigured: AVIATION_RAG_API_KEY is not set.",
        )
    if x_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
