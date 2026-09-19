# Failure Modes

_Last updated: 2026-09-19_

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
