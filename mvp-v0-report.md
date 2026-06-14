# MVP v0 — Smoke-check Report

**Link to service:** https://456-ten.vercel.app

## Description

A basic backend framework on FastAPI with a single endpoint `/health` returning `{"status": "ok"}`.

## Uses

- Python 3.14+
- FastAPI 0.111.0
- Uvicorn 0.30.1

## Local Run

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Check (Smoke Test)

### Step 1. Open the service's root URL

```
GET https://456-ten.vercel.app/
```

**Expected result:** documentation page with FastAPI (Swagger UI).

### Step 2. Call the /health endpoint

```
GET https://456-ten.vercel.app/health
```

**Expected result:** HTTP 200 OK, response body:

```json
{"status":"ok"}
```

### Step 3. Check Swagger documentation

```
GET https://456-ten.vercel.app/docs
```

**Expected result:** Swagger UI page with a single endpoint `/health`.

### Step 4. Run a request via curl (CLI)

```bash
curl -s https://456-ten.vercel.app/health
```

**Expected result:**

```json
{"status":"ok"}
```

## Result

- [x] Endpoint `/health` returns `{"status":"ok"}`
- [x] Service responds with HTTP 200
- [x] Swagger documentation is available at `/docs`

## Deploy

Link to service: `https://456-ten.vercel.app/health`
