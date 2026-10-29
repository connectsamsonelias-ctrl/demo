# Policy Assistant Agent (Single Agent + Memory + Graph)

Week 27 Graded Mini Project. A grounded question-answering agent over a small local policy corpus:
it plans, uses tools (FAISS search, policy reader, calculator), cites `[doc_id]`, quotes rules verbatim,
recovers from bad ids, stores only verified facts in a FAISS memory, and runs inside a LangGraph
with a step budget, a critic and a single retry.

## Setup (VS Code)

```bash
cd agentic-policy-assistant
python -m venv .venv
```

```bash
source .venv/bin/activate          # Windows: .venv\Scripts\activate
```

```bash
pip install -r requirements.txt
```

Optional, to use the real model (Vocareum/OpenAI key):

```bash
export OPENAI_API_KEY=sk-...       # Windows PowerShell: $env:OPENAI_API_KEY="sk-..."
```

**Two backends, same code path**

| | LLM | Embeddings |
|---|---|---|
| `OPENAI_API_KEY` set | `ChatOpenAI(gpt-4o-mini, temperature=0, seed=42)` + LLM critic | `text-embedding-3-small` |
| no key (or `POLICY_ASSISTANT_OFFLINE=1`) | `OfflinePolicyModel` – deterministic rule-based ReAct model that emits real LangChain tool calls | local hashing embedder |

The offline backend lets every script and test run with no key and no network. Tests always force it,
so they are deterministic. Final submission outputs should be produced with your key set.

## Step-by-step: one script per task

Each task has a script in `steps/`, split into `# %%` cells (one per subsection). In VS Code, open the
file and click **Run Cell** above each `# %%` (needs the Python + Jupyter extensions), or run the whole
file from the terminal. Every cell ends with an `# EXPECT:` comment saying what you should see.

| Task | Run | Code under test | What you should see |
|---|---|---|---|
| 1.1 Data prep | `python steps/task_1_1_data_prep.py` | `data/policies.jsonl`, `models.py` | 10 validated policies; bad rows rejected |
| 1.2 Tools | `python steps/task_1_2_tools.py` | `tools.py` | FAISS top hits; `PolicyNotFoundError`; soft JSON error; safe calculator |
| 1.3 Prompts | `python steps/task_1_3_prompts.py` | `prompts.py` | system prompt; PASS for doc_id / quote / step-limit rules |
| 1.4 Agent | `python steps/task_1_4_agent.py` | `agent.py` | Thought → Action → Observation trace; recovery `read_policy ERROR → policy_search → read_policy` |
| 1.5 Eval v1 | `python steps/task_1_5_eval_v1.py` | `eval.py` | table with latency, steps, has_docid, pass; logs in `logs/` |
| 2.1 Memory | `python steps/task_2_1_memory.py` | `memory.py` | rejected unverified writes; cheapest-sufficient read; warm run skips search |
| 2.2 Graph | `python steps/task_2_2_graph.py` | `graph.py` | cold vs warm run, budget stop, single retry, eval v2 cold/warm |
| 2.3 Critic | `python steps/task_2_3_critic.py` | `critic.py` | `{"valid": ..., "issues": [...]}` for good and broken answers |
| 2.4 Tests + docs | `python steps/task_2_4_tests_docs.py` | `tests/`, `app.py` | pytest results; SQLite checkpoint; JSON report |

Each module also runs on its own (`python tools.py`, `python agent.py`, `python graph.py`, …) as a quick demo.

## CLI (`app.py`)

```bash
python app.py ask "Is MFA required for VPN? Cite and quote."
```

```bash
python app.py eval --version 1
```

```bash
python app.py eval --version 2
```

```bash
python app.py eval --version 2 --warm
```

```bash
python app.py demo --report results/demo_report.json
```

```bash
python -m pytest -v
```

`demo` runs the three required screenshot cases in order: **cold run**, **warm run (memory hit)**,
**error recovery** (`remote_work_v9.9`). Flags: `--sqlite` (SQLite checkpointing), `--report FILE`
(JSON run report), `--quiet` (hide the agent trace), `--agent-only` (for `ask`).

## Repository layout

```
agentic-policy-assistant/
├─ data/policies.jsonl     # 10 policies: doc_id, text, date
├─ models.py               # Settings, pydantic schemas, typed errors, GraphState
├─ tools.py                # policy_search (FAISS), read_policy, calculator + LangChain tools
├─ prompts.py              # system prompt (acceptance rules), critic prompt, hint/retry templates
├─ agent.py                # ReAct executor + OfflinePolicyModel + build_agent()
├─ memory.py               # FAISS semantic memory of verified facts
├─ critic.py               # rule critic (+ LLM critic when a key is set)
├─ graph.py                # LangGraph nodes, router, budget, retry, compile()
├─ eval.py                 # canned queries, v1 (agent) + v2 (graph) evaluation, logs
├─ app.py                  # CLI
├─ steps/                  # task-by-task runnable scripts (cells per subsection)
├─ tests/                  # test_tools, test_agent_acceptance, test_graph_budget
├─ logs/  results/         # created by runs (.log, .jsonl, .csv, .json, checkpoints.sqlite)
└─ requirements.txt
```

## Design notes

**Tools and typed errors.** The plain functions raise typed errors (`PolicyNotFoundError`,
`CalculatorError`, both with a stable `code`). The LangChain wrappers catch them and return
`{"ok": false, "error": {...,"hint": "Call policy_search..."}}`, so a bad id never crashes the loop.
The calculator walks the Python AST and allows only numbers and arithmetic operators. It rejects
division by zero, names, function calls and huge exponents.

**Prompt acceptance rules.** R1 grounding only, R2 `[doc_id]` token, R3 verbatim quote of at most
30 words, R4 step limits (max iterations, at most 2 searches and 2 reads, read before quoting),
R5 bad-id recovery, R6 memory hints are leads to re-verify, not evidence.

**Agent.** A minimal ReAct executor (`PolicyAgent`): the model is called, its tool calls run,
observations are appended, and this repeats up to `max_iterations`. Every step is printed and logged with
tool latency. `temperature=0` + `seed` with OpenAI. The offline model is deterministic by construction.

**Memory.**
- *Write*: only when the critic says the answer is valid, it cites a real `[doc_id]`, and its quote appears
  verbatim in that policy. Duplicates are skipped.
- *Read, cheapest sufficient first*: an exact question match comes first (no embedding needed). Next is a
  FAISS semantic match with similarity ≥ 0.80; when several entries clear the bar, the shortest one wins.
  If nothing matches, the agent uses its tools.
- A hit becomes a hint appended to the question, so the agent reads the cited policy directly and skips
  the search step (warm runs use 1 tool call instead of 2).
- `facts.jsonl` is the source of truth. The FAISS index is rebuilt from it, so no pickle files are loaded.

**Graph.** `plan → memory_read → agent_answer → critic → memory_write → stop`. Each counted node adds 1
to `steps`. The router sends the run to `stop` as soon as `steps ≥ max_steps` (stop reason
`budget_exhausted`). After the critic: a valid answer goes to `memory_write`. An invalid one is retried once,
with the critic's issues fed back to the agent. If it is still invalid, the run stops with `critic_failed` and
nothing is written. Every node is wrapped to time and log itself and to turn exceptions into a soft stop.
Checkpointing uses `MemorySaver` by default, or `SqliteSaver` with `--sqlite`.

**Critic.** It returns `{"valid": bool, "issues": []}` from four deterministic checks:
- C1: a `[doc_id]` is present.
- C2: the cited id exists and was read in this run.
- C3: the quote is verbatim.
- C4: every number in the answer appears in the cited policy, the question, or a calculator result.

With a key, an LLM critic (JSON mode) also runs, and both critics must pass.

**Observability.** Per run, `logs/` holds a `.log` (node/step/latency lines) and a `.jsonl` (one record per
query with the full tool trace and node trace). `results/` holds the CSV table.

## Results (offline backend)

| Run | Pass rate | Avg tool calls | Memory hits |
|---|---|---|---|
| Eval v1 (agent) | 8/8 (100%) | 2.25 | – |
| Eval v2 cold (graph) | 8/8 (100%) | 2.25 | 0/8 |
| Eval v2 warm (graph) | 8/8 (100%) | 1.25 | 8/8 |

Re-run with your OpenAI key to get the model-backed numbers for the submission.

## Limitations

- The offline model is a rule-based stand-in for the LLM. It shows the protocol and the control flow, not
  language understanding. Answer quality on new phrasings needs the OpenAI backend.
- The hashing embedder matches words, not meaning, so paraphrases with different words can miss
  (e.g. "How many days remote work?" misses the memory). OpenAI embeddings fix this.
- The C4 "simple claims" check verifies numbers only, not the meaning of sentences.
- Memory has no expiry. If a policy is updated, its stored facts should be cleared (`python app.py reset-memory`).
