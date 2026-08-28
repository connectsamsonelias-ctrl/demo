# Project Summary

## Project Name
Aviation RAG — Air-Gapped Aircraft Maintenance Retrieval System

## One-line Summary
A fully offline, containerized retrieval system that lets maintenance technicians ask natural-language questions about aircraft manuals and get answers grounded strictly in retrieved manual text — with a hardcoded refusal instead of a guess whenever the manual doesn't cover the question.

## My Role/Contribution
Sole developer — designed, built, and tested the complete system (backend, retrieval pipeline, deployment tooling, and UI) end to end, including live verification on real Windows/Docker hardware.

## Tech Stack
- **Language:** Python 3.11
- **Backend:** FastAPI, Pydantic, Uvicorn
- **Retrieval / storage:** ChromaDB (persistent local vector store, cosine similarity)
- **LLM inference (optional):** Ollama, Qwen2.5 1.5B-Instruct (Apache 2.0)
- **Document processing:** PyMuPDF (PDF text extraction), custom regex-based ATA iSpec 2200 chapter parser
- **Frontend:** Server-rendered HTML/CSS/vanilla JS chat UI (Jinja2 templates), no build step or external CDN dependency
- **Infrastructure:** Docker, Docker Compose (multi-service with opt-in profiles), Windows/WSL2
- **Testing:** pytest, respx (HTTP mocking), Playwright (browser-level UI verification)

## Key Features
- Natural-language chat interface for querying aircraft maintenance manuals, scoped by tail number, aircraft type, and ATA chapter
- Automatic extraction of ATA iSpec 2200 chapter/section headers from raw manual PDFs, with structured metadata tagging per chunk
- Deterministic "not found" safety guardrail: the system refuses to answer rather than guess when a manual doesn't cover the query — enforced in code before any LLM is ever called
- Optional local LLM generation layer that turns retrieved manual text into a natural-language answer, with the exact source text always kept one click away for verification
- Automated ingestion pipeline that detects new or changed manuals by content hash and indexes only what's changed, safe to run on a recurring schedule
- REST API designed for direct integration with IBM Maximo work-order triggers, in addition to the human-facing chat UI

## Technical Highlights
- Designed and shipped a two-stage retrieval architecture (metadata-filtered ChromaDB search + optional LLM generation) with a strict content-first guardrail, ensuring the LLM path can never override or soften a "data not found" refusal — eliminating a class of hallucination risk by construction rather than by prompting alone
- Identified and closed two silent air-gap violations in a third-party vector database dependency (an on-first-use model download and default telemetry reporting) by restructuring the Docker build to bake all required assets in at build time, achieving genuine zero-network-calls behavior at runtime
- Built a Compose-profile-based deployment (`--profile llm`) that makes an entire optional service (local LLM inference) a single-flag opt-in with zero risk to the already-working default path, verified via 7 dedicated unit tests covering the disabled-by-default, success, and every failure-mode branch
- Diagnosed and resolved a platform-specific Docker networking regression (an `internal: true` guardrail that silently broke published port forwarding specifically on Docker Desktop for Windows/WSL2, while behaving as documented on native Linux) through live testing rather than assumption, then documented the finding to prevent recurrence
- Validated the full offline deployment path end to end: built and exported multi-gigabyte container images via `docker save`, transferred them via physical USB media, and loaded/ran them on a second machine with zero network dependency, proving the air-gapped deployment model works in practice, not just in design
- Measured real local-LLM inference performance on representative low-power CPU-only hardware (~2 minutes per answer, no GPU) rather than assuming feasibility, and used that data to correct an initially too-aggressive request timeout that was causing silent failures

## Scale/Metrics
- 19 automated tests across 3 test suites (parsing, ingestion, and LLM integration), all passing
- 14 Python source files across a modular app/scripts/tests structure
- 2 Docker images: ~360 MB (application) and ~4.3 GB (LLM inference engine + model), verified transferable via offline media
- Prototype/demo scale: single synthetic test manual and mock work-order data; not yet measured against production document volume or concurrent user load

## Duration
August 26, 2026 – August 28, 2026 (active development, ~3 days across 10 commits)
