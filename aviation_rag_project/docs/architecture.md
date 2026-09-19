# Architecture

_Last updated: 2026-09-19_

## System overview

An offline, air-gapped retrieval system for aircraft maintenance manuals.
A technician (or, in the target end-state, an IBM Maximo work-order
trigger) submits a question scoped to a specific tail number, aircraft
model, and ATA chapter; the system returns either the exact matching
manual text (plus that aircraft's snag history) or a hardcoded refusal —
never a guess. Everything runs locally: the vector store, the optional
generation model, and the web UI are all local processes with no
outbound network dependency once built (see **Deployment** below).

The system is built from a single class, `AdvancedAviationRAG`
(`app/rag_engine.py`), adapted from an internal design playbook. A
FastAPI server (`app/main.py`) wraps it with a `/query` HTTP endpoint and
a browser chat UI; an optional local LLM (`app/llm.py`) can turn the
retrieved text into a natural-language answer.

## Retrieval pipeline

```
question + {tail_number, aircraft_type, ata_chapter}
        │
        ▼
  embedding                ChromaDB's embedded ONNX MiniLM-L6-v2 model
                            (baked into the Docker image at build time -
                            see Deployment)
        │
        ▼
  search                   ChromaDB query, hard-filtered by
                            {aircraft_model, ata_chapter} via a metadata
                            `$and` clause - the vector index is never
                            searched outside that partition
        │
        ├─ no match ──────────► REFUSAL (see below) - generation never runs
        │
        ▼ match found
  dossier assembly          retrieved chunk text + that tail number's
                            snag history (data/snag_history.json, a
                            mock relational-layer stand-in) combined into
                            a single "MILITARY READINESS DOSSIER" text block
        │
        ▼
  generation (optional)     if LLM_ENABLED=true: the dossier + question
                            are sent to a local Ollama server
                            (temperature=0.0, strict context-only system
                            prompt) for a natural-language answer.
                            Disabled by default; when disabled or if the
                            call fails/times out, the raw dossier text is
                            shown instead - generation is a convenience
                            layer, never the only path to an answer.
```

There is currently no hybrid BM25 + vector search and no reranking stage
(both are named as future work in the project README) - retrieval today
is pure dense vector search inside a hard metadata partition.

## Refusal logic

This is the core safety property of the system, and it is enforced in
plain Python, not by prompting a model:

`AdvancedAviationRAG.query_with_snag_history()` (`app/rag_engine.py`)
runs the ChromaDB query with the metadata filter above. If
`search_results["documents"]` comes back empty, the method returns
`{"found": False, "dossier": None, "message": "ERROR: DATA NOT FOUND IN
APPROVED MANUAL FOR TARGET COMPLIANCE PARAMETERS."}` and stops there.

In `app/main.py`'s `/query` handler, the optional LLM generation call is
only ever made when `result["found"]` is `True`:

```python
generated_answer = None
if result["found"]:
    generated_answer = llm.generate_answer(...)
```

So the refusal path **never reaches the LLM at all** - there is no
mechanism by which generation could turn a refusal into a guess. This is
deliberate and load-bearing: it means the safety guarantee holds even if
the LLM misbehaves, is swapped for a different model, or is disabled
entirely.

**A separate, distinct failure mode worth not confusing with the above:**
when the LLM *is* enabled and *is* called (i.e. `found=True`, real data
exists), the model can still independently produce the text
"DATA NOT FOUND IN APPROVED MANUAL." on its own, per its system prompt
instructions - if it gets confused by a complex question, for example.
This is a **model output**, not the guardrail firing - the dossier and
the manual data are real and present in that case; the model simply
answered badly. See `docs/failure-modes.md` (2026-08-28 entry) for a
concrete observed case. The architectural guarantee is that the *code's*
refusal can't be bypassed by generation; it does not guarantee the model
never says similar-looking words on its own when it souldn't.

## Deployment

Docker Compose, two services:

- `api` - the FastAPI app. Always runs.
- `ollama` - local LLM server (Qwen2.5 1.5B baked in at build time).
  Behind a Compose profile (`llm`) - only starts if explicitly requested
  (`docker compose --profile llm up`) and `LLM_ENABLED=true` is set.

**Why air-gapped, and what that actually means here:** the target
deployment context is a sovereign/defense network where routing to any
external service is prohibited by data-classification policy, regardless
of whether that service is malicious - the risk model is about the
existence of an exfiltration path, not about trusting any particular
endpoint. Two real leaks were found and fixed during development:
ChromaDB's default embedding function downloads a model from the
internet on first use, and ChromaDB's telemetry is on by default and
phones home to PostHog. Both are now baked in / disabled at build time
(commit `27761a3`) so the built image makes zero outbound calls at
runtime. The *build* step still needs internet once, to fetch base
images and bake in the embedding/LLM models - this is treated as
acceptable because it happens on a connected build machine, not the
air-gapped deployment target; the built image is then transferred via
`docker save`/`docker load` over offline media (see the project README's
Stage C).

One deliberate non-choice, documented for anyone revisiting it: an
earlier version added `internal: true` to the Docker network as an
extra egress-blocking guardrail. It was reverted (commit `2c327f7`)
after live testing on Docker Desktop for Windows/WSL2 showed it silently
broke published port forwarding on that platform - the host could no
longer reach the container at all. Real air-gapping is enforced by the
host machine/network having no route out, not by this compose setting;
it was pure defense-in-depth that ended up costing the one thing that
has to work.

## Current stage: prototype / demo

Stated plainly, without inflating maturity:

- **One manual, and it's synthetic.** `data/manuals/synthetic_a320_manual.pdf`
  is a 3-page, entirely made-up test document (fake torque values, fake
  part numbers, explicitly labeled "NOT A REAL MANUAL" on every page),
  covering exactly three ATA chapters (32-21-00, 24-10-00, 79-00-00). No
  real aircraft maintenance manual has been ingested or tested against.
- **Mock work-order and snag-history data.** `data/snag_history.json` is
  a hand-written stand-in for what would be a Maximo relational query.
  The `/query` payload shape matches Maximo's expected work-order fields,
  but there is no live Maximo Integration Framework (MIF) connection -
  that integration has not been built.
- **No load testing, no concurrency testing.** The system has been
  exercised by one person, one request at a time, on two personal Windows
  laptops (via Docker Desktop/WSL2). Behaviour under concurrent requests,
  larger manual corpora, or sustained load is unknown.
- **No automated evaluation harness yet.** Retrieval correctness and
  refusal accuracy have been checked manually, ad hoc, during development
  (see `docs/evaluation.md`) - not via a repeatable, scripted test suite
  with tracked metrics over time. Building that harness is the explicit
  purpose of `docs/evaluation.md`.
- **The LLM generation layer is known to be unreliable on complex
  questions** on the reference hardware tested (see
  `docs/failure-modes.md`) and is off by default for that reason, among
  others (also: ~2 minute latency per answer on CPU-only hardware with no
  GPU).

What *is* solid: the retrieval + refusal path itself, the ATA-chapter
parsing regex, and the LLM fallback behavior - all covered by 19 passing
automated unit tests as of this writing (`tests/test_parse_ata_chapters.py`:
5, `tests/test_watch_and_ingest.py`: 7, `tests/test_llm.py`: 7). These are
unit tests with mocked dependencies (mocked HTTP for the LLM, temp
directories for file operations) - not integration tests against a real
Ollama server or a real multi-manual ChromaDB index, and not what
`docs/evaluation.md` tracks (retrieval/refusal accuracy against real
content).
