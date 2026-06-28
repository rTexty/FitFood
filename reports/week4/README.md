# FitFood

A food-tracking web application that lets users search for food items, log meals, and monitor daily calorie and macronutrient intake.

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, SQLite
- **Frontend:** TypeScript (see `frontend/`)
- **CI:** GitHub Actions

## Local setup

```bash
# 1. Clone the repository
git clone https://github.com/rTexty/FitFood.git
cd FitFood

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy and configure environment variables
cp .env.example .env
# Edit .env as needed

# 5. Run the development server
uvicorn main:app --reload
```

The API is available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

## Running tests

```bash
# Unit tests with coverage
pytest tests/unit/ --cov=app --cov-report=term-missing

# Integration tests
pytest tests/integration/ -v

# All tests
pytest tests/ -v
```

## Deployed product

_(Link to the deployed application)_

## Documentation

| Document | Path |
|---|---|
| Roadmap | [`docs/roadmap.md`](docs/roadmap.md) |
| Definition of Done | [`docs/definition-of-done.md`](docs/definition-of-done.md) |
| Quality requirements | [`docs/quality-requirements.md`](docs/quality-requirements.md) |
| Testing status | [`docs/testing.md`](docs/testing.md) |
| Week 4 report | [`reports/week4/README.md`](reports/week4/README.md) |

## License

MIT License — see [`LICENSE`](LICENSE).
