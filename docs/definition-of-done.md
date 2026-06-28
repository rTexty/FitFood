# Definition of Done

This document defines the team's minimum completion standard for all product work items (PBIs) in the FitFood repository. A PBI may only be marked `Done` when **all** of the following criteria are satisfied.

This Definition of Done is a maintained project asset. It must continue to govern later Sprints unless explicitly superseded by a later version of this document.

---

## Criteria

### Code quality

- [ ] The code passes `ruff check .` (lint) with no errors.
- [ ] The code passes `ruff format --check .` (format) with no errors.
- [ ] The code passes `mypy app/ --ignore-missing-imports` (type check) with no errors.

### Tests

- [ ] Unit tests are added or updated to cover the changed code in `app/`.
- [ ] Critical modules (`app/routers/`, `app/services/`, `app/models/`) maintain at least 30% automated line coverage as measured by `pytest-cov`.
- [ ] Integration tests cover any new API routes or database interactions.
- [ ] If the PBI relates to a quality requirement (QR-001, QR-002, QR-003), the relevant QRT passes.

### CI

- [ ] All CI jobs pass on the feature branch before the PR is opened for review.
- [ ] The PR CI run is green (lint-and-typecheck, unit-tests, integration-tests, quality-requirement-tests, dependency-scan, link-checker).

### Review

- [ ] The PR is reviewed and approved by at least one other team member who did not implement the change.
- [ ] The reviewer has checked acceptance criteria, test coverage, and CI status.
- [ ] The PR author has not approved their own PR.

### Acceptance criteria

- [ ] All issue-specific acceptance criteria listed in the PBI are satisfied.
- [ ] For user-story issues: all linked supporting PBIs are merged and verified.

### Documentation

- [ ] Relevant documentation in `docs/` is updated where applicable (e.g., `docs/testing.md` if a new test type is added, `docs/quality-requirements.md` if a QR changes).
- [ ] `CHANGELOG.md` is updated under `[Unreleased]` if the change affects the public product.
- [ ] The PR description includes a summary of changes and testing performed.

### Merge

- [ ] The PR is merged into the protected default branch (`main`).
- [ ] No direct pushes to `main` outside of the initial repository setup.

---

## Introduced

Assignment 4, Sprint 4 (2026-06-23 – 2026-06-29).

## Last updated

2026-06-28 — updated to include QRT gate requirements and dependency scan.
