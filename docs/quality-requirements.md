# Quality Requirements

This document defines the quality requirements for FitFood. Requirements follow ISO/IEC 25010 and use measurable scenario format. Each requirement is linked to at least one automated Quality Requirement Test (QRT) in [`docs/quality-requirement-tests.md`](quality-requirement-tests.md).

---

## QR-001 — API response time (time behaviour)

**ISO/IEC 25010 sub-characteristic:** Performance efficiency — Time behaviour

**Rationale:** FitFood users search and log food items frequently during meals. Slow API responses break the logging flow and reduce product usability. Users expect near-instant feedback when querying nutritional data.

**Measurable scenario:**

```
When a registered user submits a food search query of up to 50 characters
under normal load (up to 20 concurrent users),
the /api/food/search endpoint shall return an HTTP 200 response
within 500 ms (p95).
```

**Linked QRTs:** [QRT-001](quality-requirement-tests.md#qrt-001)

---

## QR-002 — Input validation and data integrity (integrity)

**ISO/IEC 25010 sub-characteristic:** Security — Integrity

**Rationale:** FitFood stores user-submitted food log entries and nutritional data. Accepting malformed or out-of-range inputs (negative calories, empty names, SQL injection attempts) corrupts the database and degrades trust in nutrition summaries.

**Measurable scenario:**

```
When any client submits a food log entry with invalid data
(empty name, negative calorie value, or oversized payload >10 KB)
under any environment,
the API shall reject the request with HTTP 422 and return
a structured error body within 200 ms, without persisting any data.
```

**Linked QRTs:** [QRT-002](quality-requirement-tests.md#qrt-002)

---

## QR-003 — Critical module test coverage (testability)

**ISO/IEC 25010 sub-characteristic:** Maintainability — Testability

**Rationale:** FitFood's core logic (food search, calorie calculation, meal logging) must remain verifiable as the team adds features each Sprint. Low test coverage of critical modules makes regressions undetectable and raises the cost of change.

**Measurable scenario:**

```
When the automated test suite runs on any commit to the protected default branch,
the critical modules (app/routers/, app/services/, app/models/)
shall each achieve at least 30% automated line coverage,
as reported by pytest-cov.
```

**Linked QRTs:** [QRT-003](quality-requirement-tests.md#qrt-003)

---

## Quality model summary

| ID     | ISO/IEC 25010 sub-characteristic     | Verified by |
|--------|--------------------------------------|-------------|
| QR-001 | Performance efficiency — Time behaviour | QRT-001  |
| QR-002 | Security — Integrity                 | QRT-002     |
| QR-003 | Maintainability — Testability        | QRT-003     |
