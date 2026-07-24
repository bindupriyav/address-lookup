# Stage 1: Builder - install dependencies
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production - copy only needed files
FROM python:3.11-slim

WORKDIR /app

# Copy installed dependencies from builder stage
COPY --from=builder /install /usr/local

# Copy application code
COPY app/ ./app/

EXPOSE 8000

# Use parameterized CMD so Cloud Run can override PORT to 8080
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
