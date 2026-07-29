# Address Validation Service

A dual-backend address validation service integrating with the USPS Address API. Provides single address validation, zipcode-city verification, bulk Excel upload processing, and LLM-powered unstructured address parsing.

Built with **Python (FastAPI)** and **Node.js (Express)** — both sharing the same API contract.

## Features

- Validate structured US addresses against USPS
- Verify zipcode-city pairings
- Bulk validate addresses via Excel file upload (up to 1000 rows)
- Parse messy/unstructured address text into structured fields using LLM
- Mock USPS adapter for development (no API key needed)
- Docker-ready with Cloud Run deployment support

## Quick Start

### Python Service

```bash
cd python-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Express Service

```bash
cd express-service
npm install
npx ts-node src/app.ts
```

## API Endpoints

All endpoints are available on both services with identical request/response schemas.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/validate/address` | Validate a structured address |
| POST | `/api/v1/validate/zipcode-city` | Verify zipcode-city match |
| POST | `/api/v1/validate/parse` | Parse raw text + validate |
| POST | `/api/v1/validate/bulk` | Bulk validate via Excel upload |

### Example: Validate Address

```bash
curl -X POST http://localhost:8000/api/v1/validate/address \
  -H "Content-Type: application/json" \
  -d '{
    "street_line_1": "1600 Pennsylvania Ave NW",
    "city": "Washington",
    "state": "DC",
    "zipcode": "20500"
  }'
```

Response:
```json
{
  "original_address": { "street_line_1": "1600 Pennsylvania Ave NW", "city": "Washington", "state": "DC", "zipcode": "20500" },
  "standardized_address": { "street_line_1": "1600 PENNSYLVANIA AVE NW", "city": "WASHINGTON", "state": "DC", "zipcode": "20500" },
  "status": "valid"
}
```

### Example: Zipcode-City Verification

```bash
curl -X POST http://localhost:8000/api/v1/validate/zipcode-city \
  -H "Content-Type: application/json" \
  -d '{"zipcode": "20500", "city": "Washington"}'
```

### Example: Parse Raw Address

```bash
curl -X POST http://localhost:8000/api/v1/validate/parse \
  -H "Content-Type: application/json" \
  -d '{"raw_address": "1600 Pennsylvania Ave NW, Washington, DC 20500"}'
```

## Project Structure

```
address-lookup/
├── python-service/           # FastAPI backend
│   ├── app/
│   │   ├── main.py          # App entrypoint
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic
│   │   ├── adapters/        # USPS integration (mock + real)
│   │   ├── parsers/         # LLM address parser
│   │   └── models/          # Pydantic data models
│   ├── tests/               # Unit, integration, property tests
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── deploy.sh            # Cloud Run deployment
│   └── requirements.txt
│
├── express-service/          # Express.js backend
│   ├── src/
│   │   ├── app.ts           # App entrypoint
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic
│   │   ├── adapters/        # USPS integration (mock + real)
│   │   ├── parsers/         # LLM address parser
│   │   └── models/          # TypeScript interfaces
│   ├── tests/               # Unit, integration tests
│   ├── Dockerfile
│   └── package.json
│
└── .kiro/specs/              # Design specifications
```

## Architecture

The service uses a **layered architecture** with an **adapter pattern** for USPS integration:

1. **HTTP Layer** — Route handlers, request validation, response formatting
2. **Service Layer** — Validation orchestration, normalization, bulk processing
3. **Adapter Layer** — External integrations (USPS API, LLM service)

The adapter factory selects mock or real USPS based on the `USPS_API_KEY` environment variable.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `USPS_API_KEY` | `mock` | Use "mock" for development, real USPS key for production |
| `PORT` | `8000` / `3000` | Server port (Cloud Run sets 8080) |
| `GCP_PROJECT_ID` | — | Required for Cloud Run deployment |

## Running Tests

```bash
# Python — 113 tests
cd python-service
python -m pytest tests/ -q

# Express — 140 tests
cd express-service
npx jest --forceExit
```

## Docker

```bash
# Python service
cd python-service
docker compose up --build

# Express service
cd express-service
docker build -t express-address-service .
docker run -p 3000:3000 -e USPS_API_KEY=mock express-address-service
```

## Cloud Run Deployment

```bash
cd python-service
export GCP_PROJECT_ID=your-project-id
./deploy.sh
```

Post-deploy verification:
```bash
./smoke_test.sh https://your-service-url.run.app
```

## LLM Integration / Amazon Bedrock

The LLM Parser module is designed for easy integration with any LLM provider. **Amazon Bedrock is fully compatible** — the parser interface is isolated so you can swap in Bedrock (e.g., Claude via `bedrock-runtime`) without changing any other part of the service.

To integrate:
1. Install AWS SDK (`boto3` for Python / `@aws-sdk/client-bedrock-runtime` for Node.js)
2. Update the parser module to call `InvokeModel`
3. Set AWS credentials via environment or IAM role

## Tech Stack

| Component | Python Service | Express Service |
|-----------|---------------|-----------------|
| Framework | FastAPI | Express.js |
| Language | Python 3.11 | TypeScript |
| Testing | pytest + Hypothesis | Jest + fast-check |
| Containerization | Docker (multi-stage) | Docker (multi-stage) |
| Deployment | Google Cloud Run | Docker |

## License

Internal project.
