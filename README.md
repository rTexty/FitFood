# FitFood

Smart nutrition assistant for managing fridge inventory, reducing food waste,
and generating meal ideas from available products.

## Backend Stack

- FastAPI + SQLAlchemy 2 + Pydantic 2
- Python 3.12
- SQLite by default
- Pytest for backend verification

## Local Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

OpenAPI is available at http://localhost:8000/docs.

## Docker Backend

Copy the sample environment file first:

```bash
cp .env.example .env
```

Build and run the API image:

```bash
docker build -f Dockerfile.backend -t fitfood/backend:local .
docker run --rm \
  --env-file .env \
  -p 8000:8000 \
  -v fitfood_data:/app/data \
  fitfood/backend:local
```

The SQLite database is stored in the `fitfood_data` volume.

## Smoke Tests

Run these checks after the API starts:

```bash
curl -fsS http://localhost:8000/api/v1/health
curl -fsS http://localhost:8000/api/v1/fridges
curl -fsS http://localhost:8000/api/v1/recipes
```

Create and read an inventory item:

```bash
curl -fsS -X POST http://localhost:8000/api/v1/fridges/1/inventory-items \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Greek yogurt","quantity":1,"unit":"cup","category":"Dairy"}'

curl -fsS http://localhost:8000/api/v1/fridges/1/inventory-items
```

Expected result: responses use the API envelope with a top-level `data` field,
and invalid requests return a structured `error` object.

## Tests

```bash
pytest
```

## Environment Variables

See [`.env.example`](.env.example). Keep provider and LLM API keys backend-only;
do not expose them in frontend code or committed files.
