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

EXPOSE 8000

WORKDIR /app/backend-gateway
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
