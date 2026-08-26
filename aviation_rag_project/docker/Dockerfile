FROM python:3.11-slim

# Keep Python from writing .pyc files / buffering stdout - useful for
# reading container logs live in an air-gapped ops environment.
#
# ANONYMIZED_TELEMETRY=FALSE disables chromadb's default (on-by-default)
# PostHog analytics call, which would otherwise try to reach the network
# at runtime. This is defense-in-depth on top of the explicit
# Settings(anonymized_telemetry=False) already passed in app/rag_engine.py.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ANONYMIZED_TELEMETRY=FALSE

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Run as a non-root user - defense in depth even inside an air-gapped net.
RUN useradd --create-home --shell /bin/bash appuser

# --- Bake the local embedding model into the image (air-gap fix) --------
# chromadb's default embedding function downloads a small ONNX model
# (all-MiniLM-L6-v2, ~80MB) from the internet the first time it's used,
# and caches it under the current user's home directory
# (~/.cache/chroma/onnx_models/...). Left alone, that download would
# happen at container *runtime* - which fails (or worse, silently
# succeeds) on a real air-gapped network, breaking this project's whole
# premise.
#
# Fix: trigger that download here, at BUILD time (the one point where
# this Dockerfile needs network access), running as the same `appuser`
# that runs the container - so `Path.home()` resolves to the same
# /home/appuser directory at both build time and runtime, and the model
# is already sitting in the image before the container ever starts.
USER appuser
RUN python -c "\
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2; \
ONNXMiniLM_L6_V2()(['warm up the embedding model cache'])"
USER root

COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser scripts ./scripts

RUN mkdir -p /app/aviation_vector_db /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
