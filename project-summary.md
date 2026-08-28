# Project Summary

## Project Name
**demo** — a two-part portfolio repository containing (1) `rag_troubleshooter`, a RAG-based maintenance-manual troubleshooting assistant, and (2) `week19_fashion_mnist_gen`, a Fashion-MNIST generative-modelling coursework project.

## One-line Summary
A retrieval-augmented Q&A agent that diagnoses equipment faults from structured maintenance manuals, packaged alongside a from-scratch PyTorch study of four generative model families (Denoising Autoencoder, VAE, Conditional GAN, StyleGAN-lite/AdaIN) trained on Fashion-MNIST.

## My Role/Contribution
_Placeholder — commit history shows all commits authored via Claude Code sessions (author: "Claude <noreply@anthropic.com>"); fill in your actual role (e.g., sole author/prompter, reviewer, project owner) before publishing._

## Tech Stack
- **Language:** Python 3.11 (core logic), JavaScript/Node.js (report-generation tooling)
- **ML/AI:** PyTorch, torchvision, Anthropic Claude API (`anthropic` SDK)
- **Retrieval/Search:** ChromaDB (vector store), `rank-bm25` (keyword search), custom Reciprocal Rank Fusion
- **Data/Parsing:** PyYAML (front matter), `pypdf` (PDF ingestion)
- **Testing:** pytest
- **Document tooling:** `docx` (npm), LibreOffice/`soffice` (PDF export), Poppler (`pdftoppm`)
- **Infra:** CLI-based tooling (argparse-style commands: `ingest` / `ask` / `chat` / `search`), local filesystem persistence (no external DB service required)

## Key Features
- Answers technician troubleshooting questions grounded in and citing specific maintenance-manual sections, rather than free-form LLM guessing.
- Hybrid retrieval fuses exact-match keyword search with semantic search so error codes (e.g. "E45") and fuzzy symptom descriptions ("won't start") are both retrieved reliably.
- Structure-aware chunking keeps diagnostic procedures, spec tables, and safety warnings intact — never splits a procedure mid-step.
- Gracefully degrades to keyword-only search when the vector database or embedding model is unavailable, so the assistant never goes fully offline.
- Interactive multi-turn chat and one-shot Q&A modes, plus a debug `search` mode to inspect retrieval without incurring LLM cost.
- Companion generative-AI project implements and compares four distinct model families end-to-end (compression, probabilistic sampling, class-conditional generation, and style-mixing) on a real dataset.

## Technical Highlights
- Designed a structure-aware document chunker that parses Markdown heading hierarchy and classifies content into typed blocks (table / procedure / safety warning / prose), preventing multi-step repair procedures from being split across retrieval chunks — directly improving answer completeness over naive fixed-size chunking.
- Implemented hybrid retrieval combining BM25 keyword search with Chroma vector similarity via Reciprocal Rank Fusion, solving the specific failure mode where near-identical error codes (e.g. "E45" vs "E52") collapse together in embedding space but must never be confused in a safety-relevant context.
- Built a fault-tolerant retrieval fallback path so the system automatically degrades to BM25-only search when `chromadb` or network-dependent embedding models are unavailable, rather than failing outright.
- Engineered a safety-first system prompt for the troubleshooting agent that enforces citation of source sections, surfaces safety warnings ahead of procedural steps, and prompts clarifying questions on ambiguous equipment/fault inputs instead of guessing.
- Implemented and trained four generative architectures from scratch in PyTorch (Denoising Autoencoder, VAE with the reparameterization trick, Conditional GAN with label-embedding conditioning, and an AdaIN-based style-mixing demo reusing a trained encoder/decoder), producing a comparative analysis of deterministic vs. probabilistic vs. adversarial generative approaches.
- Diagnosed and resolved a Windows-specific PyTorch DataLoader multiprocessing stall (`num_workers>0` hanging in a non-`__main__`-guarded interactive context), restoring expected training throughput.

## Scale/Metrics
- `rag_troubleshooter` core package: ~810 lines of Python across 7 modules, with a 2-file pytest suite covering chunking integrity (tables/procedures survive intact) and retrieval accuracy (error-code, symptom, and equipment-model-filtered queries).
- Sample corpus: 2 maintenance manuals (air compressor, centrifugal pump) with specs, error-code tables, and diagnostic procedures.
- Generative modelling project: trained on the full Fashion-MNIST dataset (60,000 train / 10,000 test images); DAE reconstruction MSE improved from 0.035 → 0.011 over 10 epochs; VAE ELBO improved from 277 → 239 over 12 epochs; cGAN trained 10 epochs across all 10 garment classes with per-class conditional sampling.

## Duration
**August 5, 2026 – August 24, 2026** (~3 weeks), based on the first and most recent commits in the repository's git history.
