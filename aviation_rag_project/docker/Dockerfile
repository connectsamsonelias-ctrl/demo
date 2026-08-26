FROM python:3.11-slim

# Keep Python from writing .pyc files / buffering stdout - useful for
# reading container logs live in an air-gapped ops environment.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Run as a non-root user - defense in depth even inside an air-gapped net.
RUN useradd --create-home --shell /bin/bash appuser

COPY app ./app

RUN mkdir -p /app/aviation_vector_db /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
