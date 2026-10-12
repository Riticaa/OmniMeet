FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend-gateway/requirements.txt /app/backend-gateway/
RUN pip install --no-cache-dir -r /app/backend-gateway/requirements.txt
RUN pip install --no-cache-dir -r /app/backend-gateway/requirements-translation.txt
RUN pip install --no-cache-dir --no-deps "argostranslate>=1.9.6,<2.0"

# Copy source trees
COPY backend-gateway /app/backend-gateway
COPY frontend /app/frontend
COPY ai-services /app/ai-services
COPY contracts /app/contracts

# Create data directory for persistent SQLite database
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=8000
ENV SQLITE_DB_PATH=/app/data/omnimeet.db
ENV ARGOS_CHUNK_TYPE=MINISBD
ENV ARGOS_DEVICE_TYPE=cpu
ENV ARGOS_COMPUTE_TYPE=int8

EXPOSE 8000

WORKDIR /app/backend-gateway
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
