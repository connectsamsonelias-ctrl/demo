# RAG Maintenance Troubleshooter

A retrieval-augmented generation pipeline that reads structured maintenance
manuals (Markdown or PDF) and answers technician troubleshooting questions,
grounded in — and citing — the source manual sections.

## Why not a generic RAG stack?

Off-the-shelf "chunk every 500 tokens with overlap" RAG breaks on manuals
because manuals aren't prose: they're spec tables, numbered diagnostic
procedures, and safety warnings. A fixed-size splitter will cut a table in
half or separate step 3 of a procedure from step 4 — and a troubleshooter
that hands an LLM half a procedure is worse than one with no procedure at
all, because it looks confident. Three design choices follow from that:

1. **Structure-aware, atomic chunking.** Chunks are built from the
   Markdown heading hierarchy, and within a section, tables, numbered
   procedures, and safety-warning blockquotes are always kept whole — never
   split across chunk boundaries, even if that makes a chunk larger than
   the nominal size target. See `rag_troubleshooter/chunking.py`.
2. **Hybrid retrieval, not pure semantic search.** Symptom descriptions
   ("compressor won't start") are what embeddings are good at. Error codes
   ("E45" vs "E52") are exactly what embeddings are bad at — they look
   nearly identical in embedding space but mean completely different
   faults. Retrieval fuses BM25 keyword search with Chroma semantic search
   via Reciprocal Rank Fusion, so an exact error-code match always
   surfaces even if its embedding similarity is mediocre.
3. **A grounded, safety-first troubleshooting prompt**, not a generic
   Q&A prompt. The agent is instructed to answer only from retrieved
   context, cite the manual section for every claim, surface safety
   warnings before procedural steps, ask a clarifying question when the
   equipment model or fault is ambiguous instead of guessing, and say
   explicitly when a step requires a certified technician.

## Architecture

```
manuals/*.md, *.pdf
        │
        ▼
  loaders.py        parse front matter (model, manual_id) / PDF pages
        │
        ▼
  chunking.py        heading-aware sectioning → typed blocks
                      (table / procedure / safety_warning / prose) →
                      size-bounded chunks that never split a structural block
        │
        ▼
  ingest.py           writes chunks.jsonl (canonical store)
                       + embeds into a persistent Chroma collection
        │
        ▼
  retriever.py        BM25(query) ⊕ Chroma(query)  →  Reciprocal Rank Fusion
                       optional equipment-model metadata filter
        │
        ▼
  troubleshooter.py   builds grounded context + system prompt
                       → Claude (Anthropic Messages API)
                       → answer + section citations
        │
        ▼
  cli.py               `ingest` / `ask` / `chat` / `search` (debug, no LLM)
```

If `chromadb` isn't installed or the embedding model can't be downloaded
(no network), ingestion still succeeds and the retriever transparently
falls back to BM25-only keyword search — degraded, but never broken.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your ANTHROPIC_API_KEY
```

## Usage

Two sample manuals ship in `manuals/`: an air compressor (XR-4000) and a
centrifugal pump (FP-200), each with specs, an error-code table, safety
warnings, and diagnostic procedures. Drop your own `.md` or `.pdf` manuals
into that directory — a Markdown manual should start with YAML front
matter (`manual_id`, `title`, `model`) so chunks can be filtered and cited
by equipment model.

```bash
# 1. Build the index (re-run whenever manuals change)
python -m rag_troubleshooter.cli ingest

# 2. One-shot question
python -m rag_troubleshooter.cli ask "compressor won't start, showing E45" \
    --equipment-model XR-4000

# 3. Interactive multi-turn session
python -m rag_troubleshooter.cli chat --equipment-model XR-4000

# 4. Debug: inspect what would be retrieved, without calling the LLM
python -m rag_troubleshooter.cli search "seal is leaking" --equipment-model FP-200
```

Example `search` output (no API key required) for
`"unit keeps overheating, is it the fan?" --equipment-model XR-4000`:

```
[1] XR-4000 ... | 5. Troubleshooting Procedures > 5.4 High Discharge Air Temperature (E23) (procedure)
1. Blocked or dirty air-cooled aftercooler fins.
2. Cooling fan failure.
...
Diagnostic steps:
1. Inspect and clean aftercooler fins with low-pressure compressed air
   (never a pressure washer) — see section 7.4.
2. Confirm the cooling fan spins freely and runs when the unit is under
   load; a seized or slow fan will not adequately cool the aftercooler.
...
```

An `ask`/`chat` response is structured as: likely causes (ranked) →
diagnostic steps → safety notes (when relevant) → when to escalate to a
certified technician — each claim tagged with its source section, e.g.
`[XR-4000 ... | 5.1 Compressor Fails to Start (E45)]`.

## Tests

```bash
pytest tests/ -v
```

`tests/test_chunking.py` verifies the error-code table and multi-step
procedures survive chunking intact, and safety warnings are flagged.
`tests/test_retriever.py` ingests the sample manuals into a temp store and
checks that error-code queries, symptom queries, and equipment-model
filtering all return the expected sections.

## Extending this design

- **Reranking**: add a cross-encoder rerank pass over the RRF-fused
  candidates before truncating to `k` for higher precision at low `k`.
- **Multi-manual routing**: if the technician doesn't state the equipment
  model, ask the retriever to first classify likely model(s) from the
  query, then confirm with the technician before running the full
  diagnostic retrieval (currently the prompt asks this via plain
  conversation, which works but costs a round trip).
- **Feedback loop**: log which retrieved sections a technician confirms
  fixed the issue, and use that to bias future retrieval or flag manual
  sections that are frequently retrieved but rarely helpful.
- **Real PDFs**: `chunk_pdf_pages` is a page/paragraph-bounded fallback for
  manuals without Markdown structure. For scanned PDFs, add OCR before
  `loaders.load_pdf`; for well-tagged PDFs, a heading-aware PDF parser
  could reuse the same `build_chunks` structural logic as the Markdown path.
