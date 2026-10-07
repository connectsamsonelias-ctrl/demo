# Failure Modes

_Last updated: 2026-10-07_

**Naming note:** the EDGE-1 entry below references "snag history" data -
in this deployment's setup that's planned to eventually come from
Maximo, since Maximo is the EMMS framework/implementation in use here,
not a separate EMMS system (see `docs/architecture.md`, "Current stage").
Today it's still `data/snag_history.json`, a mock file, unaffected by
this.

A running, append-only log of specific failures found during testing.
Entries are dated and never removed, even after being fixed — this is a
record of how the system's reliability has actually evolved, not just its
current state. If a fix is later found to be incomplete, add a new dated
entry rather than editing the old one.

Categories named in this doc's brief (adversarial queries, outdated part
numbers, similar-sounding components, multi-manual conflicts, partial
matches) mostly **have not been tested yet** — only one manual exists
(the synthetic test manual), so anything requiring multiple manuals,
real-world part-number drift, or genuinely adversarial phrasing hasn't
had the material to fail against. Logged below only: what has actually
been observed.

---

## 2026-08-28 — LLM false-negative refusal on a compound question

**What query broke it:**

```
Tail Number: VT-IAF01
Aircraft Type: Airbus-A320
ATA Chapter: 32
Question: "I'm about to replace the nose gear assembly bolt on VT-IAF01.
What do I need to know before starting — torque spec, inspection
requirements, safety precautions, and has this aircraft had any related
issues before?"
```

**What happened:** `/query` correctly retrieved the ATA 32-21-00 chunk
(`found: true`) — the dossier contained the torque value, the inspection
interval, the safety warning, and the tail number's snag history, all
present. With `LLM_ENABLED=true` (Qwen2.5 1.5B via Ollama), the generated
answer was:

```
DATA NOT FOUND IN APPROVED MANUAL.
```

This is the LLM's own system-prompt-instructed refusal phrase, produced
by the model itself — **not** the code-level guardrail (see
`docs/architecture.md`, Refusal Logic). The retrieval layer worked
correctly; the model failed to use the context it was given.

**Why:** Working theory, not confirmed via deeper probing: a 1.5B
parameter model asked a compound, multi-part question (4 distinct asks in
one query) combined with a strict "refuse if you're not sure" system
prompt appears to default to the conservative refusal path rather than
reasoning through all parts of the context. This is consistent with
small-model behavior generally — limited capacity models tend to be more
brittle on multi-step instructions. Not confirmed against this specific
model/prompt via ablation (e.g. has not been re-tested with the
compound question split into 4 separate single-fact questions to isolate
whether compoundness specifically is the trigger).

**What was changed to fix it:** **Not fixed.** This is logged as a known,
unresolved limitation. `docs/architecture.md`'s "Next steps" and the
project README both note candidate mitigations, not yet implemented:
- Re-test with a larger/stronger model (Gemma 3 2B, Llama 3.2 3B, or
  Phi-4 Mini 3.8B were identified as free/Ollama-compatible candidates)
  once running on hardware with a GPU or a stronger CPU — the current
  dev laptop (dual-core, no GPU) already takes ~2 minutes per answer with
  the smallest practical model, so a bigger model wasn't tested live.
- Consider whether the system prompt's refusal instruction is worded in
  a way that over-triggers on compound questions specifically, independent
  of model size.

**How the fix was verified:** N/A — no fix has been applied yet. When one
is, verification should include: re-running EDGE-1 from
`docs/evaluation.md` and confirming a correct synthesized answer, without
introducing a regression on the out-of-scope queries (OOS-1, OOS-2) —
i.e. don't fix false-negative refusals by making the model refuse less
overall, which would risk turning genuine "not found" cases into
hallucinated answers instead. That tradeoff is the reason this is being
tracked carefully rather than patched quickly.

**Severity assessment:** This is a false *negative* (incorrectly
withholding a real answer), not a hallucination (making something up).
For a system whose core design goal is zero-hallucination, this is the
*safer* of the two possible failure directions — but it materially hurts
usefulness, and masks the fact that the underlying data was actually
present and correct.

---

## 2026-09-19 — CV first-pass defect check added: no failures to log yet, by design

Not a failure entry — recorded here so the gap is visible rather than
silent. The CV defect-detection feature (`cv_service/`, `/query/image`)
was added this date, but `models/defect_yolo.pt` does not exist -
`scripts/train_defect_model.py` has not been run anywhere, since training
requires GPU compute this project's dev sandbox doesn't have and hasn't
been tested on the reference deployment laptops either. The pipeline was
verified end-to-end with a stock, non-fine-tuned YOLOv8n checkpoint,
which correctly proves the *wiring* but cannot meaningfully "fail" or
"succeed" at aircraft defect detection - it was never trained to attempt
that task. **The categories this doc is meant to track (adversarial
queries, outdated part numbers, similar-sounding components, multi-manual
conflicts, partial matches) do not yet apply to the CV path** and won't
until a real fine-tuned model exists and is exercised against real
defect photos. First real CV-specific entry should appear once that
happens - don't backfill one before then.

---

## 2026-10-07 — Default LLM swapped from Qwen2.5 1.5B to Gemma 2 2B

Not a failure entry either — logged because it's a meaningful change per
this project's documentation policy, and because it invalidates a piece
of previously-measured data below.

**What changed and why:** an external review of this project (ahead of a
defense-context pitch) flagged that the default model, Qwen2.5 1.5B, is
Alibaba-origin (China). Air-gapped/offline operation already means no
data leaves the deployment machine regardless of which model is loaded -
that was never in question. The actual concern is narrower and still
real: a defense sponsor may object to a specific model's country of
origin independent of how the system is deployed, and that's a
reasonable thing for a reviewer to raise. The default was changed to
**Gemma 2 2B (Google)** - chosen over the other Western-origin
candidates already named in this project's own "Next steps" list (Llama
3.2 3B, Phi-4 Mini 3.8B) specifically for being closest in size to the
previous default, to avoid stacking a latency regression on top of the
origin swap. `app/llm.py`, `docker/Dockerfile.ollama`,
`docker/docker-compose.yml`, and `.env.example` were all updated;
`app/llm.py` has no model-specific logic, so no code logic changed.

**What this invalidates, not yet re-verified:**
- The **~94–120s / ~2 minute generation latency** figure in the
  2026-08-28 entry above and in `docs/evaluation.md`'s results log was
  measured on Qwen2.5 1.5B. Gemma 2 2B is a larger model - expect this
  number to be equal or worse on the same CPU-only hardware, not better,
  until it's actually re-measured.
- The **EDGE-1 compound-question false-negative refusal** (2026-08-28
  entry above) was also observed on Qwen2.5 1.5B specifically. Whether
  Gemma 2 2B exhibits the same failure, a different one, or neither is
  unknown - it has not been re-tested. Do not assume either outcome
  until EDGE-1 is actually re-run against the new default.

**Fix status:** N/A - this is a configuration/sourcing change, not a bug
fix. The underlying refusal guardrail (code-level, model-independent) is
unaffected either way - see `docs/architecture.md`.

**Severity assessment:** N/A - not a failure. Logged for traceability:
anyone reading the 2026-08-28 entry's latency/failure numbers needs to
know they no longer describe the model actually running by default.

---

## 2026-10-07 — EDGE-1 re-tested on Gemma 2 2B: partial improvement, new failure shape

**What query broke it:** Same EDGE-1 compound question as the 2026-08-28
entry above, same parameters (tail `VT-IAF01`, ATA `32`), run after
the model swap logged in the entry above this one.

**What happened:** Not a clean pass, and not the same failure as before
either - worth being precise rather than rounding to "fixed" or "still
broken." Gemma correctly synthesized 3 of the 4 asked-for items from the
dossier - torque spec, inspection interval, and the safety warning, all
accurate and well-formed. It then appended `DATA NOT FOUND IN APPROVED
MANUAL.` immediately after item 3, apparently in place of actually
answering item 4 (the aircraft's snag history) - despite that history
being present in the dossier and rendered correctly in the UI's separate
Snag History panel in the same response. So: real synthesis improvement
over the 2026-08-28 Qwen result (which answered zero of the four parts),
but a new, more specific failure - an erroneous refusal fragment
attached to one part of an otherwise-correct answer, rather than a
refusal of the whole question.

**Why (working theory, not confirmed):** Possibly the model treated the
snag-history section of the dossier as a separate context block it
didn't fully attend to while answering the other three items, and
defaulted to the system prompt's refusal instruction for that one part
specifically rather than for the whole response. Not confirmed via
further testing (e.g. asking about snag history alone, isolated from the
other three sub-questions, to see if that one part fails in isolation
too).

**What was changed to fix it, and what actually happened across three
live attempts (same day, same hardware, same question):**

1. **Attempt 1 (initial finding, above):** 3/4 correct + erroneous
   fragment, as described.
2. **Attempt 2:** Removed a duplicate, conflicting refusal instruction
   that `app/rag_engine.py` baked directly into the dossier text (a
   "SYSTEM COMPLIANCE BOUNDARY" block, differently worded from
   `app/llm.py`'s `SYSTEM_PROMPT`, telling the model to "fail with an
   error code" per-parameter - redundant with the code-level guardrail
   and a plausible source of the per-item refusal behavior). Also
   rewrote `SYSTEM_PROMPT` with an explicit, multi-sentence instruction
   for handling compound questions. **Result: regression, not
   improvement** - a full blanket refusal, including for the three
   items the model had previously answered correctly. Live-tested on
   the actual laptop, not assumed.
3. **Attempt 3:** Kept the dossier cleanup from attempt 2 (architecturally
   correct regardless, and didn't cause the regression), but replaced
   the long explanatory `SYSTEM_PROMPT` rewrite with a single short
   added sentence instead. **Result: back to the original 3/4-correct
   pattern** - same partial success, same erroneous fragment on the
   snag-history part. Not worse than the original finding, but not
   better either.

**Decision: stopped after three attempts**, given same-day time
constraints ahead of a scheduled pitch. The dossier cleanup (removing
the duplicate instruction) is kept, since it's a real architectural
improvement with no observed downside across all three attempts - but
the underlying EDGE-1 behavior itself is **not resolved**. Documented
honestly as a known, unresolved limitation of the current default model
on this class of compound question, not claimed fixed.

**Working theory on why attempt 2 regressed (not confirmed):** small
(2B-class) models plausibly follow shorter, simpler system prompts more
reliably than longer, more explicit ones - the added length and extra
clauses in attempt 2's prompt likely cost more in instruction-following
reliability than the clarification gained. Consistent with, but not
proof of, general small-model behavior; not isolated via further
ablation given time constraints.

**How the fix was verified:** Partially - attempts 2 and 3 were both
live-tested against the real EDGE-1 question on the actual deployment
hardware, not assumed from code review. Neither constitutes a full fix;
see above.

**Severity assessment:** Mixed. The three correctly-answered parts are a
genuine improvement in usefulness over the prior Qwen result. The
erroneous refusal fragment on the fourth part is still a false negative
(withholding real, present data) - the safer failure direction, same as
the original EDGE-1 finding - but its partial, inline placement (mid-answer,
not as a whole-response refusal) is a different and arguably more
confusing shape of failure for a technician reading the output: it looks
like the answer stopped partway through rather than refused outright.

---

## Template for future entries

```markdown
## YYYY-MM-DD — Short description

**What query broke it:** (exact query + parameters)

**What happened:** (actual vs. expected output)

**Why:** (root cause, or "not yet root-caused" if unknown)

**What was changed to fix it:** (the actual change, or "not fixed yet")

**How the fix was verified:** (what was re-tested, against what query set)

**Severity assessment:** (false positive vs. false negative vs.
hallucination vs. crash/error — and why that matters for this system)
```
