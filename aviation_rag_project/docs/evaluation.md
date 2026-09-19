# Evaluation

_Last updated: 2026-09-19_

This tracks retrieval and refusal accuracy over time. **There is currently
no automated evaluation harness** — the numbers below come from manual
testing during development, not a scripted, repeatable test runner. That
gap is real and worth closing next: a script that runs the fixed query
set below against a running instance and appends a results row
automatically would turn this from a log into an actual regression check.
Until that exists, run the queries by hand (via the chat UI or `curl`
against `/query`) and record results honestly, including bad ones.

## Fixed test query set

All queries below are run against `data/manuals/synthetic_a320_manual.pdf`
(the only manual ingested so far — see `docs/architecture.md`), tail
number `VT-IAF01`, aircraft type `Airbus-A320`, unless noted otherwise.

### In-scope (data exists, should return `found: true`)

| ID | ATA Chapter | Query | Expected source section |
|----|-------------|-------|--------------------------|
| IS-1 | 32 | "What is the torque specification for the nose gear assembly bolt?" | ATA 32-21-00, §1 Torque Specifications |
| IS-2 | 32 | "How often should the nose gear seal be inspected?" | ATA 32-21-00, §2 Inspection Interval |
| IS-3 | 24 | "What's the isolation procedure before inspecting the main battery bus?" | ATA 24-10-00, §1 Isolation Procedure |
| IS-4 | 79 | "What oil specification should be used in the engine oil system?" | ATA 79-00-00, §1 Oil Specification |

### Out-of-scope (no matching chapter ingested, should return `found: false`)

| ID | ATA Chapter | Query | Expected behavior |
|----|-------------|-------|---------------------|
| OOS-1 | 99 | "Anything about chapter 99?" | Hardcoded refusal: `ERROR: DATA NOT FOUND IN APPROVED MANUAL FOR TARGET COMPLIANCE PARAMETERS.` |
| OOS-2 | 55 | "What's the rudder trim tab clearance?" | Same refusal — chapter 55 (stabilizers) was never ingested |

### Ambiguous / edge-case

| ID | ATA Chapter | Query | Why it's hard |
|----|-------------|-------|----------------|
| EDGE-1 | 32 | "I'm about to replace the nose gear assembly bolt on VT-IAF01. What do I need to know before starting — torque spec, inspection requirements, safety precautions, and has this aircraft had any related issues before?" | Compound, multi-part question requiring synthesis of 3+ dossier sections plus snag history. **Known to break LLM generation** — see `docs/failure-modes.md`, 2026-08-28. Retrieval itself is unaffected (single ATA chapter, single chunk). |
| EDGE-2 | 32 | "What's the torque spec for the nose gear bolt on VT-IAF02?" | Correct manual chapter, but a tail number with no snag history entries — checks that history correctly renders as empty rather than erroring. |
| EDGE-3 | *(any)* | Empty or whitespace-only `query_text` | Not yet tested — expected Pydantic validation behavior untested against this exact case. |

## What gets tracked per run

- **Retrieval precision/recall** — of the in-scope queries (IS-1..4),
  what fraction retrieved the correct source section (precision) and
  what fraction of known-correct sections were successfully retrieved
  (recall). With only 4 in-scope queries against 3 chunks today, this is
  a small sample — the table format is built to scale as more manuals
  and queries are added, not because today's numbers are statistically
  meaningful yet.
- **Refusal accuracy** — split into two failure directions, since they
  have very different severity for this system:
  - **False positive** (refuses when it shouldn't): the code-level
    guardrail incorrectly returns `found: false` for an in-scope query.
    Not observed as of this writing.
  - **False negative** (answers/asserts when it should refuse): either
    the retrieval layer returns `found: true` for a genuinely
    out-of-scope query (not observed), **or** the LLM generation layer
    produces confident-sounding text that isn't actually grounded in the
    dossier (not yet specifically tested for — current known failures are
    the opposite: the LLM refusing when it shouldn't, see
    `docs/failure-modes.md`).
- **Latency** — measured separately for retrieval-only (`LLM_ENABLED=false`)
  and with generation (`LLM_ENABLED=true`), since they're on completely
  different orders of magnitude.

## Results log

| Date | Version / commit | Retrieval precision | Retrieval recall | Refusal false-positive rate | Refusal false-negative rate | Retrieval latency | Generation latency | Notes |
|------|-------------------|----------------------|--------------------|---------------------------------|---------------------------------|---------------------|-----------------------|-------|
| 2026-08-26 | `045dc53` | 4/4 (IS-1..4, manual spot-check) | 4/4 | 0/2 (OOS-1, OOS-2 not yet both tested this run) | 0/4 observed | < 1s (not precisely timed) | N/A (LLM not yet built) | Initial manual verification during synthetic-manual testing; not a scripted run. |
| 2026-08-28 | `91e5376` | Not re-measured | Not re-measured | Not re-measured | **1 observed (EDGE-1)**: LLM returned "DATA NOT FOUND IN APPROVED MANUAL." despite the dossier containing torque, inspection, and safety data | Not measured | ~94–120s (2 runs, Qwen2.5 1.5B, CPU-only dual-core laptop, no GPU) | First live LLM generation test. See `docs/failure-modes.md` for full detail on the EDGE-1 failure. |
| _(next run)_ | | | | | | | | Run the full query set above and fill in a new row — including for changes that don't touch retrieval directly (e.g. a model swap), since latency and refusal behavior can shift with them. |

**Note on the two logged rows above:** these are reconstructed from the
actual conversation/testing history when this evaluation doc was first
created (2026-09-19), not contemporaneous scripted output — some cells
are marked "not measured" honestly rather than backfilled with guesses.
Going forward, add a new row for every meaningful change, per the
project's documentation policy, and prefer running the *entire* query set
each time over spot-checking only what changed.

## CV defect-detection accuracy — not yet applicable

The CV first-pass defect check (`cv_service/`, `/query/image` — see
README Stage G) has **no accuracy metrics to log yet**, because no
fine-tuned model exists: `models/defect_yolo.pt` has never been produced.
What was verified (2026-09-19) was the *pipeline wiring* — a stock
pretrained YOLOv8n checkpoint correctly flowed through detection →
`query_text` formatting → the existing retrieval/refusal path — using
`tests/test_cv_inference.py` and `tests/test_query_image.py` (mocked)
plus a live manual run against real photos. That is a wiring check, not
a defect-detection accuracy measurement; the model has never seen an
aircraft.

Once `scripts/train_defect_model.py` produces a real fine-tuned
checkpoint, its `docs/cv-training-report.json` output (precision, recall,
mAP50, mAP50-95, per-class breakdown) should be logged here in a new
results table, structured the same way as the retrieval table above —
one row per training run, never overwritten, so accuracy trend over
successive fine-tuning attempts stays visible.
