# Project Summary

**Project Name:** RAG Maintenance Troubleshooter (`demo`)

**One-line Summary:** A retrieval-augmented generation pipeline that answers equipment technicians' troubleshooting questions by grounding responses in structured maintenance manuals (Markdown/PDF), citing the exact manual section for every claim.

**My Role/Contribution:** _[Placeholder — git history shows a single squashed commit authored by "Claude" (2026-08-05), so individual contribution/ownership can't be inferred from history alone. Fill in your actual role, e.g. "Designed and built the full pipeline solo" or "Owned chunking + retrieval; teammate handled CLI/prompt layer."]_

**Tech Stack:**
- **Language:** Python 3
- **LLM:** Anthropic Claude (Messages API, via `anthropic` SDK)
- **Retrieval/Search:** ChromaDB (vector store, persistent client), `rank-bm25` (BM25Okapi keyword search)
- **Data formats:** Markdown (YAML front matter), PDF (`pypdf`)
- **Testing:** pytest
- **Interface:** CLI (`ingest` / `ask` / `chat` / `search`)

**Key Features:**
- Answers natural-language troubleshooting questions grounded in the source manual, with every claim citing its manual section
- Structures answers as likely causes → diagnostic steps → safety notes → escalation guidance, so technicians get an actionable, safety-aware response rather than a raw text dump
- Supports both one-shot Q&A and interactive multi-turn chat sessions
- Filters retrieval by equipment model so answers stay specific to the unit in question
- Degrades gracefully to keyword-only search when the vector DB or embedding model is unavailable, instead of failing outright
- Includes a no-LLM `search` debug mode for inspecting retrieval quality directly

**Technical Highlights:**
- Built a structure-aware chunking pipeline that parses the Markdown heading hierarchy and keeps tables, numbered procedures, and safety warnings atomic during chunking, preventing fixed-size splitters from severing multi-step diagnostic procedures or spec tables mid-content — verified by targeted unit tests (`test_error_code_table_is_not_split`, `test_procedure_steps_stay_together`).
- Implemented hybrid retrieval combining BM25 keyword search with Chroma semantic search via Reciprocal Rank Fusion, addressing a concrete failure mode where near-identical error codes (e.g. "E45" vs "E52") are indistinguishable in embedding space but must resolve to different faults.
- Designed a fallback-safe architecture where ingestion and retrieval continue to function on BM25 alone if ChromaDB or network access is unavailable, avoiding a hard dependency on external embedding services.
- Wrote a safety-first system prompt constraining the model to answer only from retrieved context, surface safety warnings ahead of procedural steps, and ask clarifying questions on ambiguous equipment/fault combinations rather than guessing.

**Scale/Metrics:**
- 2 sample manuals shipped (XR-4000 air compressor, FP-200 centrifugal pump)
- ~812 lines of Python across 7 pipeline modules + CLI
- 2 test files (`test_chunking.py`, `test_retriever.py`) covering chunk integrity, safety-warning detection, and retrieval correctness (error-code, symptom, and model-filtered queries)
- No production usage/traffic data available in this repo

**Duration:** _Not inferable from git history — the repository contains a single commit (2026-08-05), so no first/last commit range exists to establish a development timeline._
