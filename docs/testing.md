# Testing

This document is the canonical testing status artifact for FitFood. It is maintained as a project asset and updated each Sprint.

---

## Critical Modules and Coverage

Critical modules are source files responsible for core user workflows, persistence, business rules, or security — where defects would materially affect the product.

| Critical module      | Why critical                                    | Required line coverage | Current line coverage | Evidence                           |
|----------------------|-------------------------------------------------|----------------------:|----------------------:|------------------------------------|
| `app/routers/`       | All API endpoints; main user workflow entry     | 30%                   | _see latest CI_       | [CI run — unit-tests job](https://github.com/rTexty/FitFood/actions) |
| `app/services/`      | Calorie calculation and food-search logic       | 30%                   | _see latest CI_       | [CI run — unit-tests job](https://github.com/rTexty/FitFood/actions) |
| `app/models/`        | SQLAlchemy models; data persistence             | 30%                   | _see latest CI_       | [CI run — unit-tests job](https://github.com/rTexty/FitFood/actions) |

Coverage is reported by `pytest-cov` and enforced by `--cov-fail-under=30` in the `unit-tests` CI job. The XML report is uploaded as the `coverage-report` artifact.

---

## Automated Test Status

| Test type                    | Scope                                        | Command or CI check                                          | Latest result | Evidence                           |
|------------------------------|----------------------------------------------|--------------------------------------------------------------|---------------|------------------------------------|
| Unit tests                   | Critical product logic (routers, services, models) | `pytest tests/unit/ --cov=app --cov-fail-under=30`      | See CI        | [CI run](https://github.com/rTexty/FitFood/actions) |
| Integration tests            | API routes + SQLite database interaction     | `pytest tests/integration/ -v`                               | See CI        | [CI run](https://github.com/rTexty/FitFood/actions) |
| Automated QRTs (QRT-001)     | API response time ≤ 500 ms p95               | `pytest tests/quality/test_response_time.py`                 | See CI        | [CI run](https://github.com/rTexty/FitFood/actions) |
| Automated QRTs (QRT-002)     | Input validation — HTTP 422 on invalid data  | `pytest tests/quality/test_input_validation.py`              | See CI        | [CI run](https://github.com/rTexty/FitFood/actions) |
| Automated QRTs (QRT-003)     | Coverage threshold ≥ 30% on critical modules | `pytest tests/unit/ --cov=app --cov-fail-under=30`           | See CI        | [CI run](https://github.com/rTexty/FitFood/actions) |

---

## CI and QA Check Status

| Gate or check                 | Required for Done? | Latest protected-branch status | Evidence                                          |
|-------------------------------|--------------------|-------------------------------|---------------------------------------------------|
| Ruff lint                     | Yes                | See CI                        | [CI run — lint-and-typecheck job](https://github.com/rTexty/FitFood/actions) |
| Ruff format check             | Yes                | See CI                        | [CI run — lint-and-typecheck job](https://github.com/rTexty/FitFood/actions) |
| Mypy type check               | Yes                | See CI                        | [CI run — lint-and-typecheck job](https://github.com/rTexty/FitFood/actions) |
| Unit tests (≥ 30% coverage)   | Yes                | See CI                        | [CI run — unit-tests job](https://github.com/rTexty/FitFood/actions) |
| Integration tests             | Yes                | See CI                        | [CI run — integration-tests job](https://github.com/rTexty/FitFood/actions) |
| Quality requirement tests     | Yes                | See CI                        | [CI run — quality-requirement-tests job](https://github.com/rTexty/FitFood/actions) |
| Dependency vulnerability scan | Yes                | See CI                        | [CI run — dependency-scan job](https://github.com/rTexty/FitFood/actions) |
| Lychee link checker           | Yes                | Passing (see Actions)         | [CI run — Link Checker](https://github.com/rTexty/FitFood/actions) |

---

## Additional QA Check Rationale

| QA objective or risk | Additional QA check | Scope | Latest result | Evidence | Limitations or follow-up |
|---|---|---|---|---|---|
| Dependencies with known CVEs may expose users or the deployment to avoidable security risk. | Automated dependency vulnerability scan (`pip-audit`). | `requirements.txt` and resolved package set. | See CI | `pip-audit-report` artifact in the `dependency-scan` CI job. | Some advisories require manual triage or delayed upstream fixes; results are reviewed on each PR. |

---

## Manual Evidence That Does Not Count as QRT

| Evidence | Scope | Result | Follow-up PBI or issue |
|---|---|---|---|
| Customer UAT observation (Sprint Review session) | Food logging and search workflow | Passed with minor wording feedback on empty state | See customer feedback table in `reports/week4/README.md` |

---

## Continuation of Quality Gates

All gates introduced in Assignment 4 remain active for later project work. Later PRs and commits to the protected default branch must continue to pass linting, type checking, unit tests (≥ 30% coverage on critical modules), integration tests, QRTs, and the dependency scan. If a product change makes a specific check obsolete, a replacement check of equal or greater strictness must be added and the reason documented in this file.
