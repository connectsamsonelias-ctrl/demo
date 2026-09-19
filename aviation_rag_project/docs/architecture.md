# Architecture

_Last updated: 2026-09-19 (CV first-pass defect check added)_

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

### Alternative entry point: CV-derived queries

`POST /query/image` (added alongside the CV first-pass defect check, see
below) produces `query_text` a different way - a photo instead of typed
words - but feeds it into this exact same pipeline from the `search`
stage onward. `cv_service/inference.py` runs a YOLO model on the uploaded
image and formats the top detection as
`"<defect_type> detected by first-pass visual screening, confidence
<n>. What are the allowable limits and repair procedure?"`, then
`app/main.py`'s shared `_run_retrieval()` helper treats that exactly like
a typed question - the retrieval, refusal, and generation logic have no
awareness of, or special case for, where `query_text` came from.

**The CV model does not, and cannot, choose the ATA chapter.** A defect
label ("crack", "corrosion") doesn't imply which manual chapter covers
it - that mapping doesn't exist in this system, and building it (e.g. a
defect-type → ATA-chapter lookup) was a deliberate scope decision left
out for now, not an oversight. The technician still supplies
`tail_number`/`aircraft_type`/`ata_chapter` manually alongside the photo,
same as with a typed query. See `README.md`'s Stage G for the full
feature writeup, and `docs/failure-modes.md` for a known consequence of
this: retrieval will happily match a semantically-unrelated CV label
against whatever single chunk exists for the chosen ATA chapter (since
`n_results=1` has no similarity threshold) - not a bug introduced by CV,
but a pre-existing behavior this new entry point exercises more visibly.

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

Docker Compose, three services:

- `api` - the FastAPI app. Always runs.
- `ollama` - local LLM server (Qwen2.5 1.5B baked in at build time).
  Behind a Compose profile (`llm`) - only starts if explicitly requested
  (`docker compose --profile llm up`) and `LLM_ENABLED=true` is set.
- `cv` - the CV defect-detection microservice (`cv_service/`, built from
  `docker/Dockerfile.cv`). Behind a Compose profile (`cv`), same
  opt-in pattern as `ollama`, for the same reason: keeps a large ML
  dependency (`torch`/`ultralytics`) out of the always-on `api` image.
  As of this writing, no fine-tuned model has been baked into this image
  - see "Current stage" below - so it builds and starts, but `/detect`
  returns a `503` naming that reason.

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
- **The CV defect model is not fine-tuned yet - `models/defect_yolo.pt`
  does not exist.** The full pipeline (photo → detection → retrieval →
  disclaimers) was verified end-to-end using a stock pretrained YOLOv8n
  checkpoint, which correctly proves the wiring but recognizes generic
  COCO objects (buses, people), not aircraft skin defects - it has never
  produced a real defect classification. Fine-tuning requires (1) a
  machine that can reach `universe.roboflow.com` (this project's dev
  sandbox is directly confirmed blocked from it) and (2) real GPU compute
  (not tested on the reference Windows laptops, which already struggle
  with far smaller CPU-only LLM inference). See README Stage G for the
  full pipeline.

What *is* solid: the retrieval + refusal path itself, the ATA-chapter
parsing regex, the LLM fallback behavior, and the CV→retrieval wiring
(including its failure modes: CV service unreachable, model not yet
baked in) - all covered by 34 passing automated unit tests as of this
writing (`tests/test_parse_ata_chapters.py`: 5, `tests/test_watch_and_ingest.py`:
7, `tests/test_llm.py`: 7, `tests/test_cv_inference.py`: 4,
`tests/test_query_image.py`: 5, `tests/test_prepare_cv_dataset.py`: 6).
These are unit tests with mocked dependencies (mocked HTTP for the LLM
and CV service, a mocked YOLO model, temp directories for file
operations) - not integration tests against a real Ollama server, a real
fine-tuned CV model, or a real multi-manual ChromaDB index, and not what
`docs/evaluation.md` tracks (retrieval/refusal accuracy against real
content).
