# Aviation RAG Project

Air-gapped, metadata-filtered Retrieval-Augmented Generation service for
aircraft maintenance manuals, built from the `AdvancedAviationRAG`
prototype. Exposes a secure `/query` endpoint that IBM Maximo can call
with work-order data, and includes tooling to parse ATA iSpec 2200
chapter headers out of raw manual PDFs.

## How this project is organized (read this first if you're new to this)

```
aviation_rag_project/
  app/
    rag_engine.py    <- the AdvancedAviationRAG class (the "brain")
    main.py           <- the FastAPI web server (the "front door")
    models.py          <- defines what a valid request/response looks like
    security.py         <- checks the API key on every request
  scripts/
    parse_ata_chapters.py   <- reads a PDF, finds "ATA 32-21-00" style headers
    ingest_parsed_chunks.py  <- loads those parsed chunks into the database
  docker/
    Dockerfile         <- recipe to build the app into a container image
    docker-compose.yml  <- recipe to run the whole thing with one command
  data/
    manuals/            <- put your source PDFs/text here (read-only in Docker)
    snag_history.json    <- mock per-aircraft fault history (swap for real Maximo data later)
  tests/                <- automated checks that prove the code works
  requirements.txt       <- list of Python packages this project needs
  .env.example            <- template for secret/config values
```

You do not need to understand Docker or FastAPI deeply to run this - follow
the stages below in order.

---

## Stage A - Run it locally in VS Code (no Docker yet)

This is the fastest way to see it working and to poke at the code.

1. Open the `aviation_rag_project` folder in VS Code.
2. Open a terminal in VS Code (`` Ctrl+` ``) and run:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate        # on Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   ```

3. Open `.env` and change `AVIATION_RAG_API_KEY` to any long random string
   you make up - this is the password the server will require on every
   request.
4. Load the API key into your shell and start the server:

   ```bash
   export $(cat .env | xargs)        # on Windows (PowerShell): see note below
   uvicorn app.main:app --reload
   ```

   > Windows PowerShell users: instead of `export $(cat .env | xargs)`,
   > run `Get-Content .env | ForEach-Object { $n,$v = $_.Split('='); Set-Item "Env:$n" $v }`.

5. Open your browser to **http://127.0.0.1:8000/docs** - FastAPI gives you
   a free interactive test page. You can seed sample data and try `/query`
   right there. (Or use the `curl` examples below.)

**Confirm before moving on:** does the interactive docs page load, and can
you seed + query successfully? If anything errors, paste it back and we'll
fix it before touching Docker.

### Seeding sample data (so /query has something to find)

```bash
python -c "
from app.rag_engine import AdvancedAviationRAG
rag = AdvancedAviationRAG(db_path='./aviation_vector_db')
rag.ingest_technical_chunk('doc_001',
    'The specific torque limit for the A320 main landing gear nose assembly bolt is exactly 120 Nm.',
    {'aircraft_model': 'Airbus-A320', 'ata_chapter': '32', 'section': '21'})
print('seeded')
"
```

### Calling the endpoint

```bash
curl -X POST http://127.0.0.1:8000/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <the value you put in .env>" \
  -d '{
        "wonum": "WO-88213",
        "tail_number": "VT-IAF01",
        "aircraft_type": "Airbus-A320",
        "ata_chapter": "32",
        "query_text": "What is the torque specification for the nose gear assembly bolt?"
      }'
```

---

## Stage B - Parse a real manual PDF into ATA-tagged chunks

```bash
python scripts/parse_ata_chapters.py data/manuals/your_manual.pdf \
    --aircraft-model Airbus-A320 \
    --out data/parsed_chunks.json

python scripts/ingest_parsed_chunks.py data/parsed_chunks.json
```

The parser looks for patterns like `ATA 32-21-00` or bare `32-21-00` and
tags every following block of text with that chapter/section until the
next header appears. Run `pytest tests/test_parse_ata_chapters.py -v` any
time to confirm the regex is still matching correctly.

**Confirm before moving on:** run the parser against one real manual PDF
and check `data/parsed_chunks.json` - do the `ata_chapter` values look
right for your documents? Real manuals sometimes format headers
differently (extra spacing, different separators) - if matches look
wrong, share a sample snippet and we'll tighten the regex.

---

## Stage C - Run it all with Docker (one command, portable anywhere)

This packages the API server into a container so it runs identically on
any machine with Docker installed - no manual Python setup needed.

1. Make sure Docker Desktop (or Docker Engine) is installed and running.
2. From the `aviation_rag_project` folder:

   ```bash
   cp .env.example .env      # edit AVIATION_RAG_API_KEY if you haven't already
   docker compose -f docker/docker-compose.yml --env-file .env up --build
   ```

3. The API is now on **http://localhost:8000** - same endpoints as Stage A.

**Security note on the volumes:** `data/` is mounted into the container as
**read-only** (`:ro` in `docker-compose.yml`). The running container can
read your manuals but can never modify or delete them - even if the app
has a bug. The vector database itself lives in a separate Docker-managed
volume (`chroma_data`) that the app *can* write to, since that's its job.

**Confirm before moving on:** does `docker compose up --build` finish
without errors, and does `curl .../health` respond? Docker networking
quirks differ by OS - flag anything odd and we'll debug it together.

> Note: the *build* step needs internet access once, to download Python
> packages and bake in the embedding model (see below). Once built, the
> image runs with no network dependency at all.

---

## ✅ Air-gap fix applied

Testing surfaced two things that would have silently broken the "zero
external network calls" guarantee in a real air-gapped deployment. Both
are now fixed:

1. **Embedding model download.** ChromaDB's default embedding function
   downloads a small ML model (`all-MiniLM-L6-v2`, ~80MB) from the
   internet the first time it's used. The `Dockerfile` now triggers that
   download once, *at image build time* (running as the same `appuser`
   that runs the container, so the cache path matches), and bakes the
   result into the image. The running container never needs to fetch it -
   `docker build` needs internet once; `docker compose up` afterward does
   not.
2. **Telemetry.** ChromaDB also sends anonymized usage analytics to
   PostHog by default. This is now explicitly disabled both in code
   (`app/rag_engine.py` passes `Settings(anonymized_telemetry=False)`)
   and via the `ANONYMIZED_TELEMETRY=FALSE` environment variable in both
   the `Dockerfile` and `docker-compose.yml`, so it's off no matter how
   the app is started.

If you swap in a different embedding model or add another library later,
re-check it for the same pattern (silent network calls on first use) -
it's a common trap in ML tooling that otherwise looks "local."

---

## Stage D - Scheduled ingestion: new manuals get indexed automatically

`scripts/watch_and_ingest.py` scans `data/manuals/` for PDFs, and ingests
only the ones that are new or have changed since last time (it fingerprints
each file by content hash and records that in
`<db-path>/_ingest_state.json` - already-ingested, unchanged files are
skipped every run, so it's always safe to re-run).

It's a **one-shot script**, not a background daemon - you point your OS's
own scheduler at it (cron, or Windows Task Scheduler) to run it every N
minutes. This was a deliberate choice over a "watch the folder forever"
daemon: nothing to babysit, nothing that needs restarting after a reboot,
and if it fails once, the next scheduled run just picks up where it left
off (failed files are logged and retried next time; successful ones are
never re-processed).

Since your manuals land on your own machine/server rather than in this
GitHub repo, this can't run as a cloud-based Claude Routine - it needs to
run locally where the files actually are. Pick the setup that matches how
you're running the app:

### Option 1 - Running the app directly with Python (Stage A), not Docker

Test it manually first:

```bash
python scripts/watch_and_ingest.py \
    --manuals-dir data/manuals \
    --db-path ./aviation_vector_db \
    --aircraft-model Airbus-A320 \
    --log-file logs/ingest.log
```

Then schedule it:

**Linux / macOS (cron):** run `crontab -e` and add a line to run it every
15 minutes (adjust the path to wherever you cloned this project):

```
*/15 * * * * cd /full/path/to/aviation_rag_project && /full/path/to/aviation_rag_project/.venv/bin/python scripts/watch_and_ingest.py --log-file logs/ingest.log >> logs/cron.log 2>&1
```

**Windows (Task Scheduler):** create a Basic Task -> Trigger: "Repeat task
every 15 minutes" -> Action: "Start a program" ->
Program: `C:\full\path\to\aviation_rag_project\.venv\Scripts\python.exe`,
Arguments: `scripts\watch_and_ingest.py --log-file logs\ingest.log`,
Start in: `C:\full\path\to\aviation_rag_project`.

### Option 2 - Running the app via Docker (Stage C)

The container already has `scripts/` baked in and its `aviation_vector_db`
volume is the same one the API reads from, so run the script *inside the
running container* with `docker exec` - this reaches the same writable
vector-DB volume without needing a second copy of the code or a second
Python environment on the host:

```bash
docker exec aviation_rag_api python scripts/watch_and_ingest.py \
    --manuals-dir /app/data --db-path /app/aviation_vector_db
```

Schedule that same command with cron (Linux/macOS host) or Task Scheduler
(Windows host, calling `docker.exe exec ...`) exactly as in Option 1, just
swapping the command being run. Because `data/` is mounted `:ro` into the
container, `docker exec` can read new manuals but the container still can't
modify or delete your source PDFs - only its own vector-DB volume.

**Confirm before moving on:** pick Option 1 or 2 (whichever matches how
you're actually running the app), drop a real manual PDF into
`data/manuals/`, run the command manually once to see it get ingested, then
set up the cron/Task Scheduler entry. Let me know once it's running and
I'll help verify the schedule is actually firing (e.g. checking
`logs/ingest.log` after the first scheduled run).

### Beyond this (not built - ask if you want it)

- **Cowork/Claude Routine monitoring**, e.g. a Claude session periodically
  checking the server's `/health` endpoint and alerting you if it's down,
  or re-running tests when you push code changes to this repo. This is a
  different kind of "agent" than the ingestion script above (it would run
  in the cloud, watching from the outside, rather than doing local
  filesystem work) - tell me if you want this set up too.

---

## Tests

```bash
pytest tests/ -v
```

## Next steps you may want (not built yet - ask if you want any of these)

- Wiring `/query`'s returned dossier into an actual local LLM (e.g. Ollama
  running Llama-3-8B) instead of returning the raw prompt text.
- Swapping the `data/snag_history.json` mock for a real Maximo Integration
  Framework (MIF) call or a local SQLite mirror.
- Hybrid BM25 + vector search and a cross-encoder reranker, per the
  playbook's Milestone 2.
