# Quality Requirement Tests

This document defines automated Quality Requirement Tests (QRTs) for FitFood. Each QRT directly verifies one or more measurable scenarios from [`docs/quality-requirements.md`](quality-requirements.md).

---

## QRT-001 — API response time under normal load

**Linked QR:** [QR-001](quality-requirements.md#qr-001)

**Verification method:** Automated HTTP response-time test using `pytest` + `httpx`. Measures p95 latency for `/api/food/search` under simulated concurrent load.

**Test data / setup:** Test database seeded with 100 food items. TestClient from FastAPI used for isolation. Concurrency simulated via `asyncio.gather`.

**Automated command:**
```bash
pytest tests/quality/test_response_time.py -v
```

**CI check:** `quality-requirement-tests` job in `.github/workflows/ci.yml`

**Expected measurable result:** All 20 simulated requests complete within 500 ms; p95 latency ≤ 500 ms.

**Evidence location:** CI artifact `coverage-report`; logs in the `quality-requirement-tests` job of the latest protected-branch CI run.

---

## QRT-002 — Input validation rejects invalid food log entries

**Linked QR:** [QR-002](quality-requirements.md#qr-002)

**Verification method:** Parameterised `pytest` tests sending invalid payloads (empty name, negative calories, oversized body) to `POST /api/food/log` and asserting HTTP 422 with no database writes.

**Test data / setup:** In-memory SQLite test database. Invalid payloads: `{"name": "", "calories": -5}`, `{"name": "X", "calories": -1}`, payload > 10 KB.

**Automated command:**
```bash
pytest tests/quality/test_input_validation.py -v
```

**CI check:** `quality-requirement-tests` job in `.github/workflows/ci.yml`

**Expected measurable result:** All invalid-input cases return HTTP 422 within 200 ms; `SELECT COUNT(*) FROM food_log` equals 0 after each rejected request.

**Evidence location:** CI run logs for the `quality-requirement-tests` job.

---

## QRT-003 — Critical module line coverage ≥ 30 %

**Linked QR:** [QR-003](quality-requirements.md#qr-003)

**Verification method:** `pytest-cov` run over `tests/unit/` targeting `app/routers/`, `app/services/`, and `app/models/`. Coverage threshold enforced with `--cov-fail-under=30`; CI fails if any run falls below.

**Test data / setup:** Standard unit test suite. No external services required.

**Automated command:**
```bash
pytest tests/unit/ --cov=app --cov-report=term-missing --cov-fail-under=30
```

**CI check:** `unit-tests` job and `quality-requirement-tests` job in `.github/workflows/ci.yml`

**Expected measurable result:** pytest-cov exits 0; per-module coverage shown in terminal and `coverage.xml`.

**Evidence location:** CI artifact `coverage-report` (coverage.xml); terminal output in the `unit-tests` job logs.

---

## QRT traceability table

| QRT ID  | Linked QR | CI job                    | Command                                                    | Latest result |
|---------|-----------|---------------------------|------------------------------------------------------------|---------------|
| QRT-001 | QR-001    | quality-requirement-tests | `pytest tests/quality/test_response_time.py`               | See CI        |
| QRT-002 | QR-002    | quality-requirement-tests | `pytest tests/quality/test_input_validation.py`            | See CI        |
| QRT-003 | QR-003    | unit-tests                | `pytest tests/unit/ --cov=app --cov-fail-under=30`         | See CI        |
